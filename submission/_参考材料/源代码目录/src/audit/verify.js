import { pathToFileURL } from "node:url";
import { openDb, closeDb } from "../state/db.js";
import { Clock } from "../core/clock.js";
import { config } from "../config.js";
import { AuditLog } from "./log.js";

export function verifyAudit(db, clock = new Clock(config.demoNow)) {
  return new AuditLog(db, clock).verify();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = openDb();
  const result = verifyAudit(db);
  console.log(JSON.stringify(result, null, 2));
  closeDb();
  process.exit(result.ok ? 0 : 1);
}
