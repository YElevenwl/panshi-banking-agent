import { formatCents } from "../core/money.js";

const DATE_RE = /\b\d{4}-\d{2}-\d{2}\b/g;
const NUM_RE = /(?<![\w.])\d{1,3}(?:,\d{3})*(?:\.\d+)?(?![\w.])/g;

function normalizeNumberToken(token) {
  const n = Number(String(token).replaceAll(",", ""));
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2).replace(/\.?0+$/, "") || "0";
}

function allowedFromFacts(facts) {
  const allowed = new Set();
  for (const f of facts) {
    const v = f.value;
    if (typeof v === "number") {
      allowed.add(normalizeNumberToken(v));
    } else if (typeof v === "string") {
      allowed.add(v);
      if (/^\d{4}-\d{2}-\d{2}/.test(v)) allowed.add(v.slice(0, 10));
    } else if (v && typeof v === "object") {
      if (typeof v.amount_cents === "number") {
        allowed.add(normalizeNumberToken(v.amount_cents / 100));
        allowed.add(formatCents(v.amount_cents));
      }
      if (typeof v.cents === "number") {
        allowed.add(normalizeNumberToken(v.cents / 100));
        allowed.add(formatCents(v.cents));
      }
      if (typeof v.count === "number") allowed.add(normalizeNumberToken(v.count));
      if (typeof v.percentage === "number") allowed.add(normalizeNumberToken(v.percentage));
      if (typeof v.date === "string") allowed.add(v.date.slice(0, 10));
      if (typeof v.label === "string") allowed.add(v.label);
      if (Array.isArray(v.items)) {
        for (const item of v.items) {
          if (typeof item.amount_cents === "number") {
            allowed.add(normalizeNumberToken(item.amount_cents / 100));
            allowed.add(formatCents(item.amount_cents));
          }
          if (typeof item.count === "number") allowed.add(normalizeNumberToken(item.count));
        }
      }
    }
  }
  return allowed;
}

/**
 * 数字白名单校验：回复中出现的每个数字/日期都必须能在 FactStore 中找到。
 * 返回 { ok, violations }，不抛异常，由调用方决定拒答或替换模板。
 */
export function validateNumericClaims(text, facts) {
  const allowed = allowedFromFacts(facts);
  const violations = [];
  const raw = String(text);
  const dates = raw.match(DATE_RE) || [];
  const textWithoutDates = raw.replace(DATE_RE, " ");
  const numbers = textWithoutDates.match(NUM_RE) || [];
  for (const token of numbers) {
    const norm = normalizeNumberToken(token);
    if (!norm) continue;
    if (!allowed.has(norm)) violations.push({ token, kind: "number" });
  }
  for (const token of dates) {
    if (!allowed.has(token)) violations.push({ token, kind: "date" });
  }
  return { ok: violations.length === 0, violations, allowed: [...allowed].slice(0, 50) };
}

export const SAFE_FALLBACK =
  "根据当前可访问的数据，我无法确认这个数字或状态。你可以让我重新查询余额/账单，或转人工客服核实。";
