import { newNonce } from "../../core/ids.js";
import { paramsHash } from "../../core/canonical.js";
import { formatCents } from "../../core/money.js";
import { TRUST } from "../../security/facts.js";

export function addFact(ctx, type, value, { source = "system", trust = TRUST.SYSTEM, toolCallId = null } = {}) {
  return ctx.facts.add({ type, value, source, trust, tool_call_id: toolCallId });
}

export function userFacts(ctx, text, proposal) {
  const refs = [];
  refs.push(addFact(ctx, "user_text", text, { source: "user_turn", trust: TRUST.USER }).id);
  if (proposal?.slots?.amount_cents) {
    refs.push(addFact(ctx, "amount", { amount_cents: proposal.slots.amount_cents }, { source: "user_turn", trust: TRUST.USER }).id);
  }
  if (proposal?.slots?.payee_name) {
    refs.push(addFact(ctx, "payee_name", proposal.slots.payee_name, { source: "user_turn", trust: TRUST.USER }).id);
  }
  return refs;
}

export function policyFacts(ctx, policy) {
  const f = addFact(ctx, "policy", {
    tier: policy.tier,
    decision: policy.decision,
    reasons: policy.reason_codes,
    projected_daily_cents: policy.facts.projected_daily_cents,
    used_today_cents: policy.facts.used_today_cents,
  }, { source: "policy", trust: TRUST.POLICY });
  return f.id;
}

export function buildApprovalEnvelope(ctx, { tool, params, policy, summary, evidenceRefs, reversibility, challenge = null, payeeId = null, payeeName = null, accountName = null }) {
  return {
    trace_id: ctx.traceId,
    run_id: ctx.runId,
    node_id: "N5",
    tool,
    params,
    params_hash: paramsHash(params),
    impact: {
      amount_cents: params.amount_cents || 0,
      account_id: params.account_id || null,
      account_name: accountName,
      payee_id: params.payee_id || payeeId,
      payee_name: payeeName,
      resources: 2,
      irreversible: tool === "transfer.commit",
    },
    reversibility,
    required_auth: policy.required_auth,
    risk_reasons: policy.reason_codes,
    intent_summary: summary,
    evidence_refs: evidenceRefs,
    challenge,
    nonce: newNonce(),
  };
}

export function approvalSummary({ payeeName, amountCents, memo, scheduled, dueAt }) {
  const base = `向 ${payeeName} 转账 ${formatCents(amountCents)} 元${memo ? `，备注「${memo}」` : ""}`;
  return scheduled ? `${base}，执行时间 ${dueAt || "指定时间"}` : base;
}

export function clampText(s, n = 200) {
  return String(s || "").slice(0, n);
}

export function isCancelInput(input) {
  const s = typeof input === "string" ? input : input?.text || input?.decision || "";
  return /取消|不转了|算了|停止|拒绝/.test(String(s));
}
