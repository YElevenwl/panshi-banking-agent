import { formatCents } from "../../core/money.js";
import { primaryAccount } from "../../tools/common.js";
import { dailyUsageCents } from "../../state/ledger.js";
import { sanitizeInput, detectInjection } from "../../security/injection.js";
import { validateNumericClaims, SAFE_FALLBACK } from "../../security/hallucination.js";
import { transactionChallenge } from "../../security/auth.js";
import { TRUST } from "../../security/facts.js";
import { addFact, userFacts, policyFacts, buildApprovalEnvelope, approvalSummary, isCancelInput } from "./common.js";

const FIVE_MIN = 5 * 60 * 1000;
const THREE_MIN = 3 * 60 * 1000;
const HOLD_WINDOW = 15 * 60 * 1000;

function slotsMissing(proposal) {
  const s = proposal?.slots || {};
  return !s.amount_cents || (!s.payee_name && !s.payee_phone && !s.payee_id);
}

function clarify(message) {
  return { status: "interrupt", interrupt: { type: "clarify", message } };
}

export const sessionBind = {
  id: "N0", deps: [], title: "绑定会话与账户", risk: "none",
  async execute(ctx) {
    const user = ctx.db.prepare("SELECT * FROM users WHERE id=?").get(ctx.userId);
    const account = primaryAccount(ctx.db, ctx.userId);
    ctx.state.user = { id: user.id, name: user.name };
    ctx.state.account_id = account.id;
    ctx.state.channel = ctx.state.input.channel || "APP";
    addFact(ctx, "user", { user_id: user.id, name: user.name }, { source: "system", trust: TRUST.SYSTEM });
    addFact(ctx, "account", { account_id: account.id, balance_cents: account.balance_cents }, { source: "system", trust: TRUST.TOOL_VERIFIED });
    return ctx.ok({ user_id: user.id, account_id: account.id });
  },
  async rollback() { return { status: "ok" }; },
  async onInterrupt() { return { status: "ok" }; },
};

export const intentParse = {
  id: "N1", deps: ["N0"], title: "理解转账意图", risk: "green",
  async execute(ctx) {
    const original = String(ctx.state.input.text || "");
    const text = ctx.resume ? `${original}\n补充：${String(ctx.input?.text || ctx.input || "")}` : original;
    const { clean } = sanitizeInput(text);
    const inj = detectInjection(clean);
    ctx.state.injection = inj.level === "high";
    ctx.state.injection_hits = inj.hits;
    if (inj.level !== "none") {
      ctx.audit.append({
        trace_id: ctx.traceId, run_id: ctx.runId, step_id: "N1", node_id: "N1",
        event_type: "injection.detected",
        payload: { level: inj.level, score: inj.score, hits: inj.hits.map((h) => h.pattern) },
      });
      if (inj.level === "high") ctx.services.breaker.recordInjection(ctx.userId, "input_injection");
    }

    const proposal = ctx.state.input.proposal || await ctx.services.llm.proposeIntent({ text: clean, clock: ctx.clock });
    ctx.state.proposal = proposal;

    if (!["transfer.create", "transfer.schedule"].includes(proposal.intent)) {
      return ctx.fail("INTENT_NOT_TRANSFER", "当前场景只处理转账意图");
    }
    if (slotsMissing(proposal) || proposal.confidence < 0.45) {
      const msg = proposal.ambiguities?.[0] || "请补充收款人姓名或手机号，以及转账金额。";
      return clarify(msg);
    }

    const s = proposal.slots;
    ctx.state.transfer = {
      payee_id: s.payee_id || null,
      payee_name: s.payee_name || null,
      payee_phone: s.payee_phone || null,
      amount_cents: s.amount_cents,
      memo: s.memo || "",
      due_at: s.due_at || null,
      scheduled: !!s.due_at,
    };
    ctx.state.fact_refs = userFacts(ctx, clean, proposal);
    return ctx.ok({ intent: proposal.intent, slots: ctx.state.transfer, confidence: proposal.confidence });
  },
  async rollback() { return { status: "ok" }; },
  async onInterrupt(ctx, reason) { return isCancelInput(reason) ? ctx.fail("USER_CANCELLED", "用户取消") : { status: "ok" }; },
};

