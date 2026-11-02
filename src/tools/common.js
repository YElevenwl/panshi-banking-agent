import { getAccount, availableCents } from "../state/ledger.js";
import { AppError, forbidden } from "../core/errors.js";

export function primaryAccount(db, userId) {
  const acc = db.prepare("SELECT * FROM accounts WHERE user_id=? AND status='active' ORDER BY created_at LIMIT 1").get(userId);
  if (!acc) throw new AppError("ACCOUNT_NOT_FOUND", "用户没有可用账户", { status: 404 });
  return acc;
}

export function resolveAccount(ctx, accountId = null) {
  const acc = accountId ? getAccount(ctx.db, accountId) : primaryAccount(ctx.db, ctx.userId);
  if (acc.user_id !== ctx.userId) throw forbidden("账户不属于当前用户");
  return acc;
}

export function accountView(ctx, acc) {
  return {
    account_id: acc.id,
    name: acc.name,
    balance_cents: acc.balance_cents,
    available_cents: availableCents(ctx.db, acc.id, ctx.clock.nowIso()),
    status: acc.status,
    currency: acc.currency,
  };
}

export function requireOwnedPayee(ctx, payeeId) {
  const payee = ctx.db.prepare("SELECT * FROM payees WHERE id=?").get(payeeId);
  if (!payee || payee.user_id !== ctx.userId) throw forbidden("收款人不属于当前用户");
  return payee;
}
