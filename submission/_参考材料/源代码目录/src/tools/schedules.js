import { newId } from "../core/ids.js";
import { canonicalJson } from "../core/canonical.js";
import { requireOwnedPayee } from "./common.js";

export function scheduleTransfer(params, ctx) {
  requireOwnedPayee(ctx, params.payee_id);
  const existing = ctx.db.prepare("SELECT * FROM scheduled_jobs WHERE idempotency_key=?").get(ctx.idempotencyKey);
  if (existing) return existing;
  const id = newId("job");
  ctx.db
    .prepare(
      "INSERT INTO scheduled_jobs(id, run_id, user_id, scenario, due_at, status, idempotency_key, payload_json, created_at) " +
        "VALUES(?,?,?, 'transfer_due', ?, 'pending', ?, ?, ?)",
    )
    .run(id, newId("run"), ctx.userId, params.due_at, ctx.idempotencyKey, canonicalJson({
      payee_id: params.payee_id,
      amount_cents: params.amount_cents,
      memo: params.memo || "",
    }), ctx.clock.nowIso());
  return ctx.db.prepare("SELECT * FROM scheduled_jobs WHERE id=?").get(id);
}

export function cancelJob(params, ctx) {
  const job = ctx.db.prepare("SELECT * FROM scheduled_jobs WHERE id=? AND user_id=?").get(params.job_id, ctx.userId);
  if (!job) return { job_id: params.job_id, status: "not_found" };
  ctx.db.prepare("UPDATE scheduled_jobs SET status='canceled' WHERE id=?").run(job.id);
  return { job_id: job.id, status: "canceled", due_at: job.due_at };
}
