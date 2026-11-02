export function read(params, ctx) {
  const events = ctx.db
    .prepare("SELECT id, title, event_date, consent FROM calendar_events WHERE user_id=? ORDER BY event_date")
    .all(ctx.userId);
  const consented = events.some((e) => e.consent === 1);
  return {
    consent: consented,
    events: consented ? events : [],
    pending_count: consented ? 0 : events.length,
  };
}

export function consent(params, ctx) {
  const res = ctx.db
    .prepare("UPDATE calendar_events SET consent=1 WHERE user_id=?")
    .run(ctx.userId);
  return { consent: true, updated: res.changes };
}