export const resolvePayee = {
  id: "N2", deps: ["N1"], title: "解析收款人", risk: "green",
  async execute(ctx) {
    if (ctx.state.payee?.payee_id) return ctx.ok(ctx.state.payee);

    if (ctx.state.transfer.payee_id) {
      const row = ctx.db.prepare("SELECT * FROM payees WHERE id=? AND user_id=?").get(ctx.state.transfer.payee_id, ctx.userId);
      if (!row) return ctx.fail("PAYEE_NOT_FOUND", "定时任务的收款人不存在");
      const payee = {
        payee_id: row.id, name: row.name, bank: row.bank, account_no_masked: row.account_no_masked,
        risk_level: row.risk_level, status: row.status,
      };
      ctx.state.payee = payee;
      addFact(ctx, "payee", payee, { source: "payee.lookup", trust: TRUST.TOOL_VERIFIED });
      return ctx.ok(payee);
    }

    let query = ctx.state.transfer.payee_phone || ctx.state.transfer.payee_name;
    if (ctx.resume) {
      const chosen = ctx.input?.payee_id;
      if (chosen && ctx.state.payee_candidates) {
        const hit = ctx.state.payee_candidates.find((p) => p.payee_id === chosen);
        if (hit) {
          ctx.state.payee = hit;
          addFact(ctx, "payee", hit, { source: "payee.search", trust: TRUST.TOOL_VERIFIED });
          return ctx.ok(hit);
        }
      }
      if (ctx.input?.text) query = String(ctx.input.text);
    }

    const res = ctx.gateway.invoke({ tool: "payee.search", params: { query }, ctx });
    if (res.tainted) {
      return ctx.fail("TAINTED_TOOL_RESULT", "收款人信息中包含可疑指令，已阻断，请手工核对收款人");
    }
    const candidates = res.data.payees || [];
    ctx.state.payee_candidates = candidates;

    if (candidates.length === 0) {
      return clarify(`没有找到收款人「${query}」。请提供完整姓名或 11 位手机号。`);
    }
    if (candidates.length > 1) {
      return {
        status: "interrupt",
        interrupt: {
          type: "choose_payee",
          message: "找到多个同名收款人，请选择：",
          options: candidates.map((p) => ({ payee_id: p.payee_id, label: `${p.name} · ${p.bank} ${p.account_no_masked}` })),
        },
      };
    }
    const payee = candidates[0];
    ctx.state.payee = payee;
    addFact(ctx, "payee", payee, { source: "payee.search", trust: TRUST.TOOL_VERIFIED });
    return ctx.ok(payee);
  },
  async rollback() { return { status: "ok" }; },
  async onInterrupt(ctx, reason) { return isCancelInput(reason) ? ctx.fail("USER_CANCELLED", "用户取消") : { status: "ok" }; },
};

export const riskFacts = {
  id: "N3", deps: ["N2"], title: "计算风险事实", risk: "none",
  async execute(ctx) {
    const t = ctx.state.transfer;
    const payee = ctx.state.payee;
    const payeeRow = ctx.db.prepare("SELECT * FROM payees WHERE id=?").get(payee.payee_id) || payee;
    const usedToday = dailyUsageCents(ctx.db, ctx.userId, ctx.clock.todayKey());
    const velocity = ctx.services.breaker.recordTransferAttempt(ctx.userId);
    const payeeNew = new Date(payeeRow.created_at).getTime() > ctx.clock.nowMs() - 30 * 24 * 3600 * 1000;
    const risk = {
      amount_cents: t.amount_cents,
      used_today_cents: usedToday,
      projected_daily_cents: usedToday + t.amount_cents,
      velocity_count: velocity,
      is_new_payee: payeeNew,
      taint: ctx.state.injection === true,
      payee_risk: payeeRow.risk_level,
      payee_status: payeeRow.status,
    };
    ctx.state.risk = risk;
    addFact(ctx, "daily_usage", { amount_cents: usedToday, projected_daily_cents: risk.projected_daily_cents }, { source: "ledger", trust: TRUST.TOOL_VERIFIED });
    return ctx.ok(risk);
  },
  async rollback() { return { status: "ok" }; },
  async onInterrupt() { return { status: "ok" }; },
};

