import { config } from "../config.js";
import { newId, newNonce } from "../core/ids.js";
import { hmacHex, paramsHash, safeEqualHex } from "../core/canonical.js";
import { AppError } from "../core/errors.js";

function sign(secret, id, hash, expiresAt) {
  return hmacHex(secret, `${id}:${hash}:${expiresAt}`);
}

export class PermitService {
  constructor(db, clock, secret = config.permitSecret) {
    this.db = db;
    this.clock = clock;
    this.secret = secret;
  }

  issue({
    run_id,
    step_id,
    subject,
    tool,
    params,
    max_amount_cents = 0,
    decision,
    auth_level,
    approver_ids = [],
    policy_version = config.policyVersion,
    ttl_ms = config.permitTtlYellowMs,
  }) {
    const id = newId("permit");
    const nonce = newNonce();
    const hash = paramsHash(params);
    const issuedAt = this.clock.nowIso();
    const expiresAt = new Date(this.clock.nowMs() + ttl_ms).toISOString();
    this.db
      .prepare(
        "INSERT INTO permits(id, run_id, step_id, subject, tool, params_hash, max_amount_cents, decision, auth_level, " +
          "approver_ids, policy_version, issued_at, expires_at, nonce, used) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)",
      )
      .run(
        id, run_id, step_id, subject, tool, hash, max_amount_cents, decision, auth_level,
        JSON.stringify(approver_ids), policy_version, issuedAt, expiresAt, nonce,
      );
    return {
      permit_id: id,
      token: `${id}.${sign(this.secret, id, hash, expiresAt)}`,
      params_hash: hash,
      expires_at: expiresAt,
      decision,
      auth_level,
    };
  }

  get(id) {
    return this.db.prepare("SELECT * FROM permits WHERE id=?").get(id);
  }

  verify({ token, tool, params, subject, amount_cents = 0 }) {
    if (!token || typeof token !== "string" || !token.includes(".")) {
      throw new AppError("PERMIT_MISSING", "缺少执行许可", { status: 403 });
    }
    const [id, sig] = token.split(".");
    const row = this.get(id);
    if (!row) throw new AppError("PERMIT_NOT_FOUND", "执行许可不存在", { status: 403 });
    const expected = sign(this.secret, row.id, row.params_hash, row.expires_at);
    if (!safeEqualHex(sig, expected)) throw new AppError("PERMIT_SIGNATURE_INVALID", "执行许可签名无效", { status: 403 });
    if (row.used) throw new AppError("PERMIT_REPLAYED", "执行许可已被使用", { status: 403 });
    if (row.expires_at <= this.clock.nowIso()) throw new AppError("PERMIT_EXPIRED", "执行许可已过期", { status: 403 });
    if (row.subject !== subject) throw new AppError("PERMIT_SUBJECT_MISMATCH", "执行许可主体不匹配", { status: 403 });
    if (row.tool !== tool) throw new AppError("PERMIT_TOOL_MISMATCH", "执行许可工具不匹配", { status: 403 });
    if (paramsHash(params) !== row.params_hash) throw new AppError("PERMIT_PARAMS_MISMATCH", "执行许可参数不匹配", { status: 403 });
    if (amount_cents > row.max_amount_cents) throw new AppError("PERMIT_AMOUNT_EXCEEDED", "执行许可金额超限", { status: 403 });

    const upd = this.db
      .prepare("UPDATE permits SET used=1, used_at=? WHERE id=? AND used=0")
      .run(this.clock.nowIso(), row.id);
    if (upd.changes !== 1) throw new AppError("PERMIT_REPLAYED", "执行许可已被使用", { status: 403 });
    return { ...row, used: 1, used_at: this.clock.nowIso() };
  }
}
