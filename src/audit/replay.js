export function replayTrace(audit, traceId) {
  const events = audit.timeline(traceId);
  const summary = {
    trace_id: traceId,
    count: events.length,
    policy: [],
    approvals: [],
    tools: [],
    compensation: [],
    hallucinations: [],
    injections: [],
    breaker: [],
  };
  for (const e of events) {
    if (e.event_type === "policy.evaluated") summary.policy.push({ ts: e.ts, ...e.payload });
    if (e.event_type.startsWith("approval.")) summary.approvals.push({ ts: e.ts, ...e.payload });
    if (e.event_type === "tool.executed") summary.tools.push({ ts: e.ts, ...e.payload });
    if (e.event_type.startsWith("compensation.")) summary.compensation.push({ ts: e.ts, ...e.payload });
    if (e.event_type === "hallucination.blocked") summary.hallucinations.push({ ts: e.ts, ...e.payload });
    if (e.event_type === "injection.detected") summary.injections.push({ ts: e.ts, ...e.payload });
    if (e.event_type.startsWith("breaker.")) summary.breaker.push({ ts: e.ts, ...e.payload });
  }
  return { summary, events };
}

export function formatReplay(audit, traceId) {
  const { summary, events } = replayTrace(audit, traceId);
  const lines = [
    `TRACE ${traceId} · ${events.length} events`,
    `policy=${summary.policy.length} approvals=${summary.approvals.length} tools=${summary.tools.length} ` +
      `compensation=${summary.compensation.length} injection=${summary.injections.length} hallucination=${summary.hallucinations.length}`,
    "",
  ];
  for (const e of events) {
    const payload = JSON.stringify(e.payload);
    lines.push(`${String(e.seq).padStart(4, "0")} ${e.ts} ${e.event_type.padEnd(28)} ${e.node_id ?? "-"} ${payload.slice(0, 160)}`);
  }
  return lines.join("\n");
}
