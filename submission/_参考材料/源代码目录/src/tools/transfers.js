import { createHold, releaseHold as releaseHoldRow, commitTransfer, reverseTransfer } from "../state/ledger.js";
import { resolveAccount, requireOwnedPayee } from "./common.js";

export function hold(params, ctx) {
  const acc = resolveAccount(ctx, params.account_id ?? null);
  const holdRow = createHold({
    db: ctx.db,
    accountId: acc.id,
    userId: ctx.userId,
    amountCents: params.amount_cents,
    idempotencyKey: ctx.idempotencyKey,
    expiresAt: params.expires_at,
    nowIso: ctx.clock.nowIso(),
    bizDate: ctx.clock.todayKey(),
  });
  return {
    hold_id: holdRow.id,
    amount_cents: holdRow.amount_cents,
    status: holdRow.status,
    expires_at: holdRow.expires_at,
  };
}

export function commit(params, ctx) {
  const payee = requireOwnedPayee(ctx, params.payee_id);
  const acc = resolveAccount(ctx, params.account_id ?? null);
  const tr = commitTransfer({
    db: ctx.db,
    userId: ctx.userId,
    accountId: acc.id,
    payeeId: params.payee_id,
    amountCents: params.amount_cents,
    memo: params.memo || "",
    holdId: params.hold_id,
    idempotencyKey: ctx.idempotencyKey,
    permitId: ctx.permitId,
    nowIso: ctx.clock.nowIso(),
    bizDate: ctx.clock.todayKey(),
  });
  return {
    transfer_id: tr.id,
    status: tr.status,
    amount_cents: tr.amount_cents,
    payee_name: payee.name,
    payee_masked: payee.account_no_masked,
    memo: tr.memo,
    committed_at: tr.committed_at,
  };
}

export function reverse(params, ctx) {
  const tr = reverseTransfer({ db: ctx.db, transferId: params.transfer_id, nowIso: ctx.clock.nowIso() });
  return { transfer_id: tr.id, status: tr.status, reversed_at: tr.reversed_at, amount_cents: tr.amount_cents };
}

export function releaseHold(params, ctx) {
  const h = releaseHoldRow({ db: ctx.db, holdId: params.hold_id, nowIso: ctx.clock.nowIso() });
  return { hold_id: h.id, status: h.status, amount_cents: h.amount_cents };
}
