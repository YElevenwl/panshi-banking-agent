import { parseAmountToCents } from "../core/money.js";
import { normalizeProposal } from "./schema.js";

function cleanName(s) {
  return String(s || "")
    .replace(/[，,。.!！?？\s]/g, "")
    .replace(/^(我的|我|给|向|帮|请|麻烦)/, "")
    .replace(/(一下|吧|呢|啊|呀)$/g, "")
    .slice(0, 20);
}

function periodOf(text) {
  if (/上个月|上月/.test(text)) return "last_month";
  if (/本月|这个月|当月/.test(text)) return "this_month";
  if (/年度|一年|今年|全年/.test(text)) return "year";
  return "last_month";
}

function categoryOf(text) {
  for (const c of ["餐饮", "交通", "购物", "娱乐", "居住", "医疗"]) {
    if (text.includes(c)) return c;
  }
  return null;
}

function dueAtOf(text, clock) {
  const d = clock.now();
  const setNine = () => {
    d.setHours(9, 0, 0, 0);
    return d.toISOString();
  };
  if (/明天/.test(text)) {
    d.setDate(d.getDate() + 1);
    return setNine();
  }
  if (/后天/.test(text)) {
    d.setDate(d.getDate() + 2);
    return setNine();
  }
  if (/下周/.test(text)) {
    d.setDate(d.getDate() + 7);
    return setNine();
  }
  const explicit = text.match(/(\d{4}-\d{2}-\d{2})/);
  if (explicit) {
    d.setTime(new Date(`${explicit[1]}T09:00:00+08:00`).getTime());
    return d.toISOString();
  }
  return null;
}

function extractTransfer(text, clock) {
  const patterns = [
    { re: /给(.{1,12}?)(?:转|转账|打|汇)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?|[一二三四五六七八九十百千万两]+)\s*(?:元|块)?/, payee: 1, amount: 2 },
    { re: /(?:转|转账|打|汇)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?|[一二三四五六七八九十百千万两]+)\s*(?:元|块)?\s*(?:给|到)\s*(.{1,12}?)(?:[，,。.!！?？]|$)/, payee: 2, amount: 1 },
    { re: /(?:给|向)\s*(.{1,12}?)\s*(?:转|转账|打|汇)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:元|块)/, payee: 1, amount: 2 },
  ];
  let payee = null;
  let amountText = null;
  for (const p of patterns) {
    const m = text.match(p.re);
    if (m) {
      payee = cleanName(m[p.payee]);
      amountText = m[p.amount];
      break;
    }
  }
  if (!payee || !amountText) return null;
  const amount = parseAmountToCents(amountText);
  if (!amount) return null;
  const memoMatch = text.match(/备注\s*[:：]?\s*([^，,。.!！?？]{1,30})/);
  const dueAt = dueAtOf(text, clock);
  return {
    payee_name: payee,
    payee_phone: /^\d{11}$/.test(payee) ? payee : null,
    amount_cents: amount,
    memo: memoMatch ? memoMatch[1].trim() : "",
    due_at: dueAt,
  };
}

function extractBirthday(text) {
  const b = text.match(/预算|锁定|准备|计划/);
  const amount = parseAmountToCents(text);
  return {
    budget_cents: amount ?? 100000,
    event_hint: /爱人|老婆|老公|先生|太太/.test(text) ? "爱人" : "生日",
    wants_flower: /鲜花|花/.test(text) || !/蛋糕/.test(text),
    wants_cake: /蛋糕/.test(text) || !/鲜花|花/.test(text),
    explicit_budget: !!amount && !!b,
  };
}

