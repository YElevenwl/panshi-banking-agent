/**
 * 受限表达式沙箱：只允许数字、白名单变量、+ - * / 和括号。
 * 不执行任意代码，不访问文件/网络/进程，因此没有传统代码沙箱的逃逸面。
 * 这是“分析沙箱”的实现：LLM 若需要自定义计算，只能提交公式，不能提交代码。
 */
const MAX_LENGTH = 500;
const MAX_TOKENS = 200;
const MAX_DEPTH = 24;

class SandboxError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function tokenize(input) {
  if (typeof input !== "string") throw new SandboxError("FORMULA_INVALID", "公式必须是字符串");
  if (input.length > MAX_LENGTH) throw new SandboxError("FORMULA_TOO_LONG", "公式过长");
  const tokens = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(input[i + 1] || ""))) {
      let j = i;
      while (j < input.length && /[0-9.]/.test(input[j])) j += 1;
      const raw = input.slice(i, j);
      if (!/^\d+(\.\d+)?$/.test(raw)) throw new SandboxError("FORMULA_INVALID", `非法数字: ${raw}`);
      tokens.push({ type: "number", value: Number(raw) });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < input.length && /[a-zA-Z0-9_]/.test(input[j])) j += 1;
      tokens.push({ type: "ident", value: input.slice(i, j) });
      i = j;
      continue;
    }
    if ("+-*/()".includes(ch)) {
      tokens.push({ type: ch });
      i += 1;
      continue;
    }
    throw new SandboxError("FORMULA_INVALID", `非法字符: ${ch}`);
  }
  if (tokens.length > MAX_TOKENS) throw new SandboxError("FORMULA_TOO_COMPLEX", "公式过于复杂");
  return tokens;
}

export function evaluateFormula(formula, variables = {}) {
  const tokens = tokenize(formula);
  if (!tokens.length) throw new SandboxError("FORMULA_EMPTY", "公式为空");
  let pos = 0;
  let depth = 0;

  function peek() { return tokens[pos]; }
  function consume(type) {
    const t = tokens[pos];
    if (!t || t.type !== type) throw new SandboxError("FORMULA_INVALID", `期望 ${type}`);
    pos += 1;
    return t;
  }

  function parseExpression() {
    let value = parseTerm();
    while (peek() && (peek().type === "+" || peek().type === "-")) {
      const op = tokens[pos++].type;
      const rhs = parseTerm();
      value = op === "+" ? value + rhs : value - rhs;
    }
    return value;
  }
  function parseTerm() {
    let value = parseFactor();
    while (peek() && (peek().type === "*" || peek().type === "/")) {
      const op = tokens[pos++].type;
      const rhs = parseFactor();
      if (op === "/" && rhs === 0) throw new SandboxError("DIVISION_BY_ZERO", "除数为零");
      value = op === "*" ? value * rhs : value / rhs;
    }
    return value;
  }
  function parseFactor() {
    depth += 1;
    if (depth > MAX_DEPTH) throw new SandboxError("FORMULA_TOO_DEEP", "嵌套过深");
    try {
      const t = peek();
      if (t?.type === "-") { pos += 1; return -parseFactor(); }
      if (t?.type === "+") { pos += 1; return parseFactor(); }
      if (t?.type === "number") { pos += 1; return t.value; }
      if (t?.type === "ident") {
        pos += 1;
        if (!Object.prototype.hasOwnProperty.call(variables, t.value)) {
          throw new SandboxError("UNKNOWN_VARIABLE", `未知变量: ${t.value}`);
        }
        const v = variables[t.value];
        if (typeof v !== "number" || !Number.isFinite(v)) throw new SandboxError("BAD_VARIABLE", `变量不是有限数字: ${t.value}`);
        return v;
      }
      if (t?.type === "(") {
        pos += 1;
        const v = parseExpression();
        consume(")");
        return v;
      }
      throw new SandboxError("FORMULA_INVALID", "缺少表达式");
    } finally {
      depth -= 1;
    }
  }

  const value = parseExpression();
  if (pos !== tokens.length) throw new SandboxError("FORMULA_INVALID", "存在多余符号");
  if (!Number.isFinite(value)) throw new SandboxError("RESULT_NOT_FINITE", "结果不是有限数字");
  const used = [...new Set(tokens.filter((t) => t.type === "ident").map((t) => t.value))];
  return { value, used_variables: used, tokens: tokens.length };
}

export const SANDBOX_LIMITS = { MAX_LENGTH, MAX_TOKENS, MAX_DEPTH };
