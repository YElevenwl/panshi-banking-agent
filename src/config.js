import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function intEnv(name, fallback) {
  const raw = process.env[name];
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  root,
  port: intEnv("PORT", 8787),
  dbPath: process.env.PANSHI_DB || path.join(root, "data", "panshi.db"),
  auditDir: path.join(root, "data", "audit"),
  demoNow: process.env.PANSHI_DEMO_NOW || "2026-10-31T09:00:00+08:00",
  demoMode: process.env.PANSHI_DEMO_MODE !== "0",

  // 资金阈值，单位：分
  dailyYellowLimitCents: 100000, // 1000 元，赛题黄色上限
  hardCapCents: 5000000, // 50,000 元，Demo 硬上限
  dualApprovalCents: 500000, // 5,000 元，触发双人复核（扩展）

  permitSecret: process.env.PANSHI_PERMIT_SECRET || "dev-permit-secret-change-me",
  sessionSecret: process.env.PANSHI_SESSION_SECRET || "dev-session-secret-change-me",
  permitTtlYellowMs: 5 * 60 * 1000,
  permitTtlRedMs: 3 * 60 * 1000,
  approvalTtlYellowMs: 5 * 60 * 1000,
  approvalTtlRedMs: 3 * 60 * 1000,

  breaker: {
    failureThreshold: 5,
    injectionThreshold: 3,
    denialThreshold: 10,
    velocityThreshold: 5,
    openMs: 15 * 60 * 1000,
  },

  llm: {
    provider: process.env.PANSHI_LLM || "mock",
    baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    chatPath: process.env.OPENAI_CHAT_PATH ?? "/chat/completions",
    apiKey: process.env.OPENAI_API_KEY || "",
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    timeoutMs: intEnv("PANSHI_LLM_TIMEOUT_MS", 30000),
    minIntervalMs: intEnv("PANSHI_LLM_MIN_INTERVAL_MS", 0),
    jsonMode: process.env.PANSHI_LLM_JSON_MODE !== "0",
    strict: process.env.PANSHI_LLM_STRICT === "1",
  },

  policyVersion: "policy-2026.10.31",
};
