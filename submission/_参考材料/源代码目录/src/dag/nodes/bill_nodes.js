import { formatCents } from "../../core/money.js";
import { addFact } from "./common.js";
import { TRUST } from "../../security/facts.js";
import { validateNumericClaims, SAFE_FALLBACK } from "../../security/hallucination.js";
import { sealAudit } from "./transfer_nodes.js";
import { primaryAccount } from "../../tools/common.js";

export const billBind = {
  id: "B0", deps: [], title: "绑定会话", risk: "none",
  async execute(ctx) {
    const account = primaryAccount(ctx.db, ctx.userId);
    ctx.state.account_id = account.id;
    addFact(ctx, "user_text", String(ctx.state.input.text || ""), { source: "user_turn", trust: TRUST.USER });
    return ctx.ok({ account_id: account.id });
  },
  async rollback() { return { status: "ok" }; },
  async onInterrupt() { return { status: "ok" }; },
};

function normalizePeriod(period, clock) {
  const allowed = ["last_month", "this_month", "year"];
  if (allowed.includes(period)) return period;
  const s = String(period || "").toLowerCase().trim();
  if (s === "上个月" || s === "上月" || s.includes("last month")) return "last_month";
  if (s === "本月" || s === "这个月" || s.includes("this month")) return "this_month";
  if (s === "今年" || s === "年度" || s.includes("this year")) return "year";
  if (/^\d{4}-\d{2}$/.test(s)) {
    const currentKey = clock.todayKey().slice(0, 7);
    if (s === currentKey) return "this_month";
    const prev = clock.now();
    prev.setDate(1);
    prev.setMonth(prev.getMonth() - 1);
    if (s === clock.dateKey(prev).slice(0, 7)) return "last_month";
  }
  return "last_month";
}

export const billParse = {
  id: "B1", deps: ["B0"], title: "理解账单意图", risk: "green",
  async execute(ctx) {
    const proposal = ctx.state.input.proposal || await ctx.services.llm.proposeIntent({ text: ctx.state.input.text, clock: ctx.clock });
    if (!["bill.analyze", "bill.anomaly"].includes(proposal.intent)) {
      return ctx.fail("INTENT_NOT_BILL", "当前场景只处理账单分析");
    }
    ctx.state.bill = {
      anomaly: proposal.intent === "bill.anomaly",
      period: normalizePeriod(proposal.slots.period, ctx.clock),
      category: proposal.slots.category || null,
    };
    addFact(ctx, "user_intent", proposal.intent, { source: "user_turn", trust: TRUST.USER });
    const policy = ctx.services.policy.evaluate({
      action: proposal.intent === "bill.anomaly" ? "bill.anomaly" : "bill.aggregate",
      user_id: ctx.userId, account_id: ctx.state.account_id, amount_cents: 0,
    });
    ctx.state.policy = policy;
    ctx.audit.append({ trace_id: ctx.traceId, run_id: ctx.runId, step_id: "B1", node_id: "B1", event_type: "policy.evaluated", payload: policy });
    return ctx.ok(ctx.state.bill);
  },
  async rollback() { return { status: "ok" }; },
  async onInterrupt() { return { status: "ok" }; },
};

