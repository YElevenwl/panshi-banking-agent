import { maskPhone } from "../security/redact.js";

export function search(params, ctx) {
  const q = String(params.query || "").trim();
  if (!q) return { payees: [] };
  const rows = ctx.db
    .prepare(
      "SELECT id, name, phone, bank, account_no_masked, risk_level, status FROM payees " +
        "WHERE user_id=? AND (name LIKE ? OR phone LIKE ?) ORDER BY name LIMIT 5",
    )
    .all(ctx.userId, `%${q}%`, `%${q}%`);
  return {
    payees: rows.map((r) => ({
      payee_id: r.id,
      name: r.name,
      phone_masked: maskPhone(r.phone),
      bank: r.bank,
      account_no_masked: r.account_no_masked,
      risk_level: r.risk_level,
      status: r.status,
    })),
    count: rows.length,
  };
}
