import { conflict } from "../core/errors.js";

export function getExisting(db, key, tool, requestHash) {
  if (!key) return null;
  const row = db.prepare("SELECT * FROM idempotency WHERE key=?").get(key);
  if (!row) return null;
  if (row.tool !== tool || row.request_hash !== requestHash) {
    throw conflict("幂等键已用于不同请求", { key, tool });
  }
  return { ...row, response: JSON.parse(row.response_json) };
}

export function save(db, key, tool, requestHash, response, nowIso) {
  if (!key) return;
  db.prepare(
    "INSERT INTO idempotency(key, tool, request_hash, response_json, status, created_at) VALUES(?,?,?,?, 'completed', ?)",
  ).run(key, tool, requestHash, JSON.stringify(response), nowIso);
}
