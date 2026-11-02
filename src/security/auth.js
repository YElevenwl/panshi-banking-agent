import { createHmac, timingSafeEqual } from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Decode(input) {
  const s = String(input || "").toUpperCase().replace(/=+$/g, "").replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of s) {
    const idx = B32.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function totp(secret, nowMs = Date.now(), stepSeconds = 30, digits = 6) {
  const counter = Math.floor(nowMs / 1000 / stepSeconds);
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 10 ** digits).padStart(digits, "0");
}

export function verifyTotp(secret, code, nowMs = Date.now(), window = 1) {
  if (!secret || !code) return false;
  const input = String(code).replace(/\D/g, "").slice(0, 6);
  if (input.length !== 6) return false;
  for (let w = -window; w <= window; w += 1) {
    const expected = totp(secret, nowMs + w * 30_000);
    const a = Buffer.from(input);
    const b = Buffer.from(expected);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

export function transactionChallenge({ amountCents, payeeId, memo = "" }) {
  return createHmac("sha256", "panshi-tx-challenge")
    .update(`${amountCents}|${payeeId || ""}|${memo}`)
    .digest("hex")
    .slice(0, 12);
}
