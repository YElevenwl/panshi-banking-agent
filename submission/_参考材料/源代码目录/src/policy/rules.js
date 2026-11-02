import { config } from "../config.js";
import { TIERS, DECISIONS, AUTH, RED_ALWAYS, READ_ACTIONS, WRITE_ACTIONS } from "./tiers.js";

function deny(reason, extra = {}) {
  return {
    tier: TIERS.DENY,
    decision: DECISIONS.DENY,
    required_auth: AUTH.NONE,
    reason_codes: [reason],
    constraints: {},
    ...extra,
  };
}

/**
 * 纯函数策略表。输入是结构化事实，不包含任何 LLM 判断。
 * 输出：tier / decision / required_auth / reason_codes / constraints。
 */
export function evaluateRules(input) {
  const {
    action,
    amount_cents = 0,
    projected_daily_cents = 0,
    daily_limit_cents = config.hardCapCents,
    account_status = "active",
    payee_status = "active",
    payee_risk = "low",
    taint = false,
    breaker_state = "CLOSED",
    velocity_count = 0,
    is_new_payee = false,
    mandate = null,
  } = input;

  if (READ_ACTIONS.has(action)) {
    return {
      tier: TIERS.GREEN,
      decision: DECISIONS.ALLOW,
      required_auth: AUTH.NONE,
      reason_codes: ["TIER_GREEN_READ"],
      constraints: {},
    };
  }

  if (!WRITE_ACTIONS.has(action)) return deny("UNKNOWN_ACTION");

  if (action === "calendar.consent") {
    return {
      tier: TIERS.GREEN,
      decision: DECISIONS.ALLOW,
      required_auth: AUTH.NONE,
      reason_codes: ["USER_CONSENT"],
      constraints: {},
    };
  }

  if (breaker_state === "OPEN") return deny("BREAKER_OPEN");
  if (account_status !== "active") return deny("ACCOUNT_FROZEN");
  if (payee_status === "blocked") return deny("PAYEE_BLOCKED");
  if (payee_risk === "high") return deny("PAYEE_HIGH_RISK");
  if (taint) return deny("TAINTED_WRITE");
  if (amount_cents > config.hardCapCents) return deny("HARD_CAP_EXCEEDED");
  if (amount_cents > daily_limit_cents) return deny("USER_DAILY_LIMIT_EXCEEDED");

  if (RED_ALWAYS.has(action)) {
    return {
      tier: TIERS.RED,
      decision: DECISIONS.STRONG_AUTH,
      required_auth: AUTH.TOTP,
      reason_codes: ["TIER_RED_ALWAYS"],
      constraints: { max_amount_cents: amount_cents },
    };
  }

  if (action === "transfer.create" || action === "transfer.schedule" || action === "order.commit") {
    if (mandate && mandate.scope_ok && mandate.remaining_cents >= amount_cents && mandate.active) {
      return {
        tier: TIERS.YELLOW,
        decision: DECISIONS.ALLOW,
        required_auth: AUTH.MANDATE,
        reason_codes: ["MANDATE_COVERED", "TIER_YELLOW_MANDATE"],
        constraints: { max_amount_cents: amount_cents, mandate_id: mandate.id },
      };
    }
    if (projected_daily_cents > config.dailyYellowLimitCents) {
      const reasons = ["TIER_RED_DAILY_CUMULATIVE"];
      if (velocity_count >= 3) reasons.push("VELOCITY_RISK");
      if (is_new_payee) reasons.push("NEW_PAYEE");
      return {
        tier: TIERS.RED,
        decision: DECISIONS.STRONG_AUTH,
        required_auth: AUTH.TOTP,
        reason_codes: reasons,
        constraints: { max_amount_cents: amount_cents },
      };
    }
    const reasons = ["TIER_YELLOW_SMALL_TRANSFER"];
    if (velocity_count >= 3) reasons.push("VELOCITY_RISK");
    if (is_new_payee) reasons.push("NEW_PAYEE");
    return {
      tier: TIERS.YELLOW,
      decision: DECISIONS.CONFIRM,
      required_auth: AUTH.USER_CONFIRM,
      reason_codes: reasons,
      constraints: { max_amount_cents: amount_cents },
    };
  }

  if (action === "subscription.cancel" || action === "card.apply" || action === "mandate.create") {
    return {
      tier: TIERS.YELLOW,
      decision: DECISIONS.CONFIRM,
      required_auth: AUTH.USER_CONFIRM,
      reason_codes: ["TIER_YELLOW_REVERSIBLE"],
      constraints: { max_amount_cents: amount_cents },
    };
  }

  if (action === "ledger.hold" || action === "order.schedule") {
    return {
      tier: TIERS.YELLOW,
      decision: DECISIONS.CONFIRM,
      required_auth: AUTH.USER_CONFIRM,
      reason_codes: ["TIER_YELLOW_FUNDS_MOVE"],
      constraints: { max_amount_cents: amount_cents },
    };
  }

  return deny("UNKNOWN_ACTION");
}
