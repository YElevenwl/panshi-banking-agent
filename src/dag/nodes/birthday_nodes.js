import { formatCents } from "../../core/money.js";
import { AppError } from "../../core/errors.js";
import { primaryAccount } from "../../tools/common.js";
import { addFact, buildApprovalEnvelope, isCancelInput } from "./common.js";
import { TRUST } from "../../security/facts.js";
import { validateNumericClaims, SAFE_FALLBACK } from "../../security/hallucination.js";
import { sealAudit } from "./transfer_nodes.js";

const ITEMS = {
  flower: { merchant: "花店", item: "生日花束", amount_cents: 30000, category: "flower" },
  cake: { merchant: "蛋糕店", item: "生日蛋糕", amount_cents: 40000, category: "cake" },
};

function atTime(dateKey, hh = 10) {
  return `${dateKey}T${String(hh).padStart(2, "0")}:00:00+08:00`;
}

function minusDays(dateKey, days) {
  const d = new Date(`${dateKey}T10:00:00+08:00`);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function dateKeyOf(iso) {
  return String(iso).slice(0, 10);
}

function evaluateAndPermit(ctx, { action, tool, params, amountCents, mandateId = null, merchantCategory = null, ttlMs = 5 * 60 * 1000 }) {
  const policy = ctx.services.policy.evaluate({
    action, user_id: ctx.userId, account_id: ctx.state.account_id,
    amount_cents: amountCents, mandate_id: mandateId, merchant_category: merchantCategory,
  });
  ctx.audit.append({
    trace_id: ctx.traceId, run_id: ctx.runId, step_id: ctx.nodeId, node_id: ctx.nodeId,
    event_type: "policy.evaluated", payload: { ...policy, action, tool },
  });
  if (policy.decision === "DENY") throw new AppError("POLICY_DENIED", `策略拒绝：${policy.reason_codes.join(" / ")}`, { status: 403 });
  const built = ctx.gateway.buildParams(tool, params, ctx);
  const approver = ctx.state.approval?.approver_id || null;
  const permit = ctx.services.permits.issue({
    run_id: ctx.runId, step_id: ctx.nodeId, subject: ctx.userId, tool,
    params: built.params, max_amount_cents: amountCents, decision: policy.decision,
    auth_level: policy.required_auth, approver_ids: approver ? [approver] : [], ttl_ms: ttlMs,
  });
  return { policy, params: built.params, permit };
}

export const birthdayBind = {
  id: "P0", deps: [], title: "绑定会话", risk: "none",
  async execute(ctx) {
    const account = primaryAccount(ctx.db, ctx.userId);
    ctx.state.account_id = account.id;
    addFact(ctx, "user_text", String(ctx.state.input.text || ""), { source: "user_turn", trust: TRUST.USER });
    return ctx.ok({ account_id: account.id });
  },
  async rollback() { return { status: "ok" }; },
  async onInterrupt() { return { status: "ok" }; },
};

export const birthdayParse = {
  id: "P1", deps: ["P0"], title: "理解生日计划", risk: "green",
  async execute(ctx) {
    const p = ctx.state.input.proposal || await ctx.services.llm.proposeIntent({ text: ctx.state.input.text, clock: ctx.clock });
    if (p.intent !== "birthday.plan") return ctx.fail("INTENT_NOT_BIRTHDAY", "当前场景只处理生日计划");
    const s = p.slots || {};
    ctx.state.birthday = {
      budget_cents: Number(s.budget_cents) || 100000,
      wants_flower: s.wants_flower !== false,
      wants_cake: s.wants_cake !== false,
    };
    addFact(ctx, "birthday_budget", { amount_cents: ctx.state.birthday.budget_cents }, { source: "user_turn", trust: TRUST.USER });
    return ctx.ok(ctx.state.birthday);
  },
  async rollback() { return { status: "ok" }; },
  async onInterrupt() { return { status: "ok" }; },
};

export const calendarLookup = {
  id: "P2", deps: ["P1"], title: "读取日历（需授权）", risk: "green",
  async execute(ctx) {
    let res = ctx.gateway.invoke({ tool: "calendar.read", params: {}, ctx });
    if (!res.data.consent) {
      if (!ctx.resume) {
        return ctx.interrupt({
          type: "consent_required",
          message: "安排生日计划需要读取你的日历，是否授权？",
          options: [{ value: true, label: "授权并继续" }, { value: false, label: "不授权" }],
        });
      }
      const yes = ctx.input?.consent === true || /同意|授权|可以|继续/.test(String(ctx.input?.text || ""));
      if (!yes) return ctx.fail("CONSENT_DENIED", "未授权读取日历，无法安排生日计划");
      ctx.gateway.invoke({ tool: "calendar.consent", params: {}, ctx });
      res = ctx.gateway.invoke({ tool: "calendar.read", params: {}, ctx });
    }
    const events = res.data.events || [];
    const ev = events.find((e) => /生日/.test(e.title)) || events[0];
    if (!ev) return ctx.fail("NO_BIRTHDAY_EVENT", "日历里没有找到生日事件，请先创建或直接告诉日期");
    const eventDate = ev.event_date.slice(0, 10);
    const orderAt = minusDays(eventDate, 2);
    ctx.state.event_date = eventDate;
    ctx.state.order_at = orderAt;
    addFact(ctx, "birthday_date", { date: eventDate, label: ev.title }, { source: "calendar", trust: TRUST.TOOL_VERIFIED });
    addFact(ctx, "order_date", { date: dateKeyOf(orderAt), count: 2 }, { source: "calendar", trust: TRUST.SYSTEM });
    return ctx.ok({ title: ev.title, event_date: eventDate, order_at: orderAt });
  },
  async rollback() { return { status: "ok" }; },
  async onInterrupt(ctx, reason) { return isCancelInput(reason) ? ctx.fail("USER_CANCELLED", "用户取消") : { status: "ok" }; },
};

export const birthdayPlan = {
  id: "P3", deps: ["P2"], title: "计划审批", risk: "yellow",
  async execute(ctx) {
    const b = ctx.state.birthday;
    const items = [];
    if (b.wants_flower) items.push(ITEMS.flower);
    if (b.wants_cake) items.push(ITEMS.cake);
    const total = items.reduce((s, x) => s + x.amount_cents, 0);
    const hold = Math.max(total, Math.min(b.budget_cents, 100000));
    ctx.state.plan = {
      items, total_cents: total, hold_cents: hold, budget_cents: b.budget_cents,
      event_date: ctx.state.event_date, order_at: ctx.state.order_at,
      mandate_expires_at: `${ctx.state.event_date}T23:59:59+08:00`,
    };

    if (!ctx.resume) {
      const scope = { merchant_categories: ["flower", "cake"], event_date: ctx.state.event_date };
      const params = {
        scope, max_cents: hold,
        expires_at: `${ctx.state.event_date}T23:59:59+08:00`,
        reuse_existing: false,
      };
      const built = ctx.gateway.buildParams("mandate.create", params, ctx);
      const policy = ctx.services.policy.evaluate({
        action: "mandate.create", user_id: ctx.userId, account_id: ctx.state.account_id, amount_cents: hold,
      });
      ctx.audit.append({ trace_id: ctx.traceId, run_id: ctx.runId, step_id: "P3", node_id: "P3", event_type: "policy.evaluated", payload: policy });
      if (policy.decision === "DENY") return ctx.fail("POLICY_DENIED", `策略拒绝：${policy.reason_codes.join(" / ")}`);
      ctx.state.plan_policy = policy;
      const accountName = ctx.db.prepare("SELECT name FROM accounts WHERE id=?").get(ctx.state.account_id)?.name || null;
      const envelope = buildApprovalEnvelope(ctx, {
        tool: "mandate.create",
        params: built.params,
        policy,
        summary: `生日计划：锁定 ${formatCents(hold)} 元，生日前 2 天订购${items.map((x) => x.item).join("、")}`,
        evidenceRefs: [],
        reversibility: { can_rollback: true, method: "撤销授权并释放冻结、取消订单", window: "执行前" },
        payeeId: null,
        payeeName: null,
        accountName,
      });
      const row = ctx.services.approvals.create({ runId: ctx.runId, stepId: "P3", envelope, ttlMs: 5 * 60 * 1000 });
      ctx.state.approval_id = row.id;
      ctx.state.plan_params = built.params;
      return ctx.interrupt({ type: "approval_required", approval_id: row.id, envelope: row.envelope, message: "请确认生日计划" });
    }

    const row = ctx.services.approvals.decide({
      id: ctx.input?.approval_id || ctx.state.approval_id, approverId: ctx.userId,
      decision: ctx.input?.decision || "approve", expectedUserId: ctx.userId,
      code: ctx.input?.code || "", challenge: ctx.input?.challenge || "",
    });
    if (row.status !== "approved") return ctx.fail("USER_REJECTED", "用户拒绝了生日计划");
    ctx.state.approval = row;
    const permit = ctx.services.permits.issue({
      run_id: ctx.runId, step_id: "P3", subject: ctx.userId, tool: "mandate.create",
      params: ctx.state.plan_params, max_amount_cents: ctx.state.plan.hold_cents,
      decision: ctx.state.plan_policy.decision, auth_level: ctx.state.plan_policy.required_auth,
      approver_ids: [row.approver_id], ttl_ms: 5 * 60 * 1000,
    });
    ctx.state.plan_permit = permit.token;
    return ctx.ok({ approved: true, permit_id: permit.permit_id });
  },
  async rollback() { return { status: "ok" }; },
  async onInterrupt(ctx, reason) { return isCancelInput(reason) ? ctx.fail("USER_CANCELLED", "用户取消") : { status: "ok" }; },
};

export const birthdayMandate = {
  id: "P4", deps: ["P3"], title: "创建消费授权", risk: "yellow",
  async execute(ctx) {
    const res = ctx.gateway.invoke({
      tool: "mandate.create", params: ctx.state.plan_params, ctx,
      permit_token: ctx.state.plan_permit, idempotency_key: `${ctx.runId}:P4:mandate`,
    });
    if (res.compensation) ctx.recordCompensation(res.compensation);
    ctx.state.mandate_id = res.data.id;
    return ctx.ok({ mandate_id: res.data.id, max_cents: res.data.max_cents, expires_at: res.data.expires_at });
  },
  async rollback() { return { status: "ok" }; },
  async onInterrupt() { return { status: "ok" }; },
};

export const birthdayHold = {
  id: "P5", deps: ["P4"], title: "冻结预算", risk: "yellow",
  async execute(ctx) {
    const params = {
      account_id: ctx.state.account_id,
      amount_cents: ctx.state.plan.hold_cents,
      expires_at: `${ctx.state.event_date}T23:59:59+08:00`,
    };
    const { params: built, permit } = evaluateAndPermit(ctx, {
      action: "ledger.hold", tool: "ledger.hold", params, amountCents: ctx.state.plan.hold_cents,
    });
    const res = ctx.gateway.invoke({
      tool: "ledger.hold", params: built, ctx, permit_token: permit.token,
      idempotency_key: `${ctx.runId}:P5:hold`,
    });
    if (res.compensation) ctx.recordCompensation(res.compensation);
    ctx.state.hold_id = res.data.hold_id;
    return ctx.ok({ hold_id: res.data.hold_id, amount_cents: res.data.amount_cents });
  },
  async rollback() { return { status: "ok" }; },
  async onInterrupt() { return { status: "ok" }; },
};

export const birthdayOrders = {
  id: "P6", deps: ["P5"], title: "安排定时下单", risk: "yellow",
  async execute(ctx) {
    const results = [];
    for (const item of ctx.state.plan.items) {
      const params = {
        merchant: item.merchant, item: item.item, amount_cents: item.amount_cents,
        scheduled_at: ctx.state.plan.order_at, merchant_category: item.category,
        mandate_id: ctx.state.mandate_id, hold_id: ctx.state.hold_id,
      };
      const { params: built, permit } = evaluateAndPermit(ctx, {
        action: "order.schedule", tool: "order.schedule", params,
        amountCents: item.amount_cents, mandateId: ctx.state.mandate_id, merchantCategory: item.category,
      });
      const res = ctx.gateway.invoke({
        tool: "order.schedule", params: built, ctx, permit_token: permit.token,
        idempotency_key: `${ctx.runId}:P6:${item.category}`,
      });
      if (res.compensation) ctx.recordCompensation(res.compensation);
      results.push({ order_id: res.data.id, merchant: res.data.merchant, item: res.data.item, amount_cents: res.data.amount_cents, scheduled_at: res.data.scheduled_at });
    }
    ctx.state.orders = results;
    return ctx.ok({ orders: results });
  },
  async rollback() { return { status: "ok" }; },
  async onInterrupt() { return { status: "ok" }; },
};

export const birthdayCompose = {
  id: "P7", deps: ["P6"], title: "生日计划回执", risk: "green",
  async execute(ctx) {
    const plan = ctx.state.plan;
    for (const o of ctx.state.orders) {
      addFact(ctx, "order", o, { source: "order.schedule", trust: TRUST.TOOL_VERIFIED });
    }
    addFact(ctx, "hold", { amount_cents: plan.hold_cents, hold_id: ctx.state.hold_id }, { source: "ledger.hold", trust: TRUST.TOOL_VERIFIED });
    const names = ctx.state.orders.map((o) => `${o.item} ${formatCents(o.amount_cents)} 元`).join("、");
    let text = `已安排生日计划：锁定 ${formatCents(plan.hold_cents)} 元，生日 ${plan.event_date}，生日前 2 天（${dateKeyOf(plan.order_at)}）下单：${names}。可在计划中取消。`;
    const check = validateNumericClaims(text, ctx.facts.list());
    if (!check.ok) {
      ctx.audit.append({ trace_id: ctx.traceId, run_id: ctx.runId, step_id: "P7", node_id: "P7", event_type: "hallucination.blocked", payload: { violations: check.violations } });
      text = SAFE_FALLBACK;
    }
    return ctx.ok({ text, violations: check.violations });
  },
  async rollback() { return { status: "ok" }; },
  async onInterrupt() { return { status: "ok" }; },
};

export function birthdayNodes() {
  return [birthdayBind, birthdayParse, calendarLookup, birthdayPlan, birthdayMandate, birthdayHold, birthdayOrders, birthdayCompose, { ...sealAudit, id: "P8", deps: ["P7"], title: "审计锚定" }];
}

// ---------- 到期订单提交场景 ----------

export const orderBind = {
  id: "O0", deps: [], title: "绑定订单", risk: "none",
  async execute(ctx) {
    const order = ctx.db.prepare("SELECT * FROM orders WHERE id=? AND user_id=?").get(ctx.state.input.order_id, ctx.userId);
    if (!order) return ctx.fail("ORDER_NOT_FOUND", "订单不存在");
    ctx.state.order = order;
    ctx.state.account_id = primaryAccount(ctx.db, ctx.userId).id;
    addFact(ctx, "order", { amount_cents: order.amount_cents, label: order.item, date: order.scheduled_at.slice(0, 10) }, { source: "orders", trust: TRUST.TOOL_VERIFIED });
    return ctx.ok({ order_id: order.id, amount_cents: order.amount_cents });
  },
  async rollback() { return { status: "ok" }; },
  async onInterrupt() { return { status: "ok" }; },
};

export const orderPolicy = {
  id: "O1", deps: ["O0"], title: "策略裁决（订单）", risk: "none",
  async execute(ctx) {
    const order = ctx.state.order;
    const policy = ctx.services.policy.evaluate({
      action: "order.commit", user_id: ctx.userId, account_id: ctx.state.account_id,
      amount_cents: order.amount_cents, mandate_id: order.mandate_id, merchant_category: order.merchant_category,
    });
    ctx.state.policy = policy;
    ctx.audit.append({ trace_id: ctx.traceId, run_id: ctx.runId, step_id: "O1", node_id: "O1", event_type: "policy.evaluated", payload: policy });
    if (policy.decision === "DENY") return ctx.fail("POLICY_DENIED", `策略拒绝：${policy.reason_codes.join(" / ")}`);
    if (policy.decision === "ALLOW") {
      const permit = ctx.services.permits.issue({
        run_id: ctx.runId, step_id: "O1", subject: ctx.userId, tool: "order.commit",
        params: { order_id: order.id }, max_amount_cents: order.amount_cents,
        decision: policy.decision, auth_level: policy.required_auth, ttl_ms: 5 * 60 * 1000,
      });
      ctx.state.order_permit = permit.token;
      return ctx.ok({ skipped_approval: true, permit_id: permit.permit_id });
    }
    const accountName = ctx.db.prepare("SELECT name FROM accounts WHERE id=?").get(ctx.state.account_id)?.name || null;
    const envelope = buildApprovalEnvelope(ctx, {
      tool: "order.commit", params: { order_id: order.id }, policy,
      summary: `到期下单：${order.item} ${formatCents(order.amount_cents)} 元`,
      evidenceRefs: [], reversibility: { can_rollback: true, method: "商户取消/退款，可能失败", window: "商户接单前" },
      payeeId: null, payeeName: order.merchant, accountName,
    });
    const row = ctx.services.approvals.create({ runId: ctx.runId, stepId: "O1", envelope, ttlMs: policy.tier === "RED" ? 3 * 60 * 1000 : 5 * 60 * 1000 });
    ctx.state.approval_id = row.id;
    return ctx.interrupt({ type: "approval_required", approval_id: row.id, envelope: row.envelope, message: "生日订单到期，请确认下单" });
  },
  async rollback() { return { status: "ok" }; },
  async onInterrupt(ctx, reason) { return isCancelInput(reason) ? ctx.fail("USER_CANCELLED", "用户取消") : { status: "ok" }; },
};

export const orderCommit = {
  id: "O2", deps: ["O1"], title: "提交订单", risk: "yellow",
  async execute(ctx) {
    if (!ctx.state.order_permit) {
      const row = ctx.services.approvals.decide({
        id: ctx.input?.approval_id || ctx.state.approval_id, approverId: ctx.userId,
        decision: ctx.input?.decision || "approve", expectedUserId: ctx.userId,
        code: ctx.input?.code || "", challenge: ctx.input?.challenge || "",
      });
      if (row.status !== "approved") return ctx.fail("USER_REJECTED", "用户拒绝下单");
      const permit = ctx.services.permits.issue({
        run_id: ctx.runId, step_id: "O2", subject: ctx.userId, tool: "order.commit",
        params: { order_id: ctx.state.order.id }, max_amount_cents: ctx.state.order.amount_cents,
        decision: ctx.state.policy.decision, auth_level: ctx.state.policy.required_auth,
        approver_ids: [row.approver_id], ttl_ms: 5 * 60 * 1000,
      });
      ctx.state.order_permit = permit.token;
    }
    const res = ctx.gateway.invoke({
      tool: "order.commit", params: { order_id: ctx.state.order.id }, ctx,
      permit_token: ctx.state.order_permit, idempotency_key: `${ctx.runId}:O2:commit`,
    });
    if (res.compensation) ctx.recordCompensation(res.compensation);
    return ctx.ok(res.data);
  },
  async rollback() { return { status: "ok" }; },
  async onInterrupt() { return { status: "ok" }; },
};

export const orderCompose = {
  id: "O3", deps: ["O2"], title: "订单回执", risk: "green",
  async execute(ctx) {
    const order = ctx.state.order;
    addFact(ctx, "order_committed", { amount_cents: order.amount_cents, label: order.item }, { source: "order.commit", trust: TRUST.TOOL_VERIFIED });
    let text = `已下单：${order.merchant} ${order.item} ${formatCents(order.amount_cents)} 元，将在生日前送达。`;
    const check = validateNumericClaims(text, ctx.facts.list());
    if (!check.ok) {
      ctx.audit.append({ trace_id: ctx.traceId, run_id: ctx.runId, step_id: "O3", node_id: "O3", event_type: "hallucination.blocked", payload: { violations: check.violations } });
      text = SAFE_FALLBACK;
    }
    return ctx.ok({ text, violations: check.violations });
  },
  async rollback() { return { status: "ok" }; },
  async onInterrupt() { return { status: "ok" }; },
};

export function orderNodes() {
  return [orderBind, orderPolicy, orderCommit, orderCompose, { ...sealAudit, id: "O4", deps: ["O3"], title: "审计锚定" }];
}
