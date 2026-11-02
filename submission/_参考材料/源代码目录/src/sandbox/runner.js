import { evaluateFormula, SANDBOX_LIMITS } from "./expression.js";

/**
 * 分析沙箱入口。只接受公式，不接受代码。
 * 生产环境若确实需要执行不可信代码，应替换为 gVisor/Firecracker 等强隔离运行时。
 */
export function runFormula({ formula, variables }) {
  const result = evaluateFormula(formula, variables);
  return {
    ...result,
    limits: SANDBOX_LIMITS,
    isolation: "restricted-expression: no io, no code execution, whitelisted variables only",
  };
}
