import { newId } from "../core/ids.js";
import { canonicalJson } from "../core/canonical.js";

export function create(params, ctx) {
  const existing = ctx.db
    .prepare("SELECT * FROM mandates WHERE user_id=? AND status='active' ORDER BY created_at DESC")
    .get(ctx.userId);
  if (existing && params.reuse_existing) return existing;
  const id = newId("mnd");
  ctx.db
    .prepare(
      "INSERT INTO mandates(id, user_id, scope_json, max_cents, used_cents, expires_at, status, created_at) " +
        "VALUES(?,?,?,?,0,?, 'active', ?)",
    )
    .run(id, ctx.userId, canonicalJson(params.scope || {}), params.max_cents, params.expires_at, ctx.clock.nowIso());
  return ctx.db.prepare("SELECT * FROM mandates WHERE id=?").get(id);
}

export function revoke(params, ctx) {
  ctx.db.prepare("UPDATE mandates SET status='revoked' WHERE id=? AND user_id=?").run(params.mandate_id, ctx.userId);
  return ctx.db.prepare("SELECT * FROM mandates WHERE id=?").get(params.mandate_id);
}
