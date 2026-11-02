import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * 稳定 JSON：对象键递归排序，数组保持顺序。
 * 用于参数哈希、审计哈希链、Permit 签名。
 */
export function canonicalJson(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  const body = keys
    .filter((k) => value[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
    .join(",");
  return `{${body}}`;
}

export function sha256Hex(input) {
  const data = typeof input === "string" ? input : canonicalJson(input);
  return createHash("sha256").update(data).digest("hex");
}

export function hmacHex(secret, input) {
  const data = typeof input === "string" ? input : canonicalJson(input);
  return createHmac("sha256", secret).update(data).digest("hex");
}

export function safeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function paramsHash(params) {
  return sha256Hex(canonicalJson(params));
}

export function merkleRoot(hashes) {
  if (hashes.length === 0) return sha256Hex("EMPTY");
  let level = hashes.slice();
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? left;
      next.push(sha256Hex(left + right));
    }
    level = next;
  }
  return level[0];
}
