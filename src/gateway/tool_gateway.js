import { config } from "../config.js";
import { newId, newNonce } from "../core/ids.js";
import { hmacHex, sha256Hex, paramsHash, safeEqualHex, canonicalJson } from "../core/canonical.js";
import { AppError, forbidden, conflict } from "../core/errors.js";
import { getManifest } from "./manifests.js";
import * as idempotency from "./idempotency.js";
import { sanitizeToolResult, detectInjection } from "../security/injection.js";
import { maskPIIInText } from "../security/redact.js";

function compensationSign(secret, id, tool, hash, runId, nodeId) {
  return hmacHex(secret, `${id}:${tool}:${hash}:${runId}:${nodeId}`);
}

export class ToolGateway {
  constructor({ db, clock, permits, breaker, audit, secret = config.permitSecret }) {
    this.db = db;
    this.clock = clock;
    this.permits = permits;
    this.breaker = breaker;
    this.audit = audit;
    this.secret = secret;
  }

  buildParams(tool, params, ctx) {
    const manifest = getManifest(tool);
    const normalized = manifest.validate(params || {});
    return { manifest, params: normalized };
  }

  issueCompensation({ run_id, node_id, tool, params, compensationTool }) {
    const id = newId("comp");
    const hash = paramsHash(params);
    const token = `${id}.${compensationSign(this.secret, id, compensationTool, hash, run_id, node_id)}`;
    this.db
      .prepare(
        "INSERT INTO compensations(id, run_id, node_id, token_hash, tool, params_hash, params_json, status, created_at) " +
          "VALUES(?,?,?,?,?,?,?, 'available', ?)",
      )
      .run(id, run_id, node_id, sha256Hex(token), compensationTool, hash, canonicalJson(params), this.clock.nowIso());
    return { token, tool: compensationTool, params_hash: hash };
  }

  compensate({ token, ctx }) {
    if (!token || !token.includes(".")) throw new AppError("COMPENSATION_MISSING", "缺少补偿令牌", { status: 403 });
    const [id, sig] = token.split(".");
    const row = this.db.prepare("SELECT * FROM compensations WHERE id=?").get(id);
    if (!row) throw new AppError("COMPENSATION_NOT_FOUND", "补偿令牌不存在", { status: 403 });
    if (row.status !== "available") throw new AppError("COMPENSATION_USED", "补偿令牌已使用", { status: 409 });
    const expected = compensationSign(this.secret, id, row.tool, row.params_hash, row.run_id, row.node_id);
    if (!safeEqualHex(sig, expected)) throw new AppError("COMPENSATION_SIGNATURE_INVALID", "补偿令牌签名无效", { status: 403 });
    const params = JSON.parse(row.params_json);
    const manifest = getManifest(row.tool);
    if (!manifest.compensation_only) throw new AppError("NOT_A_COMPENSATION_TOOL", "该工具不是补偿工具", { status: 403 });

    const upd = this.db
      .prepare("UPDATE compensations SET status='used', used_at=? WHERE id=? AND status='available'")
      .run(this.clock.nowIso(), id);
    if (upd.changes !== 1) throw new AppError("COMPENSATION_USED", "补偿令牌已使用", { status: 409 });

    try {
      const data = manifest.handler(params, { ...ctx, compensation: true, permitId: null, idempotencyKey: `comp:${id}` });
      const result = this.sanitize(data);
      this.audit.append({
        trace_id: ctx.traceId,
        run_id: ctx.runId,
        step_id: ctx.stepId,
        node_id: ctx.nodeId,
        event_type: "compensation.completed",
        payload: { tool: row.tool, params_hash: row.params_hash, result_digest: sha256Hex(result) },
      });
      return { data: result, digest: sha256Hex(result), tool: row.tool };
    } catch (err) {
      this.audit.append({
        trace_id: ctx.traceId,
        run_id: ctx.runId,
        step_id: ctx.stepId,
        node_id: ctx.nodeId,
        event_type: "compensation.failed",
        payload: { tool: row.tool, error: String(err.message || err) },
      });
      throw err;
    }
  }

