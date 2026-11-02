function parts(clock) {
  return clock.todayKey().split("-").map(Number);
}

function lastDay(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function pad(n) {
  return String(n).padStart(2, "0");
}

export function periodRange(clock, period = "last_month") {
  const [y, m] = parts(clock);
  if (period === "this_month") {
    return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(lastDay(y, m))}`, label: "本月" };
  }
  if (period === "year") {
    return { start: `${y}-01-01`, end: `${y}-12-31`, label: `${y} 年` };
  }
  if (period === "last_month") {
    const ly = m === 1 ? y - 1 : y;
    const lm = m === 1 ? 12 : m - 1;
    return { start: `${ly}-${pad(lm)}-01`, end: `${ly}-${pad(lm)}-${pad(lastDay(ly, lm))}`, label: `${ly} 年 ${lm} 月` };
  }
  return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(lastDay(y, m))}`, label: "本月" };
}

export function aggregate(params, ctx) {
  const range = periodRange(ctx.clock, params.period || "last_month");
  const category = params.category || null;
  const rows = ctx.db
    .prepare(
      "SELECT category, SUM(amount_cents) AS amount_cents, COUNT(*) AS count FROM bills " +
        "WHERE user_id=? AND substr(occurred_at,1,10) BETWEEN ? AND ?" +
        (category ? " AND category=?" : "") +
        " GROUP BY category ORDER BY amount_cents DESC",
    )
    .all(...(category ? [ctx.userId, range.start, range.end, category] : [ctx.userId, range.start, range.end]));
  const total = rows.reduce((s, r) => s + r.amount_cents, 0);
  const count = rows.reduce((s, r) => s + r.count, 0);
  return {
    period: params.period || "last_month",
    period_label: range.label,
    start: range.start,
    end: range.end,
    total_cents: total,
    count,
    categories: rows,
    top_category: rows[0]?.category ?? null,
    top_amount_cents: rows[0]?.amount_cents ?? 0,
  };
}

export function anomaly(params, ctx) {
  const range = periodRange(ctx.clock, params.period || "last_month");
  const rows = ctx.db
    .prepare("SELECT * FROM bills WHERE user_id=? AND substr(occurred_at,1,10) BETWEEN ? AND ? ORDER BY occurred_at")
    .all(ctx.userId, range.start, range.end);

  const out = [];
  const dupMap = new Map();
  for (const b of rows) {
    const key = `${b.merchant}|${b.amount_cents}|${b.occurred_at.slice(0, 10)}`;
    dupMap.set(key, [...(dupMap.get(key) || []), b]);
  }
  for (const [key, group] of dupMap) {
    if (group.length > 1) {
      out.push({
        type: "duplicate_charge",
        bill_ids: group.map((g) => g.id),
        merchant: group[0].merchant,
        amount_cents: group[0].amount_cents,
        occurred_at: group[0].occurred_at,
        reason: "同一商户、同一金额、同一天出现多笔扣款",
      });
    }
  }
  const byCat = new Map();
  for (const b of rows) {
    const arr = byCat.get(b.category) || [];
    arr.push(b);
    byCat.set(b.category, arr);
  }
  for (const b of rows) {
    const hour = Number(b.occurred_at.slice(11, 13));
    if (hour >= 0 && hour <= 5 && b.amount_cents >= 50000) {
      out.push({ type: "late_night_large", bill_id: b.id, merchant: b.merchant, amount_cents: b.amount_cents, occurred_at: b.occurred_at, reason: "凌晨 0–5 点大额消费" });
    }
    if (b.merchant.includes("未知")) {
      out.push({ type: "unknown_merchant", bill_id: b.id, merchant: b.merchant, amount_cents: b.amount_cents, occurred_at: b.occurred_at, reason: "商户信息不完整" });
    }
    const cat = byCat.get(b.category) || [];
    const avg = cat.reduce((s, x) => s + x.amount_cents, 0) / Math.max(cat.length, 1);
    if (cat.length >= 3 && b.amount_cents > avg * 3 && b.amount_cents >= 50000) {
      out.push({ type: "category_outlier", bill_id: b.id, merchant: b.merchant, amount_cents: b.amount_cents, occurred_at: b.occurred_at, reason: "显著高于同类平均" });
    }
  }
  const seen = new Set();
  const unique = out.filter((x) => {
    const k = `${x.type}|${x.bill_id || x.bill_ids?.join(",")}|${x.amount_cents}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  // 同一笔账单的多个风险信号合并，避免报告重复
  const merged = new Map();
  for (const x of unique) {
    const key = x.bill_id || x.bill_ids?.join(",") || `${x.merchant}|${x.amount_cents}`;
    const cur = merged.get(key);
    if (cur) {
      cur.types.push(x.type);
      cur.reason = `${cur.reason}；${x.reason}`;
    } else {
      merged.set(key, { ...x, types: [x.type] });
    }
  }
  const final = [...merged.values()];
  return { period: params.period || "last_month", period_label: range.label, anomalies: final, count: final.length };
}
