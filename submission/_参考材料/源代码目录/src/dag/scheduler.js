import { newTraceId } from "../core/ids.js";

export class Scheduler {
  constructor({ db, clock, engine, audit }) {
    this.db = db;
    this.clock = clock;
    this.engine = engine;
    this.audit = audit;
    this.timer = null;
    this.running = false;
  }

  dueJobs() {
    return this.db
      .prepare("SELECT * FROM scheduled_jobs WHERE status='pending' AND due_at <= ? ORDER BY due_at")
      .all(this.clock.nowIso());
  }

  async tick() {
    if (this.running) return { fired: 0 };
    this.running = true;
    const fired = [];
    try {
      for (const job of this.dueJobs()) {
        const upd = this.db.prepare("UPDATE scheduled_jobs SET status='fired', fired_at=? WHERE id=? AND status='pending'").run(this.clock.nowIso(), job.id);
        if (upd.changes !== 1) continue;
        const payload = JSON.parse(job.payload_json || "{}");
        try {
          if (job.scenario === "transfer_due") {
            const payee = this.db.prepare("SELECT * FROM payees WHERE id=? AND user_id=?").get(payload.payee_id, job.user_id);
            if (!payee) throw new Error("收款人不存在");
            const view = await this.engine.start({
              userId: job.user_id,
              scenario: "transfer",
              traceId: newTraceId(),
              input: {
                text: `定时转账：给${payee.name}转${payload.amount_cents / 100}元`,
                channel: "SCHEDULER",
                proposal: {
                  intent: "transfer.create",
                  confidence: 1,
                  slots: {
                    payee_id: payload.payee_id,
                    payee_name: payee.name,
                    amount_cents: payload.amount_cents,
                    memo: payload.memo || "",
                  },
                  ambiguities: [],
                  evidence_refs: [],
                  source: "scheduler",
                },
              },
            });
            fired.push({ job_id: job.id, scenario: "transfer_due", run_id: view.run.id, status: view.run.status });
          } else if (job.scenario === "order_commit") {
            const view = await this.engine.start({
              userId: job.user_id,
              scenario: "order_commit",
              traceId: newTraceId(),
              input: { order_id: payload.order_id, text: "生日订单到期", channel: "SCHEDULER" },
            });
            fired.push({ job_id: job.id, scenario: "order_commit", run_id: view.run.id, status: view.run.status });
          } else {
            throw new Error(`未知调度场景: ${job.scenario}`);
          }
        } catch (err) {
          this.db.prepare("UPDATE scheduled_jobs SET status='failed' WHERE id=?").run(job.id);
          this.audit.append({
            trace_id: "scheduler", event_type: "scheduler.failed",
            payload: { job_id: job.id, scenario: job.scenario, error: String(err.message || err) },
          });
          fired.push({ job_id: job.id, scenario: job.scenario, error: String(err.message || err) });
        }
      }
      if (fired.length) {
        this.audit.append({ trace_id: "scheduler", event_type: "scheduler.tick", payload: { fired } });
      }
      return { fired: fired.length, results: fired };
    } finally {
      this.running = false;
    }
  }

  start(intervalMs = 1000) {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        this.audit.append({ trace_id: "scheduler", event_type: "scheduler.failed", payload: { error: String(err.message || err) } });
      });
    }, intervalMs);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
