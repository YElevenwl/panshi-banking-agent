process.env.PANSHI_LLM = "openai";
process.env.OPENAI_BASE_URL = "https://text.pollinations.ai";
process.env.OPENAI_CHAT_PATH = "/openai";
process.env.OPENAI_MODEL = "openai-fast";
process.env.PANSHI_LLM_STRICT = "1";

await new Promise((r) => setTimeout(r, 50000));
const { createApp } = await import("../src/app.js");
const app = createApp({ dbPath: ":memory:", auditDir: "../deliverables/tmp-audit", reset: true });
try {
  const r = await app.orchestrator.handleMessage({ userId: "user_1001", text: "我爱人生日快到了，帮我准备，预算1000" });
  console.log("intent", r.proposal.intent, "source", r.proposal.source, "status", r.view.run.status);
  const c = await app.orchestrator.handleClarify(r.run_id, "授权");
  console.log("consent", c.view.run.status, c.reply);
  const appr = c.view.approvals.find((a) => a.status === "pending");
  const done = await app.orchestrator.handleApproval(r.run_id, { approvalId: appr.id, decision: "approve" });
  console.log("done", done.view.run.status, done.reply);
} finally {
  app.close();
}
