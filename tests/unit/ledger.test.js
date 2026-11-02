import test from "node:test";
import assert from "node:assert/strict";
import { makeTestApp } from "../helpers.js";
import {
  createHold, releaseHold, commitTransfer, reverseTransfer, availableCents,
  dailyUsageCents, transferCountToday,
} from "../../src/state/ledger.js";

function hold(app, key, amount = 80000) {
  return createHold({
    db: app.db, accountId: "acc_1001", userId: "user_1001", amountCents: amount,
    idempotencyKey: key, expiresAt: "2026-11-01T00:00:00.000Z",
    nowIso: app.clock.nowIso(), bizDate: app.clock.todayKey(),
  });
}

test("冻结释放与余额可用性", () => {
  const { app, cleanup } = makeTestApp();
  try {
    assert.equal(availableCents(app.db, "acc_1001", app.clock.nowIso()), 2000000);
    const h = hold(app, "h1");
    assert.equal(availableCents(app.db, "acc_1001", app.clock.nowIso()), 1920000);
    releaseHold({ db: app.db, holdId: h.id, nowIso: app.clock.nowIso() });
    assert.equal(availableCents(app.db, "acc_1001", app.clock.nowIso()), 2000000);
  } finally {
    cleanup();
  }
});

test("转账提交扣款、日累计、冲正恢复", () => {
  const { app, cleanup } = makeTestApp();
  try {
    const h = hold(app, "h2");
    const tr = commitTransfer({
      db: app.db, userId: "user_1001", accountId: "acc_1001", payeeId: "payee_88",
      amountCents: 80000, memo: "房租", holdId: h.id, idempotencyKey: "t1",
      permitId: "permit_1", nowIso: app.clock.nowIso(), bizDate: app.clock.todayKey(),
    });
    assert.equal(app.db.prepare("SELECT balance_cents FROM accounts WHERE id='acc_1001'").get().balance_cents, 1920000);
    assert.equal(dailyUsageCents(app.db, "user_1001", app.clock.todayKey()), 80000);
    assert.equal(transferCountToday(app.db, "user_1001", app.clock.todayKey()), 1);

    const dup = commitTransfer({
      db: app.db, userId: "user_1001", accountId: "acc_1001", payeeId: "payee_88",
      amountCents: 80000, memo: "房租", holdId: h.id, idempotencyKey: "t1",
      permitId: "permit_1", nowIso: app.clock.nowIso(), bizDate: app.clock.todayKey(),
    });
    assert.equal(dup.id, tr.id);

    reverseTransfer({ db: app.db, transferId: tr.id, nowIso: app.clock.nowIso() });
    assert.equal(app.db.prepare("SELECT balance_cents FROM accounts WHERE id='acc_1001'").get().balance_cents, 2000000);
  } finally {
    cleanup();
  }
});
