import fs from "node:fs";
import path from "node:path";
import { newId } from "../core/ids.js";
import { canonicalJson, sha256Hex, merkleRoot } from "../core/canonical.js";
import { config } from "../config.js";

const GENESIS = "0".repeat(64);

export class AuditLog {
  constructor(db, clock, { dir = config.auditDir, reset = false } = {}) {
    this.db = db;
    this.clock = clock;
    this.dir = dir;
    this.eventsFile = path.join(dir, "events.jsonl");
    this.anchorsFile = path.join(dir, "anchors.jsonl");
    fs.mkdirSync(dir, { recursive: true });
    if (reset) {
      for (const f of [this.eventsFile, this.anchorsFile]) {
        if (fs.existsSync(f)) fs.rmSync(f, { force: true });
      }
    }
  }

  last() {
    return this.db
      .prepare("SELECT seq, hash FROM audit_events ORDER BY seq DESC LIMIT 1")
      .get();
  }

  append({ trace_id, run_id = null, step_id = null, node_id = null, event_type, payload = {} }) {
    const seqRow = this.last();
    const seq = (seqRow?.seq ?? 0) + 1;
    const prev_hash = seqRow?.hash ?? GENESIS;
    const event_id = newId("ev");
    const ts = this.clock.nowIso();
    const payload_json = canonicalJson(payload);
    const hash = sha256Hex(
      canonicalJson({ seq, event_id, trace_id, run_id, step_id, node_id, event_type, ts, payload_json, prev_hash }),
    );

    this.db
      .prepare(
        "INSERT INTO audit_events(seq, event_id, trace_id, run_id, step_id, node_id, event_type, ts, payload_json, prev_hash, hash) " +
          "VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(seq, event_id, trace_id, run_id, step_id, node_id, event_type, ts, payload_json, prev_hash, hash);

    const line = canonicalJson({
      seq, event_id, trace_id, run_id, step_id, node_id, event_type, ts, payload, prev_hash, hash,
    });
    fs.appendFileSync(this.eventsFile, line + "\n", "utf8");

    if (seq % 100 === 0) this.anchor(seq);
    return { seq, event_id, trace_id, run_id, step_id, node_id, event_type, ts, payload, prev_hash, hash };
  }

  anchor(toSeq) {
    const fromSeq = Math.max(1, toSeq - 99);
    const rows = this.db
      .prepare("SELECT hash FROM audit_events WHERE seq BETWEEN ? AND ? ORDER BY seq")
      .all(fromSeq, toSeq);
    const root = merkleRoot(rows.map((r) => r.hash));
    const id = newId("anc");
    const createdAt = this.clock.nowIso();
    this.db
      .prepare("INSERT INTO audit_anchors(id, from_seq, to_seq, merkle_root, created_at) VALUES(?,?,?,?,?)")
      .run(id, fromSeq, toSeq, root, createdAt);
    fs.appendFileSync(this.anchorsFile, canonicalJson({ id, from_seq: fromSeq, to_seq: toSeq, merkle_root: root, created_at: createdAt }) + "\n", "utf8");
    return { id, from_seq: fromSeq, to_seq: toSeq, merkle_root: root };
  }

  verify() {
    const rows = this.db
      .prepare("SELECT seq, event_id, trace_id, run_id, step_id, node_id, event_type, ts, payload_json, prev_hash, hash FROM audit_events ORDER BY seq")
      .all();
    let prev = GENESIS;
    for (const row of rows) {
      if (row.prev_hash !== prev) return { ok: false, reason: "PREV_HASH_MISMATCH", seq: row.seq, count: rows.length };
      const expect = sha256Hex(
        canonicalJson({
          seq: row.seq,
          event_id: row.event_id,
          trace_id: row.trace_id,
          run_id: row.run_id,
          step_id: row.step_id,
          node_id: row.node_id,
          event_type: row.event_type,
          ts: row.ts,
          payload_json: row.payload_json,
          prev_hash: row.prev_hash,
        }),
      );
      if (expect !== row.hash) return { ok: false, reason: "HASH_MISMATCH", seq: row.seq, count: rows.length };
      prev = row.hash;
    }

    const anchors = this.db.prepare("SELECT * FROM audit_anchors ORDER BY to_seq").all();
    for (const a of anchors) {
      const part = this.db
        .prepare("SELECT hash FROM audit_events WHERE seq BETWEEN ? AND ? ORDER BY seq")
        .all(a.from_seq, a.to_seq);
      const root = merkleRoot(part.map((r) => r.hash));
      if (root !== a.merkle_root) {
        return { ok: false, reason: "ANCHOR_MISMATCH", seq: a.to_seq, count: rows.length };
      }
    }
    return { ok: true, count: rows.length, anchors: anchors.length, head: prev };
  }

  timeline(traceId) {
    return this.db
      .prepare("SELECT * FROM audit_events WHERE trace_id=? ORDER BY seq")
      .all(traceId)
      .map((r) => ({
        seq: r.seq,
        event_id: r.event_id,
        trace_id: r.trace_id,
        run_id: r.run_id,
        event_type: r.event_type,
        ts: r.ts,
        node_id: r.node_id,
        step_id: r.step_id,
        payload: JSON.parse(r.payload_json),
        hash: r.hash.slice(0, 16),
        prev_hash: r.prev_hash.slice(0, 16),
      }));
  }

  stats() {
    const total = this.db.prepare("SELECT COUNT(*) AS c FROM audit_events").get().c;
    const byType = this.db.prepare("SELECT event_type, COUNT(*) AS c FROM audit_events GROUP BY event_type ORDER BY c DESC").all();
    const denies = this.db
      .prepare("SELECT COUNT(*) AS c FROM audit_events WHERE event_type='policy.evaluated' AND payload_json LIKE '%\"decision\":\"DENY\"%'")
      .get().c;
    return { total, by_type: byType, policy_denies: denies };
  }
}
