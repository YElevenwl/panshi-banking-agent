import { config } from "./config.js";
import { Clock } from "./core/clock.js";
import { openDb, closeDb } from "./state/db.js";
import { seedDatabase } from "./state/seed.js";
import { AuditLog } from "./audit/log.js";
import { Breaker } from "./security/breaker.js";
import { PermitService } from "./policy/permit.js";
import { ApprovalService } from "./policy/approvals.js";
import { PolicyGate } from "./policy/gate.js";
import { ToolGateway } from "./gateway/tool_gateway.js";
import { DagEngine } from "./dag/engine.js";
import { Orchestrator } from "./orchestrator.js";
import { proposeIntent } from "./intent/llm.js";
import { transferNodes } from "./dag/nodes/transfer_nodes.js";
import { directNodes } from "./dag/nodes/direct_nodes.js";
import { billNodes } from "./dag/nodes/bill_nodes.js";
import { birthdayNodes, orderNodes } from "./dag/nodes/birthday_nodes.js";
import { Scheduler } from "./dag/scheduler.js";

export function createApp({
  dbPath = config.dbPath,
  auditDir = config.auditDir,
  reset = false,
  demoNow = config.demoNow,
  extraScenarios = {},
} = {}) {
  const clock = new Clock(demoNow);
  const db = openDb({ dbPath, reset });
  seedDatabase(db, clock, { force: reset });
  const audit = new AuditLog(db, clock, { dir: auditDir, reset });
  const breaker = new Breaker(db, clock);
  const permits = new PermitService(db, clock);
  const approvals = new ApprovalService(db, clock, audit);
  const policy = new PolicyGate(db, clock, breaker);
  const gateway = new ToolGateway({ db, clock, permits, breaker, audit });
  const llm = { proposeIntent };

  const services = { policy, permits, approvals, breaker, llm, audit, gateway };
  const scenarios = {
    transfer: { name: "transfer", nodes: transferNodes() },
    bill: { name: "bill", nodes: billNodes() },
    birthday: { name: "birthday", nodes: birthdayNodes() },
    order_commit: { name: "order_commit", nodes: orderNodes() },
    direct: { name: "direct", nodes: directNodes() },
    ...extraScenarios,
  };

  const engine = new DagEngine({ db, clock, audit, gateway, services, scenarios });
  const orchestrator = new Orchestrator({ engine, clock, audit, db, llm });
  const scheduler = new Scheduler({ db, clock, engine, audit });

  return {
    db, clock, audit, breaker, permits, approvals, policy, gateway, engine, orchestrator, scheduler,
    scenarios, services,
    close: () => {
      scheduler.stop();
      closeDb();
    },
  };
}