export const billQuery = {
  id: "B2", deps: ["B1"], title: "查询与聚合", risk: "green",
  async execute(ctx) {
    const b = ctx.state.bill;
    const agg = ctx.gateway.invoke({ tool: "bill.aggregate", params: { period: b.period, category: b.category }, ctx });
    if (agg.tainted) return ctx.fail("TAINTED_TOOL_RESULT", "账单数据包含可疑指令，已阻断");
    const a = agg.data;
    addFact(ctx, "bill_total", { amount_cents: a.total_cents, count: a.count, label: a.period_label }, { source: "bill.aggregate", trust: TRUST.TOOL_VERIFIED });
    addFact(ctx, "bill_top", { label: a.top_category || "无", amount_cents: a.top_amount_cents }, { source: "bill.aggregate", trust: TRUST.TOOL_VERIFIED });
    for (const c of a.categories) {
      addFact(ctx, "bill_category", { label: c.category, amount_cents: c.amount_cents, count: c.count }, { source: "bill.aggregate", trust: TRUST.TOOL_VERIFIED });
    }

    let anomalies = null;
    if (b.anomaly) {
      const res = ctx.gateway.invoke({ tool: "bill.anomaly", params: { period: b.period }, ctx });
      if (res.tainted) return ctx.fail("TAINTED_TOOL_RESULT", "异常数据包含可疑指令，已阻断");
      anomalies = res.data;
      addFact(ctx, "anomaly_count", { count: anomalies.count }, { source: "bill.anomaly", trust: TRUST.TOOL_VERIFIED });
      for (const x of anomalies.anomalies) {
        addFact(ctx, "anomaly", { label: (x.types || [x.type]).join(","), amount_cents: x.amount_cents, merchant: x.merchant, occurred_at: x.occurred_at }, { source: "bill.anomaly", trust: TRUST.TOOL_VERIFIED });
      }
    }
    ctx.state.bill.aggregate = a;
    ctx.state.bill.anomalies = anomalies;
    return ctx.ok({ aggregate: a, anomalies });
  },
  async rollback() { return { status: "ok" }; },
  async onInterrupt() { return { status: "ok" }; },
};

export const billCompose = {
  id: "B3", deps: ["B2"], title: "证据锚定账单报告", risk: "green",
  async execute(ctx) {
    const { aggregate: a, anomalies } = ctx.state.bill;
    const periodText = { last_month: "上个月", this_month: "本月", year: "今年" }[a.period] || "这个周期";
    let text;
    if (a.count === 0) {
      text = `${periodText}没有账单记录。`;
    } else if (anomalies) {
      if (anomalies.count === 0) {
        text = `${periodText}共消费${formatCents(a.total_cents)}元，共${a.count}笔，未发现明显异常。`;
      } else {
        const reasonLabel = (types = []) => {
          const map = {
            duplicate_charge: "疑似重复扣款",
            late_night_large: "凌晨大额消费",
            unknown_merchant: "商户信息不完整",
            category_outlier: "金额显著高于同类平均",
          };
          return types.map((t) => map[t] || "异常信号").join("、");
        };
        const detail = anomalies.anomalies.slice(0, 4).map((x) => `${x.merchant} ${formatCents(x.amount_cents)}元（${reasonLabel(x.types || [x.type])}）`).join("；");
        text = `${periodText}共消费${formatCents(a.total_cents)}元，共${a.count}笔。发现${anomalies.count}条异常：${detail}。建议核对重复扣款与凌晨大额交易。`;
      }
    } else {
      const cats = a.categories.slice(0, 5).map((c) => `${c.category} ${formatCents(c.amount_cents)}元（${c.count}笔）`).join("、");
      text = `${periodText}共消费${formatCents(a.total_cents)}元，共${a.count}笔。最多的是${a.top_category}，${formatCents(a.top_amount_cents)}元。分类明细：${cats}。`;
    }

    const check = validateNumericClaims(text, ctx.facts.list());
    if (!check.ok) {
      ctx.audit.append({ trace_id: ctx.traceId, run_id: ctx.runId, step_id: "B3", node_id: "B3", event_type: "hallucination.blocked", payload: { violations: check.violations } });
      text = SAFE_FALLBACK;
    }
    return ctx.ok({ text, violations: check.violations, facts: ctx.facts.list().map((f) => f.id) });
  },
  async rollback() { return { status: "ok" }; },
  async onInterrupt() { return { status: "ok" }; },
};

export function billNodes() {
  return [billBind, billParse, billQuery, billCompose, { ...sealAudit, id: "B4", deps: ["B3"], title: "审计锚定" }];
}
