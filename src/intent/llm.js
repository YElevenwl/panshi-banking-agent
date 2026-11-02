import { config } from "../config.js";
import { primaryAmountCents } from "../core/money.js";
import { mockPropose } from "./mock_llm.js";
import { openaiPropose } from "./openai_llm.js";
import { normalizeProposal } from "./schema.js";

function groundIntent(proposal, text) {
  const t = String(text || "");
  if (/(异常|可疑|重复扣款|不对劲|退款)/.test(t) && proposal.intent === "bill.analyze") {
    return { ...proposal, intent: "bill.anomaly" };
  }
  if (/(生日)/.test(t) && /(准备|安排|计划|礼物|鲜花|蛋糕|爱人|老婆|老公|惊喜)/.test(t) && proposal.intent === "out_of_scope") {
    return { ...proposal, intent: "birthday.plan", slots: { budget_cents: 100000, wants_flower: true, wants_cake: true } };
  }
  return proposal;
}

function groundAmounts(proposal, text) {
  const cents = primaryAmountCents(text);
  if (!cents) return proposal;
  const slots = { ...proposal.slots };
  if (["transfer.create", "transfer.schedule", "transfer.split"].includes(proposal.intent)) {
    slots.amount_cents = cents;
  }
  if (proposal.intent === "birthday.plan") slots.budget_cents = cents;
  return { ...proposal, slots, slot_grounding: { amount_cents: cents, source: "user_text" } };
}

export async function proposeIntent({ text, clock }) {
  if (config.llm.provider === "openai") {
    try {
      return groundAmounts(groundIntent(await openaiPropose({ text, clock }), text), text);
    } catch (err) {
      if (config.llm.strict) throw err;
      const fallback = await mockPropose({ text, clock });
      return groundAmounts(groundIntent(normalizeProposal({
        ...fallback,
        rationale: `${fallback.rationale || ""} [LLM fallback: ${String(err.message || err).slice(0, 80)}]`,
        source: "mock-fallback",
      }), text), text);
    }
  }
  return groundAmounts(groundIntent(await mockPropose({ text, clock }), text), text);
}
