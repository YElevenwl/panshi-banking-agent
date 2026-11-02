import { newId } from "../core/ids.js";
import { canonicalJson } from "../core/canonical.js";

export const TRUST = {
  USER: "USER",
  TOOL_VERIFIED: "TOOL_VERIFIED",
  UNTRUSTED: "UNTRUSTED",
  POLICY: "POLICY",
  SYSTEM: "SYSTEM",
};

export class FactStore {
  constructor(db, clock, { trace_id, run_id }) {
    this.db = db;
    this.clock = clock;
    this.traceId = trace_id;
    this.runId = run_id;
    this.cache = new Map();
  }

  add({ type, value, source, trust = TRUST.SYSTEM, tool_call_id = null }) {
    const id = newId("fact");
    const now = this.clock.nowIso();
    const value_json = canonicalJson(value);
    this.db
      .prepare(
        "INSERT INTO facts(id, trace_id, run_id, type, value_json, source, trust, tool_call_id, created_at) VALUES(?,?,?,?,?,?,?,?,?)",
      )
      .run(id, this.traceId, this.runId, type, value_json, source, trust, tool_call_id, now);
    const fact = { id, type, value, source, trust, tool_call_id, created_at: now };
    this.cache.set(id, fact);
    return fact;
  }

  get(id) {
    if (this.cache.has(id)) return this.cache.get(id);
    const row = this.db.prepare("SELECT * FROM facts WHERE id=?").get(id);
    if (!row) return null;
    const fact = {
      id: row.id,
      type: row.type,
      value: JSON.parse(row.value_json),
      source: row.source,
      trust: row.trust,
      tool_call_id: row.tool_call_id,
      created_at: row.created_at,
    };
    this.cache.set(id, fact);
    return fact;
  }

  list() {
    return this.db
      .prepare("SELECT * FROM facts WHERE run_id=? ORDER BY created_at")
      .all(this.runId)
      .map((row) => ({
        id: row.id,
        type: row.type,
        value: JSON.parse(row.value_json),
        source: row.source,
        trust: row.trust,
        tool_call_id: row.tool_call_id,
        created_at: row.created_at,
      }));
  }

  hasUntrusted(refs = []) {
    return refs.some((id) => {
      const f = this.get(id);
      return f && f.trust === TRUST.UNTRUSTED;
    });
  }

  findAmountCents(cents) {
    return this.list().find((f) => {
      if (typeof f.value === "object" && f.value) {
        return f.value.amount_cents === cents || f.value.cents === cents;
      }
      return false;
    });
  }
}
