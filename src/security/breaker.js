import { config } from "../config.js";
import { getState, setState } from "../state/db.js";

export class Breaker {
  constructor(db, clock) {
    this.db = db;
    this.clock = clock;
  }

  getState(subject = "global") {
    const row = this.db
      .prepare("SELECT * FROM breaker_state WHERE subject=?")
      .get(subject);
    if (!row) return { subject, state: "CLOSED", reason: "", failure_count: 0 };
    if (row.state === "OPEN" && row.unlock_at && row.unlock_at <= this.clock.nowIso()) {
      this.db
        .prepare("UPDATE breaker_state SET state='HALF_OPEN', updated_at=? WHERE subject=?")
        .run(this.clock.nowIso(), subject);
      return { ...row, state: "HALF_OPEN" };
    }
    return row;
  }

  setState(subject, state, reason = "", unlockAt = null) {
    const now = this.clock.nowIso();
    this.db
      .prepare(
        "INSERT INTO breaker_state(subject, state, reason, opened_at, unlock_at, updated_at) VALUES(?,?,?,?,?,?) " +
          "ON CONFLICT(subject) DO UPDATE SET state=excluded.state, reason=excluded.reason, opened_at=excluded.opened_at, " +
          "unlock_at=excluded.unlock_at, updated_at=excluded.updated_at",
      )
      .run(subject, state, reason, state === "OPEN" ? now : null, unlockAt, now);
    return this.getState(subject);
  }

  counters(subject) {
    const row = this.db.prepare("SELECT * FROM breaker_counters WHERE subject=?").get(subject);
    if (!row) {
      this.db
        .prepare("INSERT INTO breaker_counters(subject, updated_at) VALUES(?,?)")
        .run(subject, this.clock.nowIso());
      return { subject, failure_count: 0, injection_count: 0, denial_count: 0, velocity_json: "[]" };
    }
    return row;
  }

  bump(subject, field, delta = 1) {
    const c = this.counters(subject);
    const next = Math.max(0, Number(c[field] ?? 0) + delta);
    this.db
      .prepare(`UPDATE breaker_counters SET ${field}=?, updated_at=? WHERE subject=?`)
      .run(next, this.clock.nowIso(), subject);
    return next;
  }

  open(subject, reason) {
    const unlockAt = new Date(this.clock.nowMs() + config.breaker.openMs).toISOString();
    return this.setState(subject, "OPEN", reason, unlockAt);
  }

  recordFailure(subject, reason = "tool_failure") {
    const n = this.bump(subject, "failure_count");
    if (n >= config.breaker.failureThreshold) return this.open(subject, reason);
    return this.getState(subject);
  }

  recordInjection(subject, reason = "injection") {
    const n = this.bump(subject, "injection_count");
    if (n >= config.breaker.injectionThreshold) return this.open(subject, reason);
    return this.getState(subject);
  }

  recordDenial(subject, reason = "policy_denial") {
    const n = this.bump(subject, "denial_count");
    if (n >= config.breaker.denialThreshold) return this.open(subject, reason);
    return this.getState(subject);
  }

  recordSuccess(subject) {
    this.db
      .prepare("UPDATE breaker_counters SET failure_count=0, injection_count=0, denial_count=0, velocity_json='[]', updated_at=? WHERE subject=?")
      .run(this.clock.nowIso(), subject);
    return this.setState(subject, "CLOSED", "");
  }

  recordTransferAttempt(subject) {
    const c = this.counters(subject);
    const now = this.clock.nowMs();
    const windowStart = now - 10 * 60 * 1000;
    const recent = JSON.parse(c.velocity_json || "[]").filter((t) => t >= windowStart);
    recent.push(now);
    this.db
      .prepare("UPDATE breaker_counters SET velocity_json=?, updated_at=? WHERE subject=?")
      .run(JSON.stringify(recent.slice(-20)), this.clock.nowIso(), subject);
    return recent.length;
  }

  velocityCount(subject) {
    const c = this.counters(subject);
    const now = this.clock.nowMs();
    const windowStart = now - 10 * 60 * 1000;
    return JSON.parse(c.velocity_json || "[]").filter((t) => t >= windowStart).length;
  }

  unlock(subject, approver) {
    return this.setState(subject, "CLOSED", `unlocked_by:${approver || "operator"}`);
  }

  isKillSwitchOn() {
    return getState(this.db, "kill_switch", false) === true;
  }

  setKillSwitch(on) {
    setState(this.db, "kill_switch", !!on, this.clock.nowIso());
    return !!on;
  }
}