export const policyDecision = {
  id: "N4", deps: ["N3"], title: "策略裁决", risk: "none",
  async execute(ctx) {
    const t = ctx.state.transfer;
    const policy = ctx.services.policy.evaluate({
      action: t.scheduled ? "transfer.schedule" : "transfer.create",
      user_id: ctx.userId,
      account_id: ctx.state.account_id,
      payee_id: ctx.state.payee.payee_id,
      amount_cents: t.amount_cents,
      taint: ctx.state.risk.taint,
    });
    ctx.state.policy = policy;
    const factId = policyFacts(ctx, policy);
    ctx.state.policy_fact_id = factId;
    ctx.audit.append({
      trace_id: ctx.traceId, run_id: ctx.runId, step_id: "N4", node_id: "N4",
      event_type: "policy.evaluated",
      payload: { ...policy, fact_id: factId, payee_id: ctx.state.payee.payee_id },
    });

    if (policy.decision === "DENY") {
      const before = ctx.services.breaker.getState(ctx.userId).state;
      const after = ctx.services.breaker.recordDenial(ctx.userId, policy.reason_codes.join(","));
      if (after.state === "OPEN" && before !== "OPEN") {
        ctx.audit.append({ trace_id: ctx.traceId, run_id: ctx.runId, event_type: "breaker.opened", payload: { subject: ctx.userId, reason: policy.reason_codes.join(",") } });
      }
      return ctx.fail("POLICY_DENIED", `操作被安全策略拒绝：${policy.reason_codes.join(" / ")}`, { policy });
    }
    return ctx.ok(policy);
  },
  async rollback() { return { status: "ok" }; },
  async onInterrupt() { return { status: "ok" }; },
};

export const approval = {
  id: "N5", deps: ["N4"], title: "审批与强验证", risk: "yellow",
  async execute(ctx) {
    const policy = ctx.state.policy;
    const t = ctx.state.transfer;
    const payee = ctx.state.payee;

    if (!ctx.resume) {
      const ttl = policy.tier === "RED" ? THREE_MIN : FIVE_MIN;
      if (policy.decision === "ALLOW") {
        const tool = t.scheduled ? "transfer.schedule" : "ledger.hold";
        const params = t.scheduled
          ? { payee_id: payee.payee_id, amount_cents: t.amount_cents, memo: t.memo, due_at: t.due_at }
          : { account_id: ctx.state.account_id, amount_cents: t.amount_cents, expires_at: new Date(ctx.clock.nowMs() + HOLD_WINDOW).toISOString() };
        const built = ctx.gateway.buildParams(tool, params, ctx);
        const permit = ctx.services.permits.issue({
          run_id: ctx.runId, step_id: "N5", subject: ctx.userId, tool,
          params: built.params, max_amount_cents: t.amount_cents, decision: policy.decision,
          auth_level: policy.required_auth, approver_ids: [], ttl_ms: ttl,
        });
        ctx.state.action_tool = tool;
        ctx.state.action_params = built.params;
        ctx.state.permits = { action: permit.token, tool, permit_id: permit.permit_id };
        return ctx.ok({ skipped: true, permit_id: permit.permit_id });
      }

      const tool = t.scheduled ? "transfer.schedule" : "ledger.hold";
      const params = t.scheduled
        ? { payee_id: payee.payee_id, amount_cents: t.amount_cents, memo: t.memo, due_at: t.due_at }
        : { account_id: ctx.state.account_id, amount_cents: t.amount_cents, expires_at: new Date(ctx.clock.nowMs() + HOLD_WINDOW).toISOString() };
      const built = ctx.gateway.buildParams(tool, params, ctx);
      const accountName = ctx.db.prepare("SELECT name FROM accounts WHERE id=?").get(ctx.state.account_id)?.name || null;
      const envelope = buildApprovalEnvelope(ctx, {
        tool,
        params: built.params,
        policy,
        summary: approvalSummary({ payeeName: payee.name, amountCents: t.amount_cents, memo: t.memo, scheduled: t.scheduled, dueAt: t.due_at }),
        evidenceRefs: [ctx.state.fact_refs?.[1], ctx.state.policy_fact_id].filter(Boolean),
        reversibility: t.scheduled
          ? { can_rollback: true, method: "取消定时任务", window: "执行前" }
          : { can_rollback: true, method: "提交前释放冻结；提交后 10 分钟内可冲正", window: "10 分钟" },
        challenge: policy.required_auth === "totp" ? transactionChallenge({ amountCents: t.amount_cents, payeeId: payee.payee_id, memo: t.memo }) : null,
        payeeId: payee.payee_id,
        payeeName: payee.name,
        accountName,
      });
      const row = ctx.services.approvals.create({ runId: ctx.runId, stepId: "N5", envelope, ttlMs: ttl });
      ctx.state.approval_id = row.id;
      ctx.state.action_tool = tool;
      ctx.state.action_params = built.params;
      return {
        status: "interrupt",
        interrupt: { type: "approval_required", approval_id: row.id, envelope: row.envelope, message: "请确认这笔操作" },
      };
    }

    const approvalId = ctx.input?.approval_id || ctx.state.approval_id;
    const decision = ctx.input?.decision || "approve";
    if (decision === "reject") {
      ctx.services.approvals.decide({ id: approvalId, approverId: ctx.userId, decision: "reject", expectedUserId: ctx.userId });
      return ctx.fail("USER_REJECTED", "用户拒绝了该操作");
    }
    let row;
    try {
      row = ctx.services.approvals.decide({
        id: approvalId, approverId: ctx.userId, decision: "approve",
        code: ctx.input?.code || "", challenge: ctx.input?.challenge || "",
        expectedUserId: ctx.userId,
      });
    } catch (err) {
      if (["TOTP_INVALID", "CHALLENGE_MISMATCH"].includes(err.code)) {
        const current = ctx.services.approvals.get(approvalId);
        return {
          status: "interrupt",
          interrupt: {
            type: "approval_required",
            approval_id: approvalId,
            envelope: current?.envelope,
            message: "验证码错误或交易挑战不匹配，请重试。",
            error_code: err.code,
          },
        };
      }
      return ctx.fail(err.code || "APPROVAL_FAILED", err.message || "审批失败", err.details || {});
    }
    ctx.state.approval = row;
    const ttl = policy.tier === "RED" ? THREE_MIN : FIVE_MIN;
    const permit = ctx.services.permits.issue({
      run_id: ctx.runId, step_id: "N5", subject: ctx.userId, tool: ctx.state.action_tool,
      params: ctx.state.action_params, max_amount_cents: t.amount_cents, decision: policy.decision,
      auth_level: policy.required_auth, approver_ids: [row.approver_id], ttl_ms: ttl,
    });
    ctx.state.permits = { action: permit.token, tool: ctx.state.action_tool, permit_id: permit.permit_id };
    return ctx.ok({ approval_id: row.id, approver_id: row.approver_id, auth_method: row.auth_method, permit_id: permit.permit_id });
  },
  async rollback(ctx) {
    if (ctx.state.approval_id) {
      ctx.db.prepare("UPDATE approvals SET status='expired' WHERE id=? AND status='pending'").run(ctx.state.approval_id);
    }
    return { status: "ok" };
  },
  async onInterrupt(ctx, reason) { return isCancelInput(reason) ? ctx.fail("USER_CANCELLED", "用户取消") : { status: "ok" }; },
};

