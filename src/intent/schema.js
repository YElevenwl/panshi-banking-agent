export const INTENTS = new Set([
  "transfer.create",
  "transfer.schedule",
  "transfer.split",
  "bill.analyze",
  "bill.anomaly",
  "birthday.plan",
  "subscription.cancel",
  "card.freeze",
  "card.unfreeze",
  "out_of_scope",
  "clarify",
]);

const INTENT_ALIASES = {
  transfer: "transfer.create", payment: "transfer.create", pay: "transfer.create",
  bill: "bill.analyze", bill_analysis: "bill.analyze", bill_query: "bill.analyze",
  bill_anomalies: "bill.anomaly", anomaly: "bill.anomaly",
  birthday: "birthday.plan", subscription_cancel: "subscription.cancel",
  card_freeze: "card.freeze", card_unfreeze: "card.unfreeze",
};

const PERIOD_ALIASES = {
  "last month": "last_month", "last-month": "last_month", previous_month: "last_month",
  "上个月": "last_month", "上月": "last_month",
  "this month": "this_month", "this-month": "this_month", "本月": "this_month", "这个月": "this_month",
  annual: "year", "this year": "year", "今年": "year", "年度": "year",
};

export function normalizeProposal(raw) {
  const p = raw && typeof raw === "object" ? raw : {};
  const intent = INTENTS.has(p.intent) ? p.intent : (INTENT_ALIASES[p.intent] || "out_of_scope");
  const slots = p.slots && typeof p.slots === "object" ? { ...p.slots } : {};
  if (slots.period) {
    const key = String(slots.period).toLowerCase().trim();
    slots.period = PERIOD_ALIASES[key] || slots.period;
  }
  return {
    intent,
    confidence: Number.isFinite(Number(p.confidence)) ? Math.max(0, Math.min(1, Number(p.confidence))) : 0.3,
    slots,
    ambiguities: Array.isArray(p.ambiguities) ? p.ambiguities.slice(0, 4) : [],
    evidence_refs: Array.isArray(p.evidence_refs) ? p.evidence_refs : [],
    rationale: typeof p.rationale === "string" ? p.rationale.slice(0, 300) : "",
    source: p.source || "unknown",
    raw: p.raw ?? null,
  };
}

export function validateProposal(p) {
  if (!p || typeof p !== "object") throw new Error("提案不是对象");
  if (!INTENTS.has(p.intent)) throw new Error(`未知意图: ${p.intent}`);
  if (typeof p.confidence !== "number" || p.confidence < 0 || p.confidence > 1) throw new Error("置信度非法");
  if (!p.slots || typeof p.slots !== "object") throw new Error("槽位非法");
  return p;
}
