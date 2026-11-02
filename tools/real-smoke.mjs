process.env.PANSHI_LLM = "openai";
process.env.OPENAI_BASE_URL = "https://text.pollinations.ai";
process.env.OPENAI_CHAT_PATH = "/openai";
process.env.OPENAI_MODEL = "openai-fast";
process.env.PANSHI_LLM_STRICT = "1";

const { proposeIntent } = await import("../src/intent/llm.js");
const { Clock } = await import("../src/core/clock.js");

const clock = new Clock("2026-10-31T09:00:00+08:00");
const text = "给张伟转800，备注房租";
const t0 = Date.now();
const p = await proposeIntent({ text, clock });
console.log(JSON.stringify({ text, source: p.source, intent: p.intent, slots: p.slots, grounding: p.slot_grounding, ms: Date.now() - t0 }, null, 2));
