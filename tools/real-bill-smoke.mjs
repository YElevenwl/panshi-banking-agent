process.env.PANSHI_LLM = "openai";
process.env.OPENAI_BASE_URL = "https://text.pollinations.ai";
process.env.OPENAI_CHAT_PATH = "/openai";
process.env.OPENAI_MODEL = "openai-fast";
process.env.PANSHI_LLM_STRICT = "1";

const { createApp } = await import("../src/app.js");
const app = createApp({ dbPath: ":memory:", auditDir: "../deliverables/tmp-audit", reset: true });
try {
  const r = await app.orchestrator.handleMessage({ userId: "user_1001", text: "上个月账单花了多少" });
  console.log("proposal", JSON.stringify(r.proposal, null, 2));
  console.log("run", r.view.run.status, "reply", r.reply);
  console.log("audit", r.view.audit.filter((e) => e.event_type === "node.failed" || e.event_type === "run.completed").map((e) => e.payload));
} finally {
  app.close();
}