export const reserveOrSchedule = {
  id: "N6", deps: ["N5"], title: "冻结资金或创建定时任务", risk: "yellow",
  async execute(ctx) {
    const t = ctx.state.transfer;
    const permit = ctx.state.permits?.action;
    if (!permit) return ctx.fail("PERMIT_MISSING", "缺少执行许可");
    if (t.scheduled) {
      const res = ctx.gateway.invoke({
        tool: "transfer.schedule", params: ctx.state.action_params, ctx,
        permit_token: permit, idempotency_key: `${ctx.runId}:N6:schedule`,
      });
      if (res.compensation) ctx.recordCompensation(res.compensation);
      ctx.state.job_id = res.data.id;
      return ctx.ok({ scheduled: true, job_id: res.data.id, due_at: res.data.due_at });
    }
    const res = ctx.gateway.invoke({
      tool: "ledger.hold", params: ctx.state.action_params, ctx,
      permit_token: permit, idempotency_key: `${ctx.runId}:N6:hold`,
    });
    if (res.compensation) ctx.recordCompensation(res.compensation);
    ctx.state.hold_id = res.data.hold_id;
    return ctx.ok({ hold_id: res.data.hold_id, amount_cents: res.data.amount_cents, expires_at: res.data.expires_at });
  },
  async rollback() { return { status: "ok" }; },
  async onInterrupt() { return { status: "ok" }; },
};

