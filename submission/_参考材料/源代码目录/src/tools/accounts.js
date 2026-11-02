import { resolveAccount, accountView } from "./common.js";

export function balance(params, ctx) {
  const acc = resolveAccount(ctx, params.account_id ?? null);
  return accountView(ctx, acc);
}

export function transactions(params, ctx) {
  const limit = Math.min(Math.max(Number(params.limit || 10), 1), 50);
  const rows = ctx.db
    .prepare(
      "SELECT t.id, t.amount_cents, t.memo, t.status, t.committed_at, p.name AS payee_name " +
        "FROM transfers t LEFT JOIN payees p ON p.id=t.payee_id WHERE t.user_id=? ORDER BY t.committed_at DESC LIMIT ?",
    )
    .all(ctx.userId, limit);
  return { transactions: rows, count: rows.length };
}
