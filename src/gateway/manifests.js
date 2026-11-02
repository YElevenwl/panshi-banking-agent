import { AppError } from "../core/errors.js";
import { sha256Hex, canonicalJson } from "../core/canonical.js";
import * as accounts from "../tools/accounts.js";
import * as payees from "../tools/payees.js";
import * as bills from "../tools/bills.js";
import * as transfers from "../tools/transfers.js";
import * as orders from "../tools/orders.js";
import * as mandates from "../tools/mandates.js";
import * as subscriptions from "../tools/subscriptions.js";
import * as schedules from "../tools/schedules.js";
import * as cards from "../tools/cards.js";
import * as calendar from "../tools/calendar.js";
import * as sandbox from "../tools/sandbox.js";

function invalid(message, details = {}) {
  throw new AppError("INVALID_PARAMS", message, { status: 400, details });
}

function noUserId(params) {
  if (params && Object.prototype.hasOwnProperty.call(params, "user_id")) {
    invalid("参数中不得包含 user_id；主体由会话绑定");
  }
}

function str(params, key, { required = true, max = 200 } = {}) {
  const v = params[key];
  if (v === undefined || v === null || v === "") {
    if (required) invalid(`缺少参数 ${key}`);
    return null;
  }
  if (typeof v !== "string") invalid(`参数 ${key} 必须是字符串`);
  if (v.length > max) invalid(`参数 ${key} 过长`);
  return v;
}

function int(params, key, { required = true, min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const v = params[key];
  if (v === undefined || v === null) {
    if (required) invalid(`缺少参数 ${key}`);
    return null;
  }
  if (!Number.isInteger(v)) invalid(`参数 ${key} 必须是整数`);
  if (v < min || v > max) invalid(`参数 ${key} 超出范围`);
  return v;
}

function iso(params, key, { required = true } = {}) {
  const v = str(params, key, { required, max: 40 });
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}T/.test(v) || !Number.isFinite(new Date(v).getTime())) {
    invalid(`参数 ${key} 必须是 ISO 时间`);
  }
  return v;
}

function oneOf(params, key, values, { required = true, fallback = null } = {}) {
  const v = params[key];
  if (v === undefined || v === null) {
    if (required) invalid(`缺少参数 ${key}`);
    return fallback;
  }
  if (!values.includes(v)) invalid(`参数 ${key} 必须是 ${values.join(" / ")}`);
  return v;
}

function makeManifest(def) {
  const hash = sha256Hex(canonicalJson({
    name: def.name,
    version: def.version,
    risk: def.risk,
    read_only: def.read_only,
    permit_required: def.permit_required,
    idempotency_required: def.idempotency_required,
    side_effect: def.side_effect,
    compensation_tool: def.compensation_tool ?? null,
  }));
  return { ...def, manifest_hash: hash };
}

