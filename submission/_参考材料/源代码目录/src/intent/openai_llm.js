import { config } from "../config.js";
import { parseAmountToCents } from "../core/money.js";
import { normalizeProposal } from "./schema.js";

const SYSTEM = `你是银行 AI 智能体的意图解析器。你只输出 JSON，不决定权限，不执行任何动作。
可用意图：transfer.create, transfer.schedule, transfer.split, bill.analyze, bill.anomaly,
birthday.plan, subscription.cancel, card.freeze, card.unfreeze, out_of_scope, clarify。
金额统一用整数分（800 元 => 80000）。缺少关键槽位时放进 ambiguities，不要猜测。
输出格式：
{"intent":"...","confidence":0.0-1.0,"slots":{...},"ambiguities":["..."],"rationale":"不超过80字"}`;

function normalizeAmounts(p) {
  const slots = p.slots || {};
  // 兼容真实模型常见的别名字段
  if (!slots.payee_name) slots.payee_name = slots.recipient || slots.payee || slots.name || null;
  if (!slots.memo) slots.memo = slots.note || slots.remark || slots.purpose || "";
  if (slots.amount_cents !== undefined && !Number.isInteger(slots.amount_cents)) {
    const n = Number(slots.amount_cents);
    if (Number.isFinite(n)) slots.amount_cents = Math.round(n);
  }
  if (slots.amount && !slots.amount_cents) {
    const cents = parseAmountToCents(String(slots.amount));
    if (cents) slots.amount_cents = cents;
  }
  if (slots.budget_cents !== undefined && !Number.isInteger(slots.budget_cents)) {
    const n = Number(slots.budget_cents);
    if (Number.isFinite(n)) slots.budget_cents = Math.round(n);
  }
  return p;
}

function parseJsonContent(content) {
  const raw = String(content || "").trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = fenced ? fenced[1].trim() : raw;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const candidate = start >= 0 && end > start ? text.slice(start, end + 1) : text;
  return JSON.parse(candidate);
}

let lastCallAt = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function openaiPropose({ text, clock }) {
  if (config.llm.minIntervalMs > 0) {
    const wait = config.llm.minIntervalMs - (Date.now() - lastCallAt);
    if (wait > 0) await sleep(wait);
  }
  lastCallAt = Date.now();
  const isDefaultOpenAI = /api\.openai\.com/.test(config.llm.baseUrl);
  if (!config.llm.apiKey && isDefaultOpenAI) {
    throw new Error("OPENAI_API_KEY 未配置");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.llm.timeoutMs);
  try {
    const body = {
      model: config.llm.model,
      temperature: 0,
      messages: [
        { role: "system", content: `${SYSTEM}\n当前时间：${clock.nowIso()}，时区 Asia/Shanghai。` },
        { role: "user", content: text },
      ],
    };
    if (config.llm.jsonMode) body.response_format = { type: "json_object" };
    const url = `${config.llm.baseUrl.replace(/\/$/, "")}${config.llm.chatPath}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.llm.apiKey || "local"}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content;
    const parsed = normalizeAmounts(parseJsonContent(content));
    return normalizeProposal({ ...parsed, source: "openai", raw: content });
  } finally {
    clearTimeout(timer);
  }
}
