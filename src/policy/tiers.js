export const TIERS = {
  GREEN: "GREEN",
  YELLOW: "YELLOW",
  RED: "RED",
  DENY: "DENY",
};

export const DECISIONS = {
  ALLOW: "ALLOW",
  CONFIRM: "CONFIRM",
  STRONG_AUTH: "STRONG_AUTH",
  DENY: "DENY",
};

export const AUTH = {
  NONE: "none",
  USER_CONFIRM: "user_confirm",
  TOTP: "totp",
  MANDATE: "mandate",
};

export const READ_ACTIONS = new Set([
  "account.balance",
  "account.transactions",
  "payee.search",
  "bill.aggregate",
  "bill.anomaly",
  "wealth.earnings",
  "subscription.list",
  "calendar.read",
  "sandbox.formula",
]);

export const RED_ALWAYS = new Set([
  "password.change",
  "card.freeze",
  "card.unfreeze",
  "wealth.purchase",
  "limit.change",
]);

export const WRITE_ACTIONS = new Set([
  "transfer.create",
  "transfer.schedule",
  "ledger.hold",
  "order.schedule",
  "order.commit",
  "subscription.cancel",
  "card.apply",
  "card.freeze",
  "card.unfreeze",
  "wealth.purchase",
  "password.change",
  "limit.change",
  "mandate.create",
  "calendar.consent",
]);