const manifests = [
  makeManifest({
    name: "payee.search", version: "1.0", risk: "green", read_only: true,
    permit_required: false, idempotency_required: false, side_effect: "none",
    handler: payees.search,
    validate: (p) => { noUserId(p); return { query: str(p, "query", { max: 80 }) }; },
  }),
  makeManifest({
    name: "account.balance", version: "1.0", risk: "green", read_only: true,
    permit_required: false, idempotency_required: false, side_effect: "none",
    handler: accounts.balance,
    validate: (p) => { noUserId(p); return { account_id: str(p, "account_id", { required: false, max: 40 }) }; },
  }),
  makeManifest({
    name: "account.transactions", version: "1.0", risk: "green", read_only: true,
    permit_required: false, idempotency_required: false, side_effect: "none",
    handler: accounts.transactions,
    validate: (p) => { noUserId(p); return { limit: int(p, "limit", { required: false, min: 1, max: 50 }) ?? 10 }; },
  }),
  makeManifest({
    name: "bill.aggregate", version: "1.0", risk: "green", read_only: true,
    permit_required: false, idempotency_required: false, side_effect: "none",
    handler: bills.aggregate,
    validate: (p) => {
      noUserId(p);
      return {
        period: oneOf(p, "period", ["last_month", "this_month", "year"], { required: false, fallback: "last_month" }),
        category: str(p, "category", { required: false, max: 30 }),
      };
    },
  }),
  makeManifest({
    name: "bill.anomaly", version: "1.0", risk: "green", read_only: true,
    permit_required: false, idempotency_required: false, side_effect: "none",
    handler: bills.anomaly,
    validate: (p) => {
      noUserId(p);
      return { period: oneOf(p, "period", ["last_month", "this_month", "year"], { required: false, fallback: "last_month" }) };
    },
  }),
  makeManifest({
    name: "calendar.read", version: "1.0", risk: "green", read_only: true,
    permit_required: false, idempotency_required: false, side_effect: "none",
    handler: calendar.read,
    validate: (p) => { noUserId(p); return {}; },
  }),
  makeManifest({
    name: "sandbox.formula", version: "1.0", risk: "green", read_only: true,
    permit_required: false, idempotency_required: false, side_effect: "none",
    handler: sandbox.formula,
    validate: (p) => {
      noUserId(p);
      const vars = p.variables;
      if (!vars || typeof vars !== "object" || Array.isArray(vars)) invalid("variables 必须是对象");
      for (const [k, v] of Object.entries(vars)) {
        if (typeof v !== "number" || !Number.isFinite(v)) invalid(`变量 ${k} 必须是有限数字`);
      }
      return { formula: str(p, "formula", { max: 500 }), variables: vars };
    },
  }),
  makeManifest({
    name: "calendar.consent", version: "1.0", risk: "green", read_only: false,
    permit_required: false, idempotency_required: false, side_effect: "reversible",
    compensation_tool: null,
    handler: calendar.consent,
    validate: (p) => { noUserId(p); return {}; },
  }),
  makeManifest({
    name: "subscription.list", version: "1.0", risk: "green", read_only: true,
    permit_required: false, idempotency_required: false, side_effect: "none",
    handler: subscriptions.list,
    validate: (p) => { noUserId(p); return {}; },
  }),
  makeManifest({
    name: "ledger.hold", version: "1.0", risk: "yellow", read_only: false,
    permit_required: true, idempotency_required: true, side_effect: "reversible",
    compensation_tool: "ledger.release_hold",
    compensation_params: (result) => ({ hold_id: result.hold_id }),
    handler: transfers.hold,
    validate: (p) => {
      noUserId(p);
      return {
        account_id: str(p, "account_id", { required: false, max: 40 }),
        amount_cents: int(p, "amount_cents", { min: 1, max: 5000000 }),
        expires_at: iso(p, "expires_at"),
      };
    },
  }),
  makeManifest({
    name: "transfer.commit", version: "1.0", risk: "red", read_only: false,
    permit_required: true, idempotency_required: true, side_effect: "irreversible",
    compensation_tool: "transfer.reverse",
    compensation_params: (result) => ({ transfer_id: result.transfer_id }),
    handler: transfers.commit,
    validate: (p) => {
      noUserId(p);
      return {
        account_id: str(p, "account_id", { required: false, max: 40 }),
        payee_id: str(p, "payee_id", { max: 40 }),
        amount_cents: int(p, "amount_cents", { min: 1, max: 5000000 }),
        memo: str(p, "memo", { required: false, max: 120 }) ?? "",
        hold_id: str(p, "hold_id", { max: 40 }),
      };
    },
  }),
  makeManifest({
    name: "transfer.reverse", version: "1.0", risk: "red", read_only: false,
    permit_required: false, idempotency_required: false, side_effect: "compensation",
    handler: transfers.reverse, compensation_only: true,
    validate: (p) => { noUserId(p); return { transfer_id: str(p, "transfer_id", { max: 40 }) }; },
  }),
  makeManifest({
    name: "ledger.release_hold", version: "1.0", risk: "green", read_only: false,
    permit_required: false, idempotency_required: false, side_effect: "compensation",
    handler: transfers.releaseHold, compensation_only: true,
    validate: (p) => { noUserId(p); return { hold_id: str(p, "hold_id", { max: 40 }) }; },
  }),
  makeManifest({
    name: "transfer.schedule", version: "1.0", risk: "yellow", read_only: false,
    permit_required: true, idempotency_required: true, side_effect: "reversible",
    compensation_tool: "schedule.cancel",
    compensation_params: (result) => ({ job_id: result.id }),
    handler: schedules.scheduleTransfer,
    validate: (p) => {
      noUserId(p);
      return {
        payee_id: str(p, "payee_id", { max: 40 }),
        amount_cents: int(p, "amount_cents", { min: 1, max: 5000000 }),
        memo: str(p, "memo", { required: false, max: 120 }) ?? "",
        due_at: iso(p, "due_at"),
      };
    },
  }),
  makeManifest({
    name: "schedule.cancel", version: "1.0", risk: "green", read_only: false,
    permit_required: false, idempotency_required: false, side_effect: "compensation",
    handler: schedules.cancelJob, compensation_only: true,
    validate: (p) => { noUserId(p); return { job_id: str(p, "job_id", { max: 40 }) }; },
  }),
  makeManifest({
    name: "mandate.create", version: "1.0", risk: "yellow", read_only: false,
    permit_required: true, idempotency_required: true, side_effect: "reversible",
    compensation_tool: "mandate.revoke",
    compensation_params: (result) => ({ mandate_id: result.id }),
    handler: mandates.create,
    validate: (p) => {
      noUserId(p);
      if (!p.scope || typeof p.scope !== "object") invalid("缺少 scope");
      return {
        scope: p.scope,
        max_cents: int(p, "max_cents", { min: 1, max: 5000000 }),
        expires_at: iso(p, "expires_at"),
        reuse_existing: !!p.reuse_existing,
      };
    },
  }),
  makeManifest({
    name: "mandate.revoke", version: "1.0", risk: "green", read_only: false,
    permit_required: false, idempotency_required: false, side_effect: "compensation",
    handler: mandates.revoke, compensation_only: true,
    validate: (p) => { noUserId(p); return { mandate_id: str(p, "mandate_id", { max: 40 }) }; },
  }),
  makeManifest({
    name: "order.schedule", version: "1.0", risk: "yellow", read_only: false,
    permit_required: true, idempotency_required: true, side_effect: "reversible",
    compensation_tool: "order.cancel",
    compensation_params: (result) => ({ order_id: result.id }),
    handler: orders.schedule,
    validate: (p) => {
      noUserId(p);
      return {
        merchant: str(p, "merchant", { max: 60 }),
        item: str(p, "item", { max: 60 }),
        amount_cents: int(p, "amount_cents", { min: 1, max: 5000000 }),
        scheduled_at: iso(p, "scheduled_at"),
        merchant_category: oneOf(p, "merchant_category", ["flower", "cake", "other"], { required: false, fallback: "other" }),
        mandate_id: str(p, "mandate_id", { required: false, max: 40 }),
        hold_id: str(p, "hold_id", { required: false, max: 40 }),
      };
    },
  }),
  makeManifest({
    name: "order.commit", version: "1.0", risk: "yellow", read_only: false,
    permit_required: true, idempotency_required: true, side_effect: "irreversible",
    compensation_tool: "order.cancel",
    compensation_params: (result) => ({ order_id: result.id }),
    handler: orders.commit,
    validate: (p) => { noUserId(p); return { order_id: str(p, "order_id", { max: 40 }) }; },
  }),
  makeManifest({
    name: "order.cancel", version: "1.0", risk: "green", read_only: false,
    permit_required: false, idempotency_required: false, side_effect: "compensation",
    handler: orders.cancel, compensation_only: true,
    validate: (p) => { noUserId(p); return { order_id: str(p, "order_id", { max: 40 }) }; },
  }),
  makeManifest({
    name: "subscription.cancel", version: "1.0", risk: "yellow", read_only: false,
    permit_required: true, idempotency_required: true, side_effect: "irreversible",
    compensation_tool: null,
    handler: subscriptions.cancel,
    validate: (p) => { noUserId(p); return { subscription_id: str(p, "subscription_id", { max: 40 }) }; },
  }),
  makeManifest({
    name: "card.apply", version: "1.0", risk: "yellow", read_only: false,
    permit_required: true, idempotency_required: true, side_effect: "irreversible",
    compensation_tool: null,
    handler: cards.apply,
    validate: (p) => { noUserId(p); return { card_type: str(p, "card_type", { required: false, max: 30 }) ?? "虚拟卡", limit_cents: int(p, "limit_cents", { required: false, min: 0, max: 5000000 }) ?? 100000 }; },
  }),
  makeManifest({
    name: "card.freeze", version: "1.0", risk: "red", read_only: false,
    permit_required: true, idempotency_required: true, side_effect: "irreversible",
    compensation_tool: null,
    handler: cards.freeze,
    validate: (p) => { noUserId(p); return { card_id: str(p, "card_id", { max: 40 }) }; },
  }),
  makeManifest({
    name: "card.unfreeze", version: "1.0", risk: "red", read_only: false,
    permit_required: true, idempotency_required: true, side_effect: "irreversible",
    compensation_tool: null,
    handler: cards.unfreeze,
    validate: (p) => { noUserId(p); return { card_id: str(p, "card_id", { max: 40 }) }; },
  }),
];

const byName = new Map(manifests.map((m) => [m.name, m]));

export function getManifest(name) {
  const m = byName.get(name);
  if (!m) throw new AppError("TOOL_NOT_ALLOWED", `工具未注册或不在白名单: ${name}`, { status: 403 });
  return m;
}

export function listManifests() {
  return manifests.map((m) => ({
    name: m.name,
    version: m.version,
    risk: m.risk,
    read_only: m.read_only,
    permit_required: m.permit_required,
    idempotency_required: m.idempotency_required,
    side_effect: m.side_effect,
    manifest_hash: m.manifest_hash,
  }));
}

export function manifestHashes() {
  return Object.fromEntries(manifests.map((m) => [m.name, m.manifest_hash]));
}
