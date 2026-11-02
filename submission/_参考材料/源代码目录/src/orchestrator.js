import { sanitizeInput } from "./security/injection.js";
import { proposeIntent } from "./intent/llm.js";

function route(proposal) {
  if (["transfer.create", "transfer.schedule"].includes(proposal.intent)) return "transfer";
  if (["bill.analyze", "bill.anomaly"].includes(proposal.intent)) return "bill";
  if (proposal.intent === "birthday.plan") return "birthday";
  return "direct";
}

function replyFromView(view) {
  const state = view.state || {};
  const outputs = state.outputs || {};
  for (const key of ["N8", "B3", "P7", "O4", "D0"]) {
    if (outputs[key]?.text) return outputs[key].text;
  }
  if (view.run.status === "awaiting_user") {
    const last = view.audit.filter((e) => e.event_type === "run.interrupted").at(-1);
    return last?.payload?.message || "需要你补充信息或确认操作。";
  }
  if (view.run.status === "failed") {
    const last = view.audit.filter((e) => e.event_type === "node.failed").at(-1);
    return last?.payload?.message || "操作未完成，请稍后重试。";
  }
  if (view.run.status === "completed") return "操作已完成。";
  return "处理中。";
}

export class Orchestrator {
  constructor({ engine, clock, audit, db, llm = { proposeIntent } }) {
    this.engine = engine;
    this.clock = clock;
    this.audit = audit;
    this.db = db;
    this.llm = llm;
  }

  async handleMessage({ userId, text, channel = "APP" }) {
    const { clean } = sanitizeInput(text);
    const proposal = await this.llm.proposeIntent({ text: clean, clock: this.clock });
    const scenario = route(proposal);
    const view = await this.engine.start({
      userId,
      scenario,
      input: { text: clean, channel, proposal },
    });
    return {
      run_id: view.run.id,
      trace_id: view.run.trace_id,
      scenario,
      proposal,
      reply: replyFromView(view),
      view,
    };
  }

  async handleClarify(runId, text) {
    const view = await this.engine.resume(runId, { text });
    return { run_id: runId, reply: replyFromView(view), view };
  }

  async handleApproval(runId, { approvalId, decision, code = "", challenge = "" }) {
    const view = await this.engine.resume(runId, { approval_id: approvalId, decision, code, challenge });
    return { run_id: runId, reply: replyFromView(view), view };
  }

  async handleCancel(runId, reason = "user_cancel") {
    const view = this.engine.cancel(runId, reason);
    return { run_id: runId, reply: replyFromView(view), view };
  }

  async handleUndo(runId) {
    const view = this.engine.undo(runId);
    return { run_id: runId, reply: "已撤销本次操作，并完成资金/订单补偿。", view };
  }

  getRun(runId) {
    return this.engine.view(runId);
  }

  listRuns(userId = null) {
    const rows = userId
      ? this.db.prepare("SELECT * FROM runs WHERE user_id=? ORDER BY created_at DESC LIMIT 20").all(userId)
      : this.db.prepare("SELECT * FROM runs ORDER BY created_at DESC LIMIT 20").all();
    return rows;
  }

  safetySummary() {
    const stats = this.audit.stats();
    const decisions = this.db
      .prepare("SELECT payload_json FROM audit_events WHERE event_type='policy.evaluated'")
      .all()
      .map((r) => JSON.parse(r.payload_json));
    const byTier = {};
    const byReason = {};
    for (const d of decisions) {
      byTier[d.tier] = (byTier[d.tier] || 0) + 1;
      for (const r of d.reason_codes || []) byReason[r] = (byReason[r] || 0) + 1;
    }
    const breakers = this.db.prepare("SELECT * FROM breaker_state").all();
    const pendingApprovals = this.db.prepare("SELECT COUNT(*) AS c FROM approvals WHERE status='pending'").get().c;
    const blocked = this.db.prepare("SELECT COUNT(*) AS c FROM audit_events WHERE event_type IN ('injection.detected','hallucination.blocked','permit.denied','tool.failed')").get().c;
    const killSwitch = this.db.prepare("SELECT value FROM system_state WHERE key='kill_switch'").get()?.value === "true";
    return { stats, byTier, byReason, breakers, pendingApprovals, blocked_signals: blocked, kill_switch: killSwitch };
  }
}
