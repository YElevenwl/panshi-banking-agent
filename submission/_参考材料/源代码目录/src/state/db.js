import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { config } from "../config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(here, "schema.sql");

let singleton = null;

export function openDb({ reset = false, dbPath = config.dbPath } = {}) {
  if (singleton) {
    if (!reset) return singleton;
    singleton.close();
    singleton = null;
  }
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  if (reset) {
    for (const suffix of ["", "-wal", "-shm"]) {
      const p = dbPath + suffix;
      if (fs.existsSync(p)) fs.rmSync(p, { force: true });
    }
  }
  const db = new DatabaseSync(dbPath);
  db.exec(fs.readFileSync(schemaPath, "utf8"));
  singleton = db;
  return db;
}

export function getDb() {
  if (!singleton) return openDb();
  return singleton;
}

export function closeDb() {
  if (singleton) {
    singleton.close();
    singleton = null;
  }
}

export function tx(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // ignore rollback failure
    }
    throw err;
  }
}

export function getState(db, key, fallback = null) {
  const row = db.prepare("SELECT value FROM system_state WHERE key = ?").get(key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}

export function setState(db, key, value, nowIso) {
  db.prepare(
    "INSERT INTO system_state(key, value, updated_at) VALUES(?, ?, ?) " +
      "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
  ).run(key, JSON.stringify(value), nowIso);
}
