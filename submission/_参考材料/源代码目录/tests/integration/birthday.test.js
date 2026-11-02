import test from "node:test";
import assert from "node:assert/strict";
import { makeTestApp } from "../helpers.js";

test("生日跨场景：授权 → 计划审批 → 冻结 → 定时下单 → 到期扣款", async () => {
  const { app, cleanup } = makeTestApp();
  try {
    const r = await app.orchestrator.handleMessage({ userId: "user_1001", text: "我爱人生日快到了，帮我准备，预算1000" });
    assert.equal(r.view.run.status, "awaiting_user");
    assert.match(r.reply, /日历/);

    const consent = await app.orchestrator.handleClarify(r.run_id, "授权");
    assert.equal(consent.view.run.status, "awaiting_user");
    const appr = consent.view.approvals.find((a) => a.status === "pending");
    assert.ok(appr);
    assert.equal(appr.envelope.required_auth, "user_confirm");

    const approved = await app.orchestrator.handleApproval(r.run_id, { approvalId: appr.id, decision: "approve" });
    assert.equal(approved.view.run.status, "completed");
    assert.equal(app.db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status='scheduled'").get().c, 2);
    assert.equal(app.db.prepare("SELECT COUNT(*) AS c FROM holds WHERE status='active'").get().c, 1);
    assert.equal(app.db.prepare("SELECT COUNT(*) AS c FROM mandates WHERE status='active'").get().c, 1);

    app.clock.advance(7 * 86400000);
    const fired = await app.scheduler.tick();
    assert.equal(fired.fired, 2);
    const orderRuns = app.db.prepare("SELECT id, status FROM runs WHERE scenario='order_commit'").all();
    assert.equal(orderRuns.length, 2);
    assert.ok(orderRuns.every((x) => x.status === "completed"));
    assert.equal(app.db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status='committed'").get().c, 2);
    assert.equal(app.db.prepare("SELECT balance_cents FROM accounts WHERE id='acc_1001'").get().balance_cents, 1930000);
    assert.equal(app.db.prepare("SELECT amount_cents FROM holds WHERE status='active'").get().amount_cents, 30000);
    assert.equal(app.db.prepare("SELECT used_cents FROM mandates").get().used_cents, 70000);
    assert.equal(app.audit.verify().ok, true);
  } finally {
    cleanup();
  }
});

test("生日计划完成后可撤销：取消订单、退款、释放冻结、撤销授权", async () => {
  const { app, cleanup } = makeTestApp();
  try {
    const r = await app.orchestrator.handleMessage({ userId: "user_1001", text: "我爱人生日快到了，帮我准备，预算1000" });
    await app.orchestrator.handleClarify(r.run_id, "授权");
    const view = app.orchestrator.getRun(r.run_id);
    const appr = view.approvals.find((a) => a.status === "pending");
    await app.orchestrator.handleApproval(r.run_id, { approvalId: appr.id, decision: "approve" });
    app.clock.advance(7 * 86400000);
    await app.scheduler.tick();
    assert.equal(app.db.prepare("SELECT balance_cents FROM accounts WHERE id='acc_1001'").get().balance_cents, 1930000);

    const undone = await app.orchestrator.handleUndo(r.run_id);
    assert.equal(undone.view.run.status, "reversed");
    assert.equal(app.db.prepare("SELECT COUNT(*) c FROM orders WHERE status='canceled'").get().c, 2);
    assert.equal(app.db.prepare("SELECT COUNT(*) c FROM holds WHERE status='active'").get().c, 0);
    assert.equal(app.db.prepare("SELECT status FROM mandates").get().status, "revoked");
    assert.equal(app.db.prepare("SELECT balance_cents FROM accounts WHERE id='acc_1001'").get().balance_cents, 2000000);
    assert.equal(app.audit.verify().ok, true);
  } finally {
    cleanup();
  }
});
