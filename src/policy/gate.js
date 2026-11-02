import { config } from "../config.js";
import { getAccount, dailyUsageCents, transferCountToday } from "../state/ledger.js";
import { evaluateRules } from "./rules.js";
import { DECISIONS } from "./tiers.js";

export class PolicyGate {
  constructor(db, clock, breaker) {
    this.db = db;
    this.clock = clock;
    this.breaker = breaker;
  }

  getMandate(mandateId, userId, amountCents, merchantCategory = null) {
    if (!mandateId) return null;
    const m = this.db.prepare("SELECT * FROM mandates WHERE id=?").get(mandateId);
    if (!m || m.user_id !== userId) return null;
    const scope = JSON.parse(m.scope_json || "{}");
    const categories = scope.merchant_categories || [];
    const scopeOk = merchantCategory ? categories.includes(merchantCategory) : true;
    return {
      id: m.id,
      active: m.status === "active" && m.expires_at > this.clock.nowIso(),
      remaining_cents: m.max_cents - m.used_cents,
      scope_ok: scopeOk,
      max_cents: m.max_cents,
      used_cents: m.used_cents,
    };
  }

  evaluate({
    action,
    user_id,
    account_id = null,
    payee_id = null,
    amount_cents = 0,
    taint = false,
    mandate_id = null,
    merchant_category = null,
  }) {
    const user = this.db.prepare("SELECT * FROM users WHERE id=?").get(user_id);
    if (!user) throw new Error(`用户不存在: ${user_id}`);
    const account = account_id
      ? getAccount(this.db, account_id)
      : this.db.prepare("SELECT * FROM accounts WHERE user_id=? AND status='active'").get(user_id);
    const payee = payee_id ? this.db.prepare("SELECT * FROM payees WHERE id=?").get(payee_id) : null;

    const today = this.clock.todayKey();
    const usedToday = dailyUsageCents(this.db, user_id, today);
    const projected = usedToday + (amount_cents > 0 ? amount_cents : 0);
    const velocity = this.breaker.velocityCount(user_id);
    const transferCount = transferCountToday(this.db, user_id, today);
    const isNewPayee = payee
      ? new Date(payee.created_at).getTime() > this.clock.nowMs() - 30 * 24 * 3600 * 1000
      : false;

    const breakerState = this.breaker.isKillSwitchOn() ? "OPEN" : this.breaker.getState(user_id).state;
    const mandate = this.getMandate(mandate_id, user_id, amount_cents, merchant_category);

    const result = evaluateRules({
      action,
      amount_cents,
      projected_daily_cents: projected,
      daily_limit_cents: user.daily_limit_cents,
      account_status: account?.status ?? "active",
      payee_status: payee?.status ?? "active",
      payee_risk: payee?.risk_level ?? "low",
      taint,
      breaker_state: breakerState,
      velocity_count: Math.max(velocity, transferCount),
      is_new_payee: isNewPayee,
      mandate,
    });

    return {
      ...result,
      policy_version: config.policyVersion,
      facts: {
        user_id,
        account_id: account?.id ?? null,
        payee_id,
        amount_cents,
        used_today_cents: usedToday,
        projected_daily_cents: projected,
        daily_limit_cents: user.daily_limit_cents,
        breaker_state: breakerState,
        velocity_count: velocity,
        transfer_count_today: transferCount,
        is_new_payee: isNewPayee,
        mandate_id: mandate?.id ?? null,
        taint,
      },
    };
  }

  isDenied(result) {
    return result.decision === DECISIONS.DENY;
  }
}