  sanitize(data) {
    // 保留结构，附加脱敏副本；不把自由文本当指令。
    if (data && typeof data === "object") {
      const clone = JSON.parse(JSON.stringify(data));
      if (typeof clone.memo === "string") clone.memo = maskPIIInText(clone.memo).slice(0, 120);
      if (typeof clone.note === "string") clone.note = maskPIIInText(clone.note).slice(0, 200);
      if (typeof clone.merchant === "string") clone.merchant = maskPIIInText(clone.merchant).slice(0, 80);
      return clone;
    }
    return sanitizeToolResult(data);
  }

  invoke({ tool, params, ctx, permit_token = null, idempotency_key = null }) {
    const manifest = getManifest(tool);
    if (manifest.compensation_only) throw forbidden("补偿工具只能通过补偿令牌调用");
    const built = this.buildParams(tool, params, ctx);
    const normalized = built.params;
    const key = idempotency_key || ctx.idempotencyKey || null;
    const requestHash = paramsHash(normalized);

    if (key) {
      const existing = idempotency.getExisting(this.db, key, tool, requestHash);
      if (existing) {
        this.audit.append({
          trace_id: ctx.traceId, run_id: ctx.runId, step_id: ctx.stepId, node_id: ctx.nodeId,
          event_type: "tool.replayed",
          payload: { tool, idempotency_key: key, params_hash: requestHash },
        });
        return { ...existing.response, replayed: true, manifest };
      }
    }

    let permit = null;
    if (manifest.permit_required) {
      if (!permit_token) throw new AppError("PERMIT_MISSING", "缺少执行许可", { status: 403 });
      permit = this.permits.verify({
        token: permit_token,
        tool,
        params: normalized,
        subject: ctx.userId,
        amount_cents: normalized.amount_cents || 0,
      });
    } else if (!manifest.read_only && !manifest.permit_required) {
      // 非资金类显式同意（如日历授权）仍要求会话主体，不走 Permit。
    }

    if (manifest.idempotency_required && !key) {
      throw new AppError("IDEMPOTENCY_KEY_REQUIRED", "写操作必须携带幂等键", { status: 400 });
    }

    try {
      const data = manifest.handler(normalized, {
        ...ctx,
        permitId: permit?.id ?? null,
        idempotencyKey: key,
      });
      const clean = this.sanitize(data);
      const digest = sha256Hex(clean);
      const scan = detectInjection(sanitizeToolResult(clean));
      const tainted = scan.level === "high";
      if (tainted) {
        this.breaker.recordInjection(ctx.userId, `tool_injection:${tool}`);
        this.audit.append({
          trace_id: ctx.traceId, run_id: ctx.runId, step_id: ctx.stepId, node_id: ctx.nodeId,
          event_type: "injection.detected",
          payload: { source: `tool:${tool}`, level: scan.level, score: scan.score, hits: scan.hits.map((h) => h.pattern) },
        });
      }

      let compensation = null;
      if (manifest.compensation_tool) {
        const compParams = manifest.compensation_params
          ? manifest.compensation_params(clean, normalized, ctx)
          : {};
        compensation = this.issueCompensation({
          run_id: ctx.runId,
          node_id: ctx.nodeId,
          tool,
          params: compParams,
          compensationTool: manifest.compensation_tool,
        });
      }

      const response = { data: clean, digest, compensation, tool, manifest_hash: manifest.manifest_hash, tainted };
      if (key) idempotency.save(this.db, key, tool, requestHash, response, this.clock.nowIso());

      this.audit.append({
        trace_id: ctx.traceId, run_id: ctx.runId, step_id: ctx.stepId, node_id: ctx.nodeId,
        event_type: "tool.executed",
        payload: {
          tool,
          params: normalized,
          params_hash: requestHash,
          result_digest: digest,
          idempotency_key: key,
          permit_id: permit?.id ?? null,
          compensation_tool: manifest.compensation_tool ?? null,
        },
      });
      return { ...response, replayed: false, permit };
    } catch (err) {
      const state = this.breaker.recordFailure(ctx.userId, `tool_failure:${tool}`);
      this.audit.append({
        trace_id: ctx.traceId, run_id: ctx.runId, step_id: ctx.stepId, node_id: ctx.nodeId,
        event_type: "tool.failed",
        payload: { tool, params_hash: requestHash, error: String(err.message || err), breaker_state: state.state },
      });
      throw err;
    }
  }
}
