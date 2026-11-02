import { formatCents } from "../../core/money.js";
import { addFact } from "./common.js";
import { TRUST } from "../../security/facts.js";
import { sealAudit } from "./transfer_nodes.js";

const WELCOME = "你好，我是磐石银行智能体。我可以帮你转账、分析账单、安排生日计划。涉及资金的操作会先给出审批信封，必要时要求强验证。";

export const directRespond = {
  id: "D0", deps: [], title: "范围与兜底响应", risk: "green",
  async execute(ctx) {
    const p = ctx.state.input.proposal || {};
    const s = p.slots || {};
    addFact(ctx, "user_text", String(ctx.state.input.text || ""), { source: "user_turn", trust: TRUST.USER });
    let text = "";
    if (p.intent === "clarify") {
      text = p.ambiguities?.[0] || "请补充更多信息，例如：给张伟转 800 元，备注房租。";
    } else if (p.intent === "transfer.split") {
      if (s.total_cents && s.people) {
        const per = Math.round(s.total_cents / s.people);
        addFact(ctx, "split", { amount_cents: per, count: s.people }, { source: "calculation", trust: TRUST.SYSTEM });
        text = `AA 收款可以这样算：总金额 ${formatCents(s.total_cents)} 元，${s.people} 人，每人 ${formatCents(per)} 元。收款发起功能将在扩展场景开放；我可以先帮你生成收款话术。`;
      } else {
        text = "AA 收款需要总金额和人数，例如：我们 3 个人 AA，总共 600 元。";
      }
    } else if (/你好|在吗|hi|hello/i.test(String(ctx.state.input.text || ""))) {
      text = WELCOME;
    } else {
      text = `我目前专注银行业务：转账、账单分析、生日计划。${s.reason ? `（${s.reason}）` : ""}你可以说“给张伟转 800 元”或“帮我看看上个月账单”。`;
    }
    return ctx.ok({ text });
  },
  async rollback() { return { status: "ok" }; },
  async onInterrupt() { return { status: "ok" }; },
};

export function directNodes() {
  return [directRespond, { ...sealAudit, id: "D1", deps: ["D0"], title: "审计锚定" }];
}
