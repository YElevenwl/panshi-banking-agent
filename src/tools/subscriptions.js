export function list(params, ctx) {
  const rows = ctx.db.prepare("SELECT * FROM subscriptions WHERE user_id=? ORDER BY next_charge_at").all(ctx.userId);
  return { subscriptions: rows, count: rows.length };
}

export function cancel(params, ctx) {
  const row = ctx.db.prepare("SELECT * FROM subscriptions WHERE id=? AND user_id=?").get(params.subscription_id, ctx.userId);
  if (!row) return { subscription_id: params.subscription_id, status: "not_found" };
  ctx.db.prepare("UPDATE subscriptions SET status='canceled' WHERE id=?").run(row.id);
  return { subscription_id: row.id, merchant: row.merchant, status: "canceled" };
}
