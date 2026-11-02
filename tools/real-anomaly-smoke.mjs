process.env.PANSHI_LLM = "openai";
process.env.OPENAI_BASE_URL = "https://text.pollinations.ai";
process.env.OPENAI_CHAT_PATH = "/openai";
process.env.OPENAI_MODEL = "openai-fast";
process.env.PANSHI_LLM_STRICT = "1";

await new Promise((r) => setTimeout(r, 50000));
const { createApp } = await import("../src/app.js");
const app = createApp({ dbPath: ":memory:", auditDir: "../deliverables/tmp-audit", reset: true });
try {
  const r = await app.orchestrator.handleMessage({ userId: "user_1001", text: "上个月有没有可疑消费" });
  console.log("intent", r.proposal.intent, "source", r.proposal.source);
  console.log("run", r.view.run.status, "reply", r.reply);
} finally {
  app.close();
}
