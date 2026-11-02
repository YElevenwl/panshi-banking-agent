import { newRunId, newTraceId } from "../core/ids.js";
import { AppError, conflict } from "../core/errors.js";
import { FactStore } from "../security/facts.js";

function parseJson(s, fallback) {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

export class DagEngine {
  constructor({ db, clock, audit, gateway, services, scenarios }) {
    this.db = db;
    this.clock = clock;
    this.audit = audit;
    this.gateway = gateway;
    this.services = services;
    this.scenarios = scenarios;
  }

  scenario(name) {
    const s = this.scenarios[name];
    if (!s) throw new AppError("SCENARIO_NOT_FOUND", `未知场景: ${name}`, { status: 404 });
    return s;
  }

  loadRun(runId) {
    const row = this.db.prepare("SELECT * FROM runs WHERE id=?").get(runId);
    if (!row) throw new AppError("RUN_NOT_FOUND", "运行不存在", { status: 404 });
    return { ...row, state: parseJson(row.state_json, {}) };
  }

  saveRun(run) {
    this.db
      .prepare("UPDATE runs SET status=?, current_node=?, state_json=?, updated_at=? WHERE id=?")
      .run(run.status, run.current_node, JSON.stringify(run.state), this.clock.nowIso(), run.id);
  }

  saveCheckpoint(runId, nodeId, payload) {
    this.db
      .prepare(
        "INSERT INTO checkpoints(run_id, node_id, state_json, updated_at) VALUES(?,?,?,?) " +
          "ON CONFLICT(run_id, node_id) DO UPDATE SET state_json=excluded.state_json, updated_at=excluded.updated_at",
      )
      .run(runId, nodeId, JSON.stringify(payload), this.clock.nowIso());
  }

  loadCheckpoint(runId, nodeId) {
    const row = this.db.prepare("SELECT * FROM checkpoints WHERE run_id=? AND node_id=?").get(runId, nodeId);
    return row ? parseJson(row.state_json, {}) : null;
  }

  completedNodes(runId) {
    const rows = this.db.prepare("SELECT node_id, state_json FROM checkpoints WHERE run_id=?").all(runId);
    const done = new Set();
    for (const r of rows) {
      if (parseJson(r.state_json, {}).status === "ok") done.add(r.node_id);
    }
    return done;
  }

  start({ userId, scenario, input = {}, traceId = null }) {
    const sc = this.scenario(scenario);
    const id = newRunId();
    const trace_id = traceId || newTraceId();
    const now = this.clock.nowIso();
    const state = {
      input,
      outputs: {},
      compensations: [],
      compensation_results: [],
      needs_reconciliation: false,
    };
    this.db
      .prepare("INSERT INTO runs(id, trace_id, user_id, scenario, status, current_node, state_json, created_at, updated_at) VALUES(?,?,?,?, 'running', NULL, ?,?,?)")
      .run(id, trace_id, userId, scenario, JSON.stringify(state), now, now);
    this.audit.append({ trace_id, run_id: id, event_type: "run.started", payload: { scenario, user_id: userId, input } });
    const run = this.loadRun(id);
    return this.runLoop(run, null, sc);
  }

  resume(runId, input = {}) {
    const run = this.loadRun(runId);
    if (!["awaiting_user", "paused", "running"].includes(run.status)) {
      throw conflict("当前运行不可恢复", { status: run.status });
    }
    run.status = "running";
    this.saveRun(run);
    this.audit.append({ trace_id: run.trace_id, run_id: run.id, event_type: "run.resumed", payload: { input } });
    return this.runLoop(run, input, this.scenario(run.scenario));
  }

  cancel(runId, reason = "user_cancel") {
    const run = this.loadRun(runId);
    if (["completed", "failed", "canceled"].includes(run.status)) return this.view(runId);
    const ctx = this.makeContext(run, null, false, run.current_node || "cancel");
    run.status = "canceled";
    run.current_node = null;
    this.db
      .prepare("UPDATE approvals SET status='expired' WHERE run_id=? AND status='pending'")
      .run(runId);
    this.saveRun(run);
    this.compensate(run, ctx, reason);
    this.audit.append({ trace_id: run.trace_id, run_id: run.id, event_type: "run.canceled", payload: { reason } });
    return this.view(runId);
  }

  makeContext(run, input, resume, nodeId = run.current_node) {
    const facts = new FactStore(this.db, this.clock, { trace_id: run.trace_id, run_id: run.id });
    const ctx = {
      run,
      runId: run.id,
      traceId: run.trace_id,
      nodeId,
      stepId: nodeId,
      userId: run.user_id,
      state: run.state,
      input,
      resume,
      db: this.db,
      clock: this.clock,
      audit: this.audit,
      gateway: this.gateway,
      services: this.services,
      facts,
      recordCompensation: (comp) => {
        if (!comp?.token) return;
        if (!run.state.compensations.some((c) => c.token === comp.token)) {
          run.state.compensations.push({ ...comp, compensated: false });
        }
      },
      interrupt: (payload) => ({ status: "interrupt", interrupt: payload }),
      fail: (code, message, details = {}) => ({ status: "fail", error: { code, message, details } }),
      ok: (output = {}) => ({ status: "ok", output }),
    };
    return ctx;
  }

  async runLoop(run, resumeInput, sc) {
    const nodes = sc.nodes;
    const completed = this.completedNodes(run.id);
    let pendingResume = resumeInput;

    for (let guard = 0; guard < 30; guard += 1) {
      if (["completed", "failed", "canceled"].includes(run.status)) break;

      let node = null;
      if (pendingResume && run.current_node) {
        node = nodes.find((n) => n.id === run.current_node) || null;
      } else {
        node = nodes.find((n) => !completed.has(n.id) && (n.deps || []).every((d) => completed.has(d))) || null;
      }

      if (!node) {
        run.status = "completed";
        run.current_node = null;
        this.saveRun(run);
        this.audit.append({
          trace_id: run.trace_id,
          run_id: run.id,
          event_type: "run.completed",
          payload: { scenario: run.scenario, compensations: run.state.compensations.length },
        });
        break;
      }

      run.current_node = node.id;
      this.saveRun(run);
      this.audit.append({
        trace_id: run.trace_id, run_id: run.id, step_id: node.id, node_id: node.id,
        event_type: "node.started", payload: { title: node.title || node.id, deps: node.deps || [] },
      });

      const ctx = this.makeContext(run, pendingResume, !!pendingResume, node.id);
      pendingResume = null;

      let result;
      try {
        result = await node.execute(ctx);
      } catch (err) {
        result = { status: "fail", error: { code: err.code || "NODE_EXCEPTION", message: String(err.message || err), details: err.details || {} } };
      }

      if (!result || typeof result !== "object") {
        result = { status: "fail", error: { code: "NODE_NO_RESULT", message: "节点未返回结果" } };
      }

      if (result.status === "interrupt") {
        run.status = "awaiting_user";
        this.saveCheckpoint(run.id, node.id, { status: "interrupt", output: result.output ?? null, interrupt: result.interrupt ?? null });
        this.saveRun(run);
        this.audit.append({
          trace_id: run.trace_id, run_id: run.id, step_id: node.id, node_id: node.id,
          event_type: "run.interrupted", payload: result.interrupt || {},
        });
        break;
      }

      if (result.status === "fail") {
        this.saveCheckpoint(run.id, node.id, { status: "failed", error: result.error });
        this.saveRun(run);
        this.audit.append({
          trace_id: run.trace_id, run_id: run.id, step_id: node.id, node_id: node.id,
          event_type: "node.failed", payload: result.error || {},
        });
        run.status = "failed";
        this.saveRun(run);
        this.compensate(run, ctx, `node_failed:${node.id}`);
        break;
      }

      this.saveCheckpoint(run.id, node.id, { status: "ok", output: result.output ?? null });
      completed.add(node.id);
      run.state.outputs[node.id] = result.output ?? null;
      run.current_node = null;
      this.saveRun(run);
      this.audit.append({
        trace_id: run.trace_id, run_id: run.id, step_id: node.id, node_id: node.id,
        event_type: "node.completed", payload: { output: result.output ?? null },
      });
    }

    return this.view(run.id);
  }

  compensate(run, ctx, reason) {
    const comps = [...(run.state.compensations || [])].reverse();
    for (const comp of comps) {
      if (comp.compensated || comp.superseded) continue;
      this.audit.append({
        trace_id: run.trace_id, run_id: run.id, event_type: "compensation.started",
        payload: { tool: comp.tool, reason },
      });
      try {
        const res = this.gateway.compensate({ token: comp.token, ctx });
        comp.compensated = true;
        run.state.compensation_results.push({ tool: comp.tool, status: "ok", data: res.data });
        this.audit.append({
          trace_id: run.trace_id, run_id: run.id, event_type: "compensation.succeeded",
          payload: { tool: comp.tool, digest: res.digest },
        });
      } catch (err) {
        comp.compensated = true;
        run.state.needs_reconciliation = true;
        run.state.compensation_results.push({ tool: comp.tool, status: "failed", error: String(err.message || err) });
        this.audit.append({
          trace_id: run.trace_id, run_id: run.id, event_type: "compensation.failed",
          payload: { tool: comp.tool, error: String(err.message || err) },
        });
      }
    }
    this.saveRun(run);
  }

  undo(runId, reason = "user_undo") {
    const run = this.loadRun(runId);
    if (run.status !== "completed") throw conflict("只有已完成的操作可以撤销", { status: run.status });
    const ctx = this.makeContext(run, null, false, "UNDO");
    const comps = [...(run.state.compensations || [])].reverse().filter((c) => !c.compensated && !c.superseded);
    if (!comps.length) throw conflict("没有可撤销的副作用");
    for (const comp of comps) {
      this.audit.append({
        trace_id: run.trace_id, run_id: run.id, event_type: "compensation.started",
        payload: { tool: comp.tool, reason },
      });
      try {
        const res = this.gateway.compensate({ token: comp.token, ctx });
        comp.compensated = true;
        run.state.compensation_results.push({ tool: comp.tool, status: "ok", data: res.data, undo: true });
        this.audit.append({
          trace_id: run.trace_id, run_id: run.id, event_type: "compensation.succeeded",
          payload: { tool: comp.tool, digest: res.digest, undo: true },
        });
      } catch (err) {
        comp.compensated = true;
        run.state.needs_reconciliation = true;
        run.state.compensation_results.push({ tool: comp.tool, status: "failed", error: String(err.message || err), undo: true });
        this.audit.append({
          trace_id: run.trace_id, run_id: run.id, event_type: "compensation.failed",
          payload: { tool: comp.tool, error: String(err.message || err), undo: true },
        });
      }
    }
    run.status = "reversed";
    run.state.undone = true;
    this.saveRun(run);
    this.audit.append({ trace_id: run.trace_id, run_id: run.id, event_type: "run.undone", payload: { reason, tools: comps.map((c) => c.tool) } });
    return this.view(runId);
  }

  view(runId) {
    const run = this.loadRun(runId);
    let nodes = [];
    try {
      nodes = this.scenario(run.scenario).nodes;
    } catch {
      nodes = [];
    }
    const cps = this.db.prepare("SELECT * FROM checkpoints WHERE run_id=?").all(runId);
    const statusByNode = new Map();
    for (const cp of cps) {
      const st = parseJson(cp.state_json, {}).status;
      statusByNode.set(cp.node_id, st);
    }
    const approvals = this.db
      .prepare("SELECT * FROM approvals WHERE run_id=? ORDER BY created_at")
      .all(runId)
      .map((a) => ({ ...a, envelope: JSON.parse(a.envelope_json) }));
    const safeState = {
      ...run.state,
      compensations: (run.state.compensations || []).map((c) => ({ tool: c.tool, compensated: !!c.compensated })),
    };
    return {
      run: { id: run.id, trace_id: run.trace_id, user_id: run.user_id, scenario: run.scenario, status: run.status, current_node: run.current_node, created_at: run.created_at, updated_at: run.updated_at },
      state: safeState,
      nodes: nodes.map((n) => ({ id: n.id, title: n.title, deps: n.deps || [], status: statusByNode.get(n.id) || "pending", risk: n.risk || "" })),
      approvals,
      audit: this.audit.timeline(run.trace_id),
    };
  }
}