export const commitOrFinalize = {
  id: "N7", deps: ["N6"], title: "提交转账", risk: "red",
  async execute(ctx) {
    const t = ctx.state.transfer;
    if (t.scheduled) return ctx.ok({ scheduled: true, skipped_commit: true });
    if (!ctx.state.hold_id) return ctx.fail("HOLD_MISSING", "没有冻结记录");
    const params = {
      account_id: ctx.state.account_id,
      payee_id: ctx.state.payee.payee_id,
      amount_cents: t.amount_cents,
      memo: t.memo,
      hold_id: ctx.state.hold_id,
    };
    const built = ctx.gateway.buildParams("transfer.commit", params, ctx);
    const policy = ctx.state.policy;
    const ttl = policy.tier === "RED" ? THREE_MIN : FIVE_MIN;
    const permit = ctx.services.permits.issue({
      run_id: ctx.runId, step_id: "N7", subject: ctx.userId, tool: "transfer.commit",
      params: built.params, max_amount_cents: t.amount_cents, decision: policy.decision,
      auth_level: policy.required_auth, approver_ids: ctx.state.approval ? [ctx.state.approval.approver_id] : [],
      ttl_ms: ttl,
    });
    const res = ctx.gateway.invoke({
      tool: "transfer.commit", params: built.params, ctx,
      permit_token: permit.token, idempotency_key: `${ctx.runId}:N7:commit`,
    });
    if (res.compensation) ctx.recordCompensation(res.compensation);
    // 转账已提交，冻结释放补偿被“冲正”补偿取代，避免撤销时先释放已捕获的冻结
    for (const c of ctx.state.compensations) {
      if (c.tool === "ledger.release_hold") c.superseded = true;
    }
    ctx.state.transfer_id = res.data.transfer_id;
    return ctx.ok(res.data);
  },
  async rollback() { return { status: "ok" }; },
  async onInterrupt() { return { status: "ok" }; },
};

export const composeReceipt = {
  id: "N8", deps: ["N7"], title: "证据锚定回执", risk: "green",
  async execute(ctx) {
    const t = ctx.state.transfer;
    const payee = ctx.state.payee;
    const bal = ctx.gateway.invoke({ tool: "account.balance", params: { account_id: ctx.state.account_id }, ctx });
    const balance = bal.data.balance_cents;
    addFact(ctx, "balance", { balance_cents: balance }, { source: "account.balance", trust: TRUST.TOOL_VERIFIED });
    addFact(ctx, "today", { date: ctx.clock.todayKey() }, { source: "clock", trust: TRUST.SYSTEM });

    let text;
    if (t.scheduled) {
      addFact(ctx, "schedule", { job_id: ctx.state.job_id, due_at: t.due_at, status: "scheduled" }, { source: "transfer.schedule", trust: TRUST.TOOL_VERIFIED });
      text = `已为你安排定时转账：向${payee.name}转账${formatCents(t.amount_cents)}元${t.memo ? `，备注「${t.memo}」` : ""}。到期时会再次校验权限与余额。当前余额${formatCents(balance)}元。`;
    } else {
      addFact(ctx, "transfer", { transfer_id: ctx.state.transfer_id, amount_cents: t.amount_cents, status: "committed" }, { source: "transfer.commit", trust: TRUST.TOOL_VERIFIED });
      text = `已向${payee.name}转账${formatCents(t.amount_cents)}元${t.memo ? `，备注「${t.memo}」` : ""}。当前余额${formatCents(balance)}元。交易号${ctx.state.transfer_id}。`;
    }

    const check = validateNumericClaims(text, ctx.facts.list());
    if (!check.ok) {
      ctx.audit.append({ trace_id: ctx.traceId, run_id: ctx.runId, step_id: "N8", node_id: "N8", event_type: "hallucination.blocked", payload: { violations: check.violations } });
      text = SAFE_FALLBACK;
    }
    return ctx.ok({ text, violations: check.violations, facts: ctx.facts.list().map((f) => f.id) });
  },
  async rollback() { return { status: "ok" }; },
  async onInterrupt() { return { status: "ok" }; },
};

export const sealAudit = {
  id: "N9", deps: ["N8"], title: "审计锚定", risk: "none",
  async execute(ctx) {
    const v = ctx.audit.verify();
    if (!v.ok) return ctx.fail("AUDIT_BROKEN", `审计校验失败: ${v.reason}`, v);
    ctx.audit.append({ trace_id: ctx.traceId, run_id: ctx.runId, step_id: ctx.nodeId, node_id: ctx.nodeId, event_type: "audit.sealed", payload: { count: v.count, anchors: v.anchors, head: v.head } });
    return ctx.ok(v);
  },
  async rollback() { return { status: "ok" }; },
  async onInterrupt() { return { status: "ok" }; },
};

export function transferNodes() {
  return [sessionBind, intentParse, resolvePayee, riskFacts, policyDecision, approval, reserveOrSchedule, commitOrFinalize, composeReceipt, sealAudit];
}
