import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(path.resolve("..", "data", "panshi.db"));
const run = db.prepare("SELECT * FROM runs WHERE scenario='transfer' AND status='completed' ORDER BY created_at ASC LIMIT 1").get();
if (!run) throw new Error("no completed transfer run; capture first");
const events = db.prepare("SELECT seq, trace_id, run_id, event_type, ts, node_id, payload_json, prev_hash, hash FROM audit_events WHERE trace_id=? ORDER BY seq").all(run.trace_id);
const picked = events.filter((e) => ["policy.evaluated", "approval.requested", "approval.granted", "tool.executed", "audit.sealed"].includes(e.event_type));
const out = {
  trace_id: run.trace_id,
  run_id: run.id,
  scenario: run.scenario,
  total_events: events.length,
  picked: picked.map((e) => ({
    seq: e.seq, event_type: e.event_type, node_id: e.node_id, ts: e.ts,
    payload: JSON.parse(e.payload_json), prev_hash: e.prev_hash, hash: e.hash,
  })),
};
fs.mkdirSync(path.resolve("..", "deliverables"), { recursive: true });
fs.writeFileSync(path.resolve("..", "deliverables", "audit-sample.json"), JSON.stringify(out, null, 2), "utf8");
console.log(JSON.stringify({ trace_id: out.trace_id, total_events: out.total_events, picked: out.picked.length }, null, 2));
