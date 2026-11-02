import test from "node:test";
import assert from "node:assert/strict";
import { makeTestApp } from "../helpers.js";
import { paramsHash } from "../../src/core/canonical.js";

test("Permit 正常签发、校验、重放拒绝", () => {
  const { app, cleanup } = makeTestApp();
  try {
    const params = { account_id: "acc_1001", amount_cents: 80000, expires_at: "2026-10-31T02:00:00.000Z" };
    const p = app.permits.issue({
      run_id: "r1", step_id: "N5", subject: "user_1001", tool: "ledger.hold",
      params, max_amount_cents: 80000, decision: "CONFIRM", auth_level: "user_confirm",
      approver_ids: ["user_1001"], ttl_ms: 5 * 60 * 1000,
    });
    const row = app.permits.verify({ token: p.token, tool: "ledger.hold", params, subject: "user_1001", amount_cents: 80000 });
    assert.equal(row.used, 1);
    assert.throws(
      () => app.permits.verify({ token: p.token, tool: "ledger.hold", params, subject: "user_1001" }),
      /已被使用/,
    );
  } finally {
    cleanup();
  }
});

test("Permit 参数篡改、主体篡改、签名篡改全部拒绝", () => {
  const { app, cleanup } = makeTestApp();
  try {
    const params = { account_id: "acc_1001", amount_cents: 80000, expires_at: "2026-10-31T02:00:00.000Z" };
    const p = app.permits.issue({
      run_id: "r2", step_id: "N5", subject: "user_1001", tool: "ledger.hold",
      params, max_amount_cents: 80000, decision: "CONFIRM", auth_level: "user_confirm",
    });
    assert.throws(
      () => app.permits.verify({ token: p.token, tool: "ledger.hold", params: { ...params, amount_cents: 500000 }, subject: "user_1001" }),
      /参数不匹配/,
    );
    assert.throws(
      () => app.permits.verify({ token: p.token, tool: "ledger.hold", params, subject: "user_1002" }),
      /主体不匹配/,
    );
    const badToken = p.token.slice(0, p.token.indexOf(".")) + ".00";
    assert.throws(
      () => app.permits.verify({ token: badToken, tool: "ledger.hold", params, subject: "user_1001" }),
      /签名无效/,
    );
  } finally {
    cleanup();
  }
});

test("Permit 过期拒绝", () => {
  const { app, cleanup } = makeTestApp();
  try {
    const params = { account_id: "acc_1001", amount_cents: 80000, expires_at: "2026-10-31T02:00:00.000Z" };
    const p = app.permits.issue({
      run_id: "r3", step_id: "N5", subject: "user_1001", tool: "ledger.hold",
      params, max_amount_cents: 80000, decision: "CONFIRM", auth_level: "user_confirm", ttl_ms: -1000,
    });
    assert.throws(() => app.permits.verify({ token: p.token, tool: "ledger.hold", params, subject: "user_1001" }), /已过期/);
  } finally {
    cleanup();
  }
});

test("Permit 参数哈希稳定", () => {
  const a = { b: 2, a: 1 };
  const b = { a: 1, b: 2 };
  assert.equal(paramsHash(a), paramsHash(b));
});