export async function mockPropose({ text, clock }) {
  const t = String(text || "").trim();
  const lower = t.toLowerCase();

  if (/(天气|股票|基金净值预测|写代码|翻译|讲个笑话)/.test(t)) {
    return normalizeProposal({
      intent: "out_of_scope",
      confidence: 0.9,
      slots: { reason: "不在银行业务范围" },
      ambiguity: [],
      source: "mock",
    });
  }

  if (/(查|看|多少).*(别人|他人|朋友|老婆|老公).*(余额|账户)/.test(t) || /所有用户.*手机号/.test(t)) {
    return normalizeProposal({
      intent: "out_of_scope",
      confidence: 0.95,
      slots: { reason: "无权访问他人账户或批量用户信息" },
      source: "mock",
    });
  }

  if (/(卡).*(挂失|冻结|锁定)/.test(t) && !/解/.test(t)) {
    return normalizeProposal({ intent: "card.freeze", confidence: 0.85, slots: { card_hint: t }, source: "mock" });
  }
  if (/(卡).*(解挂|解冻|解锁|恢复)/.test(t)) {
    return normalizeProposal({ intent: "card.unfreeze", confidence: 0.85, slots: { card_hint: t }, source: "mock" });
  }

  if (/(订阅|自动续费|会员)/.test(t) && /(取消|关闭|退订|不要)/.test(t)) {
    const merchant = /视频会员/.test(t) ? "视频会员" : /云存储/.test(t) ? "云存储" : null;
    return normalizeProposal({
      intent: "subscription.cancel",
      confidence: merchant ? 0.9 : 0.6,
      slots: { merchant },
      ambiguities: merchant ? [] : ["要取消哪个订阅？"],
      source: "mock",
    });
  }

  if (/(生日)/.test(t) && /(准备|安排|计划|礼物|鲜花|蛋糕|爱人|老婆|老公|惊喜)/.test(t)) {
    return normalizeProposal({
      intent: "birthday.plan",
      confidence: 0.9,
      slots: extractBirthday(t),
      source: "mock",
    });
  }

  if (/(AA|aa|每人|平摊|收款|凑份子)/.test(t)) {
    const amount = parseAmountToCents(t);
    const people = Number((t.match(/(\d+)\s*(人|个人)/) || [])[1] || 0);
    return normalizeProposal({
      intent: "transfer.split",
      confidence: amount ? 0.8 : 0.4,
      slots: { total_cents: amount, people },
      ambiguities: amount ? [] : ["AA 总金额是多少？"],
      source: "mock",
    });
  }

  if (/(账单|消费|花了|支出|开销|交易|重复扣款|退款)/.test(t) && !/(转|转账|打钱|汇款|给.*转)/.test(t)) {
    const anomaly = /(异常|可疑|重复扣款|不对劲|退款)/.test(t);
    return normalizeProposal({
      intent: anomaly ? "bill.anomaly" : "bill.analyze",
      confidence: 0.92,
      slots: { period: periodOf(t), category: categoryOf(t), ask_anomaly: anomaly },
      source: "mock",
    });
  }

  if (/(转|转账|打钱|汇款|给.*钱)/.test(t)) {
    const slots = extractTransfer(t, clock);
    if (!slots) {
      return normalizeProposal({
        intent: "clarify",
        confidence: 0.4,
        slots: {},
        ambiguities: ["要给谁转、转多少？例如：给张伟转 800 元，备注房租。"],
        source: "mock",
      });
    }
    if (slots.due_at) {
      return normalizeProposal({ intent: "transfer.schedule", confidence: 0.9, slots, source: "mock" });
    }
    return normalizeProposal({ intent: "transfer.create", confidence: 0.92, slots, source: "mock" });
  }

  if (/密码/.test(t)) {
    return normalizeProposal({
      intent: "out_of_scope",
      confidence: 0.9,
      slots: { reason: "修改密码请前往安全中心，本智能体不直接执行" },
      source: "mock",
    });
  }

  if (/(你好|在吗|hi|hello)/i.test(lower)) {
    return normalizeProposal({
      intent: "out_of_scope",
      confidence: 0.9,
      slots: { reason: "问候" },
      source: "mock",
    });
  }

  return normalizeProposal({
    intent: "out_of_scope",
    confidence: 0.5,
    slots: { reason: "没有识别到明确的银行业务意图" },
    source: "mock",
  });
}
