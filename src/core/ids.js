import { randomUUID, randomBytes } from "node:crypto";
import { format } from "node:util";

export function newId(prefix = "id") {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

export function newNonce(bytes = 16) {
  return randomBytes(bytes).toString("base64url");
}

export function newTraceId() {
  return `tr_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
}

export function newRunId() {
  return `run_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

export function shortId(id, n = 8) {
  return String(id).slice(0, n);
}

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function invariant(condition, message, details = {}) {
  if (!condition) {
    const err = new Error(message);
    err.code = "INVARIANT";
    err.details = details;
    throw err;
  }
}

export function formatError(err) {
  if (!err) return "unknown";
  if (err.code && err.message) return `${err.code}: ${err.message}`;
  return format(err);
}
