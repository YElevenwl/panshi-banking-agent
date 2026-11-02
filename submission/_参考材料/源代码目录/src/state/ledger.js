import { newId } from "../core/ids.js";
import { AppError, conflict } from "../core/errors.js";
import { tx } from "./db.js";

function requirePositive(amountCents) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new AppError("INVALID_AMOUNT", "金额必须为正整数（分）");
  }
}

export function releaseExpiredHolds(db, nowIso) {
  const res = db
    .prepare(
      "UPDATE holds SET status='released', released_at=? WHERE status='active' AND expires_at <= ?",
    )
    .run(nowIso, nowIso);
  return res.changes;
}

export function getAccount(db, accountId) {
  const row = db.prepare("SELECT * FROM accounts WHERE id = ?").get(accountId);
  if (!row) throw new AppError("ACCOUNT_NOT_FOUND", `账户不存在: ${accountId}`, { status: 404 });
  return row;
}

export function activeHoldsCents(db, accountId) {
  return db
    .prepare("SELECT COALESCE(SUM(amount_cents), 0) AS c FROM holds WHERE account_id=? AND status='active'")
    .get(accountId).c;
}

export function availableCents(db, accountId, nowIso) {
  releaseExpiredHolds(db, nowIso);
  const acc = getAccount(db, accountId);
  return acc.balance_cents - activeHoldsCents(db, accountId);
}

export function dailyUsageCents(db, userId, bizDate) {
  const transfers = db
    .prepare(
      "SELECT COALESCE(SUM(amount_cents), 0) AS c FROM transfers WHERE user_id=? AND biz_date=? AND status='committed'",
    )
    .get(userId, bizDate).c;
  const holds = db
    .prepare(
      "SELECT COALESCE(SUM(amount_cents), 0) AS c FROM holds WHERE user_id=? AND biz_date=? AND status='active'",
    )
    .get(userId, bizDate).c;
  return transfers + holds;
}

export function transferCountToday(db, userId, bizDate) {
  return db
    .prepare(
      "SELECT COUNT(*) AS c FROM transfers WHERE user_id=? AND biz_date=? AND status='committed'",
    )
    .get(userId, bizDate).c;
}

export function createHold({
  db,
  accountId,
  userId,
  amountCents,
  idempotencyKey,
  expiresAt,
  nowIso,
  bizDate,
}) {
  requirePositive(amountCents);
  return tx(db, () => {
    const existing = db.prepare("SELECT * FROM holds WHERE idempotency_key=?").get(idempotencyKey);
    if (existing) return existing;
    releaseExpiredHolds(db, nowIso);
    const acc = getAccount(db, accountId);
    if (acc.status !== "active") throw new AppError("ACCOUNT_FROZEN", "账户状态不可用");
    const available = acc.balance_cents - activeHoldsCents(db, accountId);
    if (available < amountCents) {
      throw new AppError("INSUFFICIENT_FUNDS", "可用余额不足", {
        details: { available_cents: available, requested_cents: amountCents },
      });
    }
    const id = newId("hold");
    db.prepare(
      "INSERT INTO holds(id, account_id, user_id, amount_cents, status, idempotency_key, expires_at, biz_date, created_at) " +
        "VALUES(?,?,?,?, 'active', ?,?,?,?)",
    ).run(id, accountId, userId, amountCents, idempotencyKey, expiresAt, bizDate, nowIso);
    return db.prepare("SELECT * FROM holds WHERE id=?").get(id);
  });
}

export function releaseHold({ db, holdId, nowIso }) {
  return tx(db, () => {
    const hold = db.prepare("SELECT * FROM holds WHERE id=?").get(holdId);
    if (!hold) throw new AppError("HOLD_NOT_FOUND", `冻结不存在: ${holdId}`, { status: 404 });
    if (hold.status === "released") return { ...hold, already: true };
    if (hold.status !== "active") {
      throw new AppError("HOLD_NOT_RELEASABLE", `冻结状态不可释放: ${hold.status}`, { status: 409 });
    }
    db.prepare("UPDATE holds SET status='released', released_at=? WHERE id=? AND status='active'").run(nowIso, holdId);
    return db.prepare("SELECT * FROM holds WHERE id=?").get(holdId);
  });
}

export function commitTransfer({
  db,
  userId,
  accountId,
  payeeId,
  amountCents,
  memo,
  holdId,
  idempotencyKey,
  permitId,
  nowIso,
  bizDate,
}) {
  requirePositive(amountCents);
  return tx(db, () => {
    const dup = db.prepare("SELECT * FROM transfers WHERE idempotency_key=?").get(idempotencyKey);
    if (dup) return dup;
    const hold = db.prepare("SELECT * FROM holds WHERE id=?").get(holdId);
    if (!hold) throw new AppError("HOLD_NOT_FOUND", "冻结不存在", { status: 404 });
    if (hold.status !== "active") throw new AppError("HOLD_NOT_ACTIVE", `冻结状态不可用: ${hold.status}`, { status: 409 });
    if (hold.user_id !== userId || hold.account_id !== accountId || hold.amount_cents !== amountCents) {
      throw conflict("冻结与转账参数不匹配", { hold_id: holdId });
    }
    if (hold.expires_at <= nowIso) throw new AppError("HOLD_EXPIRED", "冻结已过期", { status: 409 });

    const acc = getAccount(db, accountId);
    if (acc.status !== "active") throw new AppError("ACCOUNT_FROZEN", "账户状态不可用");
    if (acc.balance_cents < amountCents) throw new AppError("INSUFFICIENT_FUNDS", "余额不足");

    const transferId = newId("tx");
    db.prepare("UPDATE accounts SET balance_cents = balance_cents - ? WHERE id=?").run(amountCents, accountId);
    db.prepare("UPDATE holds SET status='captured', captured_at=? WHERE id=?").run(nowIso, holdId);
    db.prepare(
      "INSERT INTO ledger_entries(id, account_id, direction, amount_cents, ref_type, ref_id, memo, created_at) VALUES(?,?,?,?,?,?,?,?)",
    ).run(newId("le"), accountId, "debit", amountCents, "transfer", transferId, memo || "", nowIso);
    db.prepare(
      "INSERT INTO ledger_entries(id, account_id, direction, amount_cents, ref_type, ref_id, memo, created_at) VALUES(?,?,?,?,?,?,?,?)",
    ).run(newId("le"), "acc_settlement", "credit", amountCents, "transfer", transferId, memo || "", nowIso);
    db.prepare(
      "INSERT INTO transfers(id, user_id, account_id, payee_id, amount_cents, memo, status, idempotency_key, permit_id, biz_date, created_at, committed_at) " +
        "VALUES(?,?,?,?,?,?, 'committed', ?,?,?,?,?)",
    ).run(transferId, userId, accountId, payeeId, amountCents, memo || "", idempotencyKey, permitId, bizDate, nowIso, nowIso);

    return db.prepare("SELECT * FROM transfers WHERE id=?").get(transferId);
  });
}

