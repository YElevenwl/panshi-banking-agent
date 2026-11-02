import { newId } from "../core/ids.js";
import { AppError, conflict } from "../core/errors.js";
import { tx } from "../state/db.js";
import { captureHoldPartialTx } from "../state/ledger.js";

export function schedule(params, ctx) {
  if (params.mandate_id) {
    const m = ctx.db.prepare("SELECT * FROM mandates WHERE id=? AND user_id=?").get(params.mandate_id, ctx.userId);
    if (!m) throw new AppError("MANDATE_NOT_FOUND", "消费授权不存在", { status: 404 });
  }
  return tx(ctx.db, () => {
    const dup = ctx.db.prepare("SELECT * FROM orders WHERE idempotency_key=?").get(ctx.idempotencyKey);
    if (dup) return dup;
    const id = newId("ord");
    const now = ctx.clock.nowIso();
    ctx.db
      .prepare(
        "INSERT INTO orders(id, user_id, merchant, item, amount_cents, status, scheduled_at, merchant_category, mandate_id, hold_id, idempotency_key, created_at) " +
          "VALUES(?,?,?,?,?, 'scheduled', ?,?,?,?,?,?)",
      )
      .run(id, ctx.userId, params.merchant, params.item, params.amount_cents, params.scheduled_at, params.merchant_category || "other", params.mandate_id || null, params.hold_id || null, ctx.idempotencyKey, now);

    // 到期自动提交的调度任务
    const jobId = newId("job");
    ctx.db
      .prepare(
        "INSERT INTO scheduled_jobs(id, run_id, user_id, scenario, due_at, status, idempotency_key, payload_json, created_at) " +
          "VALUES(?,?,?, 'order_commit', ?, 'pending', ?, ?, ?)",
      )
      .run(jobId, newId("run"), ctx.userId, params.scheduled_at, `job:${id}`, JSON.stringify({ order_id: id }), now);
    return ctx.db.prepare("SELECT * FROM orders WHERE id=?").get(id);
  });
}

export function commit(params, ctx) {
  return tx(ctx.db, () => {
    const order = ctx.db.prepare("SELECT * FROM orders WHERE id=? AND user_id=?").get(params.order_id, ctx.userId);
    if (!order) throw new AppError("ORDER_NOT_FOUND", "订单不存在", { status: 404 });
    if (order.status === "committed") return order;
    if (order.status !== "scheduled") throw conflict("订单状态不可提交", { status: order.status });

    if (order.mandate_id) {
      const m = ctx.db.prepare("SELECT * FROM mandates WHERE id=?").get(order.mandate_id);
      if (!m || m.status !== "active" || m.expires_at <= ctx.clock.nowIso()) {
        throw new AppError("MANDATE_INACTIVE", "消费授权已失效", { status: 409 });
      }
      if (m.used_cents + order.amount_cents > m.max_cents) {
        throw new AppError("MANDATE_EXCEEDED", "消费授权额度不足", { status: 409 });
      }
      ctx.db.prepare("UPDATE mandates SET used_cents = used_cents + ? WHERE id=?").run(order.amount_cents, m.id);
    }
    if (order.hold_id) {
      captureHoldPartialTx(ctx.db, {
        holdId: order.hold_id, userId: ctx.userId, amountCents: order.amount_cents,
        refId: order.id, memo: order.item, nowIso: ctx.clock.nowIso(),
      });
    }
    ctx.db.prepare("UPDATE orders SET status='committed', committed_at=? WHERE id=?").run(ctx.clock.nowIso(), order.id);
    return ctx.db.prepare("SELECT * FROM orders WHERE id=?").get(order.id);
  });
}

export function cancel(params, ctx) {
  return tx(ctx.db, () => {
    const order = ctx.db.prepare("SELECT * FROM orders WHERE id=? AND user_id=?").get(params.order_id, ctx.userId);
    if (!order) throw new AppError("ORDER_NOT_FOUND", "订单不存在", { status: 404 });
    if (order.status === "canceled") return order;
    if (order.status === "committed" && order.mandate_id) {
      ctx.db.prepare("UPDATE mandates SET used_cents = MAX(0, used_cents - ?) WHERE id=?").run(order.amount_cents, order.mandate_id);
    }
    if (order.status === "committed" && order.hold_id) {
      const acc = ctx.db.prepare("SELECT * FROM accounts WHERE id=(SELECT account_id FROM holds WHERE id=?)").get(order.hold_id);
      if (acc) {
        ctx.db.prepare("UPDATE accounts SET balance_cents = balance_cents + ? WHERE id=?").run(order.amount_cents, acc.id);
        ctx.db.prepare(
          "INSERT INTO ledger_entries(id, account_id, direction, amount_cents, ref_type, ref_id, memo, created_at) VALUES(?,?,?,?,?,?,?,?)",
        ).run(newId("le"), acc.id, "credit", order.amount_cents, "order_refund", order.id, order.item, ctx.clock.nowIso());
        ctx.db.prepare(
          "INSERT INTO ledger_entries(id, account_id, direction, amount_cents, ref_type, ref_id, memo, created_at) VALUES(?,?,?,?,?,?,?,?)",
        ).run(newId("le"), "acc_settlement", "debit", order.amount_cents, "order_refund", order.id, order.item, ctx.clock.nowIso());
      }
    }
    ctx.db.prepare("UPDATE orders SET status='canceled' WHERE id=?").run(order.id);
    return ctx.db.prepare("SELECT * FROM orders WHERE id=?").get(order.id);
  });
}
