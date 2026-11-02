import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { createApp } from "./app.js";
import { newNonce } from "./core/ids.js";
import { AppError } from "./core/errors.js";
import { totp } from "./security/auth.js";
import { listManifests } from "./gateway/manifests.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const uiDir = path.join(here, "ui");
let app = createApp();
app.scheduler.start(1000);
const sessions = new Map();

function json(res, status, body) {
  const s = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(s);
}

function text(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new AppError("BODY_TOO_LARGE", "请求体过大", { status: 413 }));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new AppError("BAD_JSON", "请求体不是合法 JSON", { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

function auth(req) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  const s = sessions.get(token);
  if (!s || s.expiresAt < Date.now()) return null;
  return { ...s, token };
}

function requireUser(req) {
  const u = auth(req);
  if (!u) throw new AppError("UNAUTHORIZED", "请先登录", { status: 401 });
  return u;
}

function userOf(userId) {
  return app.db.prepare("SELECT id, name, phone, role FROM users WHERE id=?").get(userId);
}

function ownsRun(user, runId) {
  const run = app.db.prepare("SELECT * FROM runs WHERE id=?").get(runId);
  if (!run) throw new AppError("RUN_NOT_FOUND", "运行不存在", { status: 404 });
  if (user.role !== "operator" && run.user_id !== user.userId) throw new AppError("FORBIDDEN", "无权访问该运行", { status: 403 });
  return run;
}

function ownsTrace(user, traceId) {
  const run = app.db.prepare("SELECT * FROM runs WHERE trace_id=? ORDER BY created_at DESC LIMIT 1").get(traceId);
  if (!run) return user.role === "operator";
  return user.role === "operator" || run.user_id === user.userId;
}

function staticFile(res, name, type) {
  const p = path.join(uiDir, name);
  if (!fs.existsSync(p)) return text(res, 404, "not found");
  return text(res, 200, fs.readFileSync(p, "utf8"), type);
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  if (req.method === "GET" && pathname === "/api/health") {
    return json(res, 200, {
      ok: true, name: "panshi-bank-agent", version: "0.1.0",
      time: app.clock.nowIso(), demo_mode: config.demoMode,
      tools: listManifests().length,
    });
  }

  if (req.method === "GET" && pathname === "/api/demo/users") {
    return json(res, 200, {
      users: app.db.prepare("SELECT id, name, role FROM users ORDER BY role, id").all(),
      demo_mode: config.demoMode,
    });
  }

  if (req.method === "GET" && pathname === "/api/demo/totp") {
    if (!config.demoMode) return json(res, 403, { error: "not available" });
    const authUser = requireUser(req);
    const userId = url.searchParams.get("user_id");
    if (authUser.role !== "operator" && authUser.userId !== userId) {
      return json(res, 403, { error: "只能查看自己的演示验证码" });
    }
    const user = app.db.prepare("SELECT * FROM users WHERE id=?").get(userId);
    if (!user) return json(res, 404, { error: "user not found" });
    return json(res, 200, { user_id: userId, code: totp(user.totp_secret, app.clock.nowMs()), interval: 30 });
  }

  if (req.method === "POST" && pathname === "/api/session") {
    const body = await readBody(req);
    const user = userOf(body.user_id);
    if (!user) return json(res, 404, { error: "user not found" });
    const token = newNonce(24);
    sessions.set(token, { userId: user.id, role: user.role, expiresAt: Date.now() + 12 * 3600 * 1000 });
    return json(res, 200, { token, user });
  }

  if (req.method === "GET" && pathname === "/api/tools") {
    return json(res, 200, { tools: listManifests() });
  }

  if (req.method === "POST" && pathname === "/api/chat") {
    const user = requireUser(req);
    const body = await readBody(req);
    if (!body.text || typeof body.text !== "string") return json(res, 400, { error: "text required" });
    const result = await app.orchestrator.handleMessage({ userId: user.userId, text: body.text, channel: body.channel || "APP" });
    return json(res, 200, {
      run_id: result.run_id,
      trace_id: result.trace_id,
      scenario: result.scenario,
      reply: result.reply,
      proposal: result.proposal,
      view: result.view,
    });
  }

  const runMatch = pathname.match(/^\/api\/runs\/([^/]+)$/);
  if (req.method === "GET" && runMatch) {
    const user = requireUser(req);
    ownsRun(user, runMatch[1]);
    return json(res, 200, app.orchestrator.getRun(runMatch[1]));
  }

  const resumeMatch = pathname.match(/^\/api\/runs\/([^/]+)\/resume$/);
  if (req.method === "POST" && resumeMatch) {
    const user = requireUser(req);
    ownsRun(user, resumeMatch[1]);
    const body = await readBody(req);
    if (!body.text) return json(res, 400, { error: "text required" });
    const result = await app.orchestrator.handleClarify(resumeMatch[1], body.text);
    return json(res, 200, result);
  }

  const approveMatch = pathname.match(/^\/api\/runs\/([^/]+)\/approve$/);
  if (req.method === "POST" && approveMatch) {
    const user = requireUser(req);
    ownsRun(user, approveMatch[1]);
    const body = await readBody(req);
    try {
      const result = await app.orchestrator.handleApproval(approveMatch[1], {
        approvalId: body.approval_id,
        decision: body.decision || "approve",
        code: body.code || "",
        challenge: body.challenge || "",
      });
      return json(res, 200, result);
    } catch (err) {
      if (err.code) return json(res, err.status || 400, { error: err.message, code: err.code, details: err.details });
      throw err;
    }
  }

  const cancelMatch = pathname.match(/^\/api\/runs\/([^/]+)\/cancel$/);
  if (req.method === "POST" && cancelMatch) {
    const user = requireUser(req);
    ownsRun(user, cancelMatch[1]);
    return json(res, 200, await app.orchestrator.handleCancel(cancelMatch[1]));
  }

  const undoMatch = pathname.match(/^\/api\/runs\/([^/]+)\/undo$/);
  if (req.method === "POST" && undoMatch) {
    const user = requireUser(req);
    ownsRun(user, undoMatch[1]);
    try {
      return json(res, 200, await app.orchestrator.handleUndo(undoMatch[1]));
    } catch (err) {
      return json(res, err.status || 400, { error: err.message, code: err.code });
    }
  }

  if (req.method === "GET" && pathname === "/api/runs") {
    const user = requireUser(req);
    return json(res, 200, { runs: app.orchestrator.listRuns(user.role === "operator" ? null : user.userId) });
  }

  const auditMatch = pathname.match(/^\/api\/audit\/([^/]+)$/);
  if (req.method === "GET" && auditMatch) {
    const user = requireUser(req);
    if (!ownsTrace(user, auditMatch[1])) throw new AppError("FORBIDDEN", "无权访问该审计轨迹", { status: 403 });
    return json(res, 200, { trace_id: auditMatch[1], events: app.audit.timeline(auditMatch[1]) });
  }

  const verifyMatch = pathname.match(/^\/api\/audit\/([^/]+)\/verify$/);
  if (req.method === "GET" && verifyMatch) {
    const user = requireUser(req);
    if (!ownsTrace(user, verifyMatch[1])) throw new AppError("FORBIDDEN", "无权访问该审计轨迹", { status: 403 });
    return json(res, 200, app.audit.verify());
  }

  if (req.method === "GET" && pathname === "/api/safety/summary") {
    requireUser(req);
    return json(res, 200, app.orchestrator.safetySummary());
  }

  if (req.method === "POST" && pathname === "/api/admin/killswitch") {
    const user = requireUser(req);
    if (user.role !== "operator") return json(res, 403, { error: "operator only" });
    const body = await readBody(req);
    const on = !!body.on;
    app.breaker.setKillSwitch(on);
    app.audit.append({ trace_id: "system", event_type: on ? "killswitch.engaged" : "killswitch.released", payload: { by: user.userId } });
    return json(res, 200, { kill_switch: on });
  }

  if (req.method === "GET" && pathname === "/api/metrics") {
    requireUser(req);
    const runs = app.db.prepare("SELECT status, COUNT(*) AS c FROM runs GROUP BY status").all();
    return json(res, 200, { runs, audit: app.audit.stats(), safety: app.orchestrator.safetySummary() });
  }

  if (req.method === "POST" && pathname === "/api/demo/reset") {
    requireUser(req);
    app.close();
    sessions.clear();
    app = createApp({ reset: true });
    app.scheduler.start(1000);
    return json(res, 200, { ok: true, reset: true });
  }

  if (req.method === "POST" && pathname === "/api/demo/advance") {
    requireUser(req);
    const body = await readBody(req);
    const ms = Math.max(0, Math.min(Number(body.ms) || 86400000, 7 * 86400000));
    const at = app.clock.advance(ms);
    const fired = await app.scheduler.tick();
    return json(res, 200, { now: at, advanced_ms: ms, scheduler: fired });
  }

  if (req.method === "GET" && pathname === "/") return staticFile(res, "index.html", "text/html; charset=utf-8");
  if (req.method === "GET" && pathname === "/app.js") return staticFile(res, "app.js", "text/javascript; charset=utf-8");
  if (req.method === "GET" && pathname === "/styles.css") return staticFile(res, "styles.css", "text/css; charset=utf-8");

  return json(res, 404, { error: "not found" });
}

const server = http.createServer(async (req, res) => {
  try {
    await handle(req, res);
  } catch (err) {
    const status = err.status || 500;
    json(res, status, { error: String(err.message || err), code: err.code || "INTERNAL" });
  }
});

server.listen(config.port, () => {
  console.log(`PANSHI bank agent listening on http://localhost:${config.port}`);
  console.log(`demo now: ${app.clock.nowIso()}`);
});
