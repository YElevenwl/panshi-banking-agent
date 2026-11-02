import test from "node:test";
import assert from "node:assert/strict";
import { makeTestApp } from "../helpers.js";

test("账单分析：数字全部来自账单工具，零无依据数字", async () => {
  const { app, cleanup } = makeTestApp();
  try {
    const r = await app.orchestrator.handleMessage({ userId: "user_1001", text: "帮我看看上个月账单" });
    assert.equal(r.view.run.status, "completed");
    assert.match(r.reply, /8779\.00/);
    assert.match(r.reply, /24笔/);
    assert.equal(r.view.state.outputs.B3.violations.length, 0);
    assert.equal(app.audit.verify().ok, true);
  } finally {
    cleanup();
  }
});

test("异常识别：重复扣款与凌晨大额被合并报告", async () => {
  const { app, cleanup } = makeTestApp();
  try {
    const r = await app.orchestrator.handleMessage({ userId: "user_1001", text: "上个月有没有可疑消费" });
    assert.equal(r.view.run.status, "completed");
    assert.match(r.reply, /异常/);
    assert.match(r.reply, /888\.00/);
    assert.equal(r.view.state.outputs.B3.violations.length, 0);
  } finally {
    cleanup();
  }
});

test("超范围请求走兜底，不调用工具", async () => {
  const { app, cleanup } = makeTestApp();
  try {
    const r = await app.orchestrator.handleMessage({ userId: "user_1001", text: "帮我写一段 Python 代码" });
    assert.equal(r.view.run.status, "completed");
    assert.match(r.reply, /专注银行业务/);
    assert.equal(r.view.audit.filter((e) => e.event_type === "tool.executed").length, 0);
  } finally {
    cleanup();
  }
});