export function reverseTransfer({ db, transferId, nowIso, windowMs = 10 * 60 * 1000 }) {
  return tx(db, () => {
    const tr = db.prepare("SELECT * FROM transfers WHERE id=?").get(transferId);
    if (!tr) throw new AppError("TRANSFER_NOT_FOUND", "转账不存在", { status: 404 });
    if (tr.status === "reversed") return { ...tr, already: true };
    if (tr.status !== "committed") throw conflict("转账状态不可冲正", { status: tr.status });
    const committedMs = new Date(tr.committed_at).getTime();
    const nowMs = new Date(nowIso).getTime();
    if (Number.isFinite(committedMs) && nowMs - committedMs > windowMs) {
      throw new AppError("REVERSAL_WINDOW_EXPIRED", "超过冲正窗口，请走争议流程", { status: 409 });
    }
    db.prepare("UPDATE accounts SET balance_cents = balance_cents + ? WHERE id=?").run(tr.amount_cents, tr.account_id);
    db.prepare(
      "INSERT INTO ledger_entries(id, account_id, direction, amount_cents, ref_type, ref_id, memo, created_at) VALUES(?,?,?,?,?,?,?,?)",
    ).run(newId("le"), tr.account_id, "credit", tr.amount_cents, "transfer_reversal", transferId, "冲正", nowIso);
    db.prepare(
      "INSERT INTO ledger_entries(id, account_id, direction, amount_cents, ref_type, ref_id, memo, created_at) VALUES(?,?,?,?,?,?,?,?)",
    ).run(newId("le"), "acc_settlement", "debit", tr.amount_cents, "transfer_reversal", transferId, "冲正", nowIso);
    db.prepare("UPDATE transfers SET status='reversed', reversed_at=? WHERE id=?").run(nowIso, transferId);
    return db.prepare("SELECT * FROM transfers WHERE id=?").get(transferId);
  });
}

export function captureHoldPartialTx(db, { holdId, userId, amountCents, refId, memo = "", nowIso }) {
  requirePositive(amountCents);
  const hold = db.prepare("SELECT * FROM holds WHERE id=?").get(holdId);
  if (!hold) throw new AppError("HOLD_NOT_FOUND", "冻结不存在", { status: 404 });
  if (hold.user_id !== userId) throw new AppError("HOLD_SUBJECT_MISMATCH", "冻结不属于当前用户", { status: 403 });
  if (hold.status !== "active") throw new AppError("HOLD_NOT_ACTIVE", `冻结状态不可用: ${hold.status}`, { status: 409 });
  if (hold.amount_cents < amountCents) throw new AppError("HOLD_INSUFFICIENT", "冻结余额不足", { status: 409 });
  const acc = getAccount(db, hold.account_id);
  if (acc.status !== "active") throw new AppError("ACCOUNT_FROZEN", "账户状态不可用");
  if (acc.balance_cents < amountCents) throw new AppError("INSUFFICIENT_FUNDS", "余额不足");
  const remaining = hold.amount_cents - amountCents;
  db.prepare("UPDATE holds SET amount_cents=?, status=?, captured_at=? WHERE id=?")
    .run(remaining, remaining === 0 ? "captured" : "active", nowIso, holdId);
  db.prepare("UPDATE accounts SET balance_cents = balance_cents - ? WHERE id=?").run(amountCents, hold.account_id);
  db.prepare(
    "INSERT INTO ledger_entries(id, account_id, direction, amount_cents, ref_type, ref_id, memo, created_at) VALUES(?,?,?,?,?,?,?,?)",
  ).run(newId("le"), hold.account_id, "debit", amountCents, "order", refId, memo, nowIso);
  db.prepare(
    "INSERT INTO ledger_entries(id, account_id, direction, amount_cents, ref_type, ref_id, memo, created_at) VALUES(?,?,?,?,?,?,?,?)",
  ).run(newId("le"), "acc_settlement", "credit", amountCents, "order", refId, memo, nowIso);
  return { hold_id: holdId, captured_cents: amountCents, remaining_cents: remaining };
}

export function captureHoldPartial(args) {
  return tx(args.db, () => captureHoldPartialTx(args.db, args));
}

export function getBalanceCents(db, accountId) {
  return getAccount(db, accountId).balance_cents;
}
