import test from "node:test";
import assert from "node:assert/strict";
import { evaluateRules } from "../../src/policy/rules.js";

const base = {
  action: "transfer.create",
  amount_cents: 80000,
  projected_daily_cents: 80000,
  daily_limit_cents: 5000000,
  account_status: "active",
  payee_status: "active",
  payee_risk: "low",
  taint: false,
  breaker_state: "CLOSED",
  velocity_count: 0,
  is_new_payee: false,
};

test("纯查询自动执行 GREEN", () => {
  const r = evaluateRules({ ...base, action: "bill.aggregate", amount_cents: 0 });
  assert.equal(r.tier, "GREEN");
  assert.equal(r.decision, "ALLOW");
});

test("800 元转账是 YELLOW 确认", () => {
  const r = evaluateRules(base);
  assert.equal(r.tier, "YELLOW");
  assert.equal(r.decision, "CONFIRM");
  assert.equal(r.required_auth, "user_confirm");
});

test("日累计恰好 1000 元仍是 YELLOW", () => {
  const r = evaluateRules({ ...base, amount_cents: 100000, projected_daily_cents: 100000 });
  assert.equal(r.tier, "YELLOW");
});

test("日累计超过 1000 元升级 RED", () => {
  const r = evaluateRules({ ...base, amount_cents: 100100, projected_daily_cents: 100100 });
  assert.equal(r.tier, "RED");
  assert.equal(r.required_auth, "totp");
  assert.ok(r.reason_codes.includes("TIER_RED_DAILY_CUMULATIVE"));
});

test("拆单投影 1200 元必须 RED", () => {
  const r = evaluateRules({ ...base, amount_cents: 80000, projected_daily_cents: 120000 });
  assert.equal(r.tier, "RED");
});

test("卡片挂失即使金额为 0 也必须 RED", () => {
  const r = evaluateRules({ ...base, action: "card.freeze", amount_cents: 0, projected_daily_cents: 0 });
  assert.equal(r.tier, "RED");
  assert.ok(r.reason_codes.includes("TIER_RED_ALWAYS"));
});

test("注入污染写操作必须 DENY", () => {
  const r = evaluateRules({ ...base, taint: true });
  assert.equal(r.decision, "DENY");
  assert.ok(r.reason_codes.includes("TAINTED_WRITE"));
});

test("黑名单收款人必须 DENY", () => {
  const r = evaluateRules({ ...base, payee_status: "blocked" });
  assert.equal(r.decision, "DENY");
  assert.ok(r.reason_codes.includes("PAYEE_BLOCKED"));
});

test("熔断 OPEN 时写操作 DENY", () => {
  const r = evaluateRules({ ...base, breaker_state: "OPEN" });
  assert.equal(r.decision, "DENY");
  assert.ok(r.reason_codes.includes("BREAKER_OPEN"));
});

test("超过硬上限 DENY", () => {
  const r = evaluateRules({ ...base, amount_cents: 5000001, projected_daily_cents: 5000001 });
  assert.equal(r.decision, "DENY");
  assert.ok(r.reason_codes.includes("HARD_CAP_EXCEEDED"));
});

test("Mandate 覆盖的订单自动执行", () => {
  const r = evaluateRules({
    ...base,
    action: "order.commit",
    amount_cents: 30000,
    projected_daily_cents: 30000,
    mandate: { id: "m1", active: true, scope_ok: true, remaining_cents: 100000 },
  });
  assert.equal(r.decision, "ALLOW");
  assert.equal(r.required_auth, "mandate");
  assert.ok(r.reason_codes.includes("MANDATE_COVERED"));
});

test("未知写动作默认拒绝", () => {
  const r = evaluateRules({ ...base, action: "delete.everything" });
  assert.equal(r.decision, "DENY");
  assert.ok(r.reason_codes.includes("UNKNOWN_ACTION"));
});
