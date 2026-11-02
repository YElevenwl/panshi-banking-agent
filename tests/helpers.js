import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/app.js";

export function makeTestApp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "panshi-test-"));
  const app = createApp({
    dbPath: path.join(dir, "test.db"),
    auditDir: path.join(dir, "audit"),
    reset: true,
  });
  return {
    app,
    dir,
    cleanup() {
      app.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
