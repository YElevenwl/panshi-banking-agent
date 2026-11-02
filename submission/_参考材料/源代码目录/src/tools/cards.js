import { newId } from "../core/ids.js";

export function apply(params, ctx) {
  const id = newId("card");
  ctx.db
    .prepare("INSERT INTO cards(id, user_id, name, status, limit_cents, created_at) VALUES(?,?,?, 'pending', ?, ?)")
    .run(id, ctx.userId, params.card_type || "虚拟卡", params.limit_cents || 100000, ctx.clock.nowIso());
  return { card_id: id, status: "pending", card_type: params.card_type || "虚拟卡" };
}

export function freeze(params, ctx) {
  const card = ctx.db.prepare("SELECT * FROM cards WHERE id=? AND user_id=?").get(params.card_id, ctx.userId);
  if (!card) return { card_id: params.card_id, status: "not_found" };
  ctx.db.prepare("UPDATE cards SET status='frozen' WHERE id=?").run(card.id);
  return { card_id: card.id, status: "frozen" };
}

export function unfreeze(params, ctx) {
  const card = ctx.db.prepare("SELECT * FROM cards WHERE id=? AND user_id=?").get(params.card_id, ctx.userId);
  if (!card) return { card_id: params.card_id, status: "not_found" };
  ctx.db.prepare("UPDATE cards SET status='active' WHERE id=?").run(card.id);
  return { card_id: card.id, status: "active" };
}
