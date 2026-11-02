import test from "node:test";
import assert from "node:assert/strict";
import { makeTestApp } from "../helpers.js";

test("审计哈希链可校验，UPDATE/DELETE 被 trigger 阻断", () => {
  const { app, cleanup } = makeTestApp();
  try {
    for (let i = 0; i < 5; i += 1) {
      app.audit.append({ trace_id: "tr_test", event_type: "test.event", payload: { i } });
    }
    const v = app.audit.verify();
    assert.equal(v.ok, true);
    assert.equal(v.count >= 5, true);
    assert.throws(() => app.db.prepare("UPDATE audit_events SET payload_json='{}' WHERE seq=1").run(), /append-only/);
    assert.throws(() => app.db.prepare("DELETE FROM audit_events WHERE seq=1").run(), /append-only/);
  } finally {
    cleanup();
  }
});

test("每 100 条写入 Merkle 锚点", () => {
  const { app, cleanup } = makeTestApp();
  try {
    for (let i = 0; i < 100; i += 1) {
      app.audit.append({ trace_id: "tr_anchor", event_type: "anchor.event", payload: { i } });
    }
    const anchors = app.db.prepare("SELECT * FROM audit_anchors").all();
    assert.ok(anchors.length >= 1);
    const v = app.audit.verify();
    assert.equal(v.ok, true);
    assert.ok(v.anchors >= 1);
  } finally {
    cleanup();
  }
});

test("时间线按 trace 隔离", () => {
  const { app, cleanup } = makeTestApp();
  try {
    app.audit.append({ trace_id: "tr_a", event_type: "a" });
    app.audit.append({ trace_id: "tr_b", event_type: "b" });
    assert.equal(app.audit.timeline("tr_a").length, 1);
    assert.equal(app.audit.timeline("tr_a")[0].event_type, "a");
  } finally {
    cleanup();
  }
});
