import { newId } from "../core/ids.js";
import { AppError, conflict } from "../core/errors.js";
import { verifyTotp } from "../security/auth.js";
import { maskPIIInText } from "../security/redact.js";

export class ApprovalService {
  constructor(db, clock, audit) {
    this.db = db;
    this.clock = clock;
    this.audit = audit;
  }

  create({ runId, stepId, envelope, ttlMs }) {
    const id = newId("appr");
    const now = this.clock.nowIso();
    const expiresAt = new Date(this.clock.nowMs() + ttlMs).toISOString();
    const full = { ...envelope, approval_id: id, expires_at: expiresAt };
    this.db
      .prepare(
        "INSERT INTO approvals(id, run_id, step_id, envelope_json, status, expires_at, created_at) " +
          "VALUES(?,?,?,?, 'pending', ?, ?)",
      )
      .run(id, runId, stepId, JSON.stringify(full), expiresAt, now);
    this.audit.append({
      trace_id: envelope.trace_id,
      run_id: runId,
      step_id: stepId,
      node_id: envelope.node_id,
      event_type: "approval.requested",
      payload: {
        approval_id: id,
        tool: full.tool,
        amount_cents: full.impact?.amount_cents ?? 0,
        required_auth: full.required_auth,
        expires_at: expiresAt,
        summary: maskPIIInText(full.intent_summary || ""),
      },
    });
    return this.get(id);
  }

  get(id) {
    const row = this.db.prepare("SELECT * FROM approvals WHERE id=?").get(id);
    if (!row) return null;
    return { ...row, envelope: JSON.parse(row.envelope_json) };
  }

  decide({ id, approverId, decision, authMethod = "", code = "", challenge = "", expectedUserId = null }) {
    const row = this.get(id);
    if (!row) throw new AppError("APPROVAL_NOT_FOUND", "审批不存在", { status: 404 });
    if (row.status !== "pending") throw conflict("审批已处理", { status: row.status });
    if (row.expires_at <= this.clock.nowIso()) {
      this.db.prepare("UPDATE approvals SET status='expired', decided_at=? WHERE id=?").run(this.clock.nowIso(), id);
      this.audit.append({
        trace_id: row.envelope.trace_id,
        run_id: row.run_id,
        step_id: row.step_id,
        event_type: "approval.expired",
        payload: { approval_id: id },
      });
      throw new AppError("APPROVAL_EXPIRED", "审批已过期，请重新发起", { status: 409 });
    }

    if (expectedUserId && approverId !== expectedUserId) {
      throw new AppError("APPROVER_MISMATCH", "审批人必须是当前用户", { status: 403 });
    }

    if (decision === "reject") {
      this.db
        .prepare("UPDATE approvals SET status='rejected', approver_id=?, auth_method=?, decided_at=? WHERE id=?")
        .run(approverId, authMethod || "user_reject", this.clock.nowIso(), id);
      this.audit.append({
        trace_id: row.envelope.trace_id,
        run_id: row.run_id,
        step_id: row.step_id,
        event_type: "approval.rejected",
        payload: { approval_id: id, approver_id: approverId },
      });
      return this.get(id);
    }

    if (decision !== "approve") throw new AppError("BAD_DECISION", "未知审批决定", { status: 400 });

    const required = row.envelope.required_auth || "none";
    if (required === "totp") {
      if (challenge && row.envelope.challenge && challenge !== row.envelope.challenge) {
        throw new AppError("CHALLENGE_MISMATCH", "交易挑战不匹配，请重新确认", { status: 403 });
      }
      const user = this.db.prepare("SELECT * FROM users WHERE id=?").get(approverId);
      if (!user) throw new AppError("APPROVER_NOT_FOUND", "审批人不存在", { status: 404 });
      if (!verifyTotp(user.totp_secret, code, this.clock.nowMs())) {
        throw new AppError("TOTP_INVALID", "验证码错误或已过期", { status: 403 });
      }
      authMethod = "totp";
    }

    this.db
      .prepare("UPDATE approvals SET status='approved', approver_id=?, auth_method=?, decided_at=? WHERE id=?")
      .run(approverId, authMethod || required, this.clock.nowIso(), id);
    this.audit.append({
      trace_id: row.envelope.trace_id,
      run_id: row.run_id,
      step_id: row.step_id,
      event_type: "approval.granted",
      payload: {
        approval_id: id,
        approver_id: approverId,
        auth_method: authMethod || required,
        challenge: row.envelope.challenge ?? null,
      },
    });
    return this.get(id);
  }
}
