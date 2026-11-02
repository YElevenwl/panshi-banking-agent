const HIGH_PATTERNS = [
  /忽略(以上|之前|前面|所有)?(的)?(规则|限制|指令|要求|审核|安全)/i,
  /无视(以上|之前|前面|所有)?(的)?(规则|限制|指令|审核|安全)/i,
  /绕过(规则|限制|审核|安全|权限|验证|风控)/i,
  /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|rules|prompts?)/i,
  /disregard\s+(all\s+)?(previous|above|prior)\s+(instructions|rules)/i,
  /system\s*prompt/i,
  /developer\s*message/i,
  /你现在是|从现在开始你是|扮演(管理员|root|系统)/i,
  /提高(转账|支付|单笔|日累计)?(限额|额度)/i,
  /关闭(安全|审核|风控|审计|熔断)/i,
  /删除(审计|日志)/i,
  /不要(告诉|通知)(用户|本人|他|她)/i,
  /别让(系统|平台|银行|风控|审核)?(发现|知道)/i,
  /\btransfer\b.*\bto\b/i,
];

const MEDIUM_PATTERNS = [
  /别告诉|保密|不要声张|不能让(他|她|用户)知道/i,
  /很急|紧急|马上|立刻|立刻转|赶紧/i,
  /不用(确认|审批|验证)|跳过(确认|审批|验证)/i,
  /管理员|超级用户|root权限/i,
  /base64|rot13|十六进制|hex编码/i,
];

const ZERO_WIDTH = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function sanitizeInput(text) {
  if (!text || typeof text !== "string") return { clean: "", removed: 0 };
  const before = text.length;
  let clean = text.normalize("NFKC").replace(ZERO_WIDTH, "").replace(CONTROL, "");
  clean = clean.slice(0, 4000).trim();
  return { clean, removed: before - clean.length };
}

export function detectInjection(text) {
  const s = String(text || "");
  const hits = [];
  let score = 0;
  for (const p of HIGH_PATTERNS) {
    if (p.test(s)) {
      hits.push({ pattern: p.source, weight: 3 });
      score += 3;
    }
  }
  for (const p of MEDIUM_PATTERNS) {
    if (p.test(s)) {
      hits.push({ pattern: p.source, weight: 1 });
      score += 1;
    }
  }
  ZERO_WIDTH.lastIndex = 0;
  if (ZERO_WIDTH.test(s)) {
    hits.push({ pattern: "zero_width", weight: 2 });
    score += 2;
  }
  if (/[A-Za-z0-9+/]{80,}={0,2}/.test(s)) {
    hits.push({ pattern: "base64_blob", weight: 2 });
    score += 2;
  }
  if (/<script|javascript:|onerror\s*=/i.test(s)) {
    hits.push({ pattern: "html_script", weight: 3 });
    score += 3;
  }
  return {
    score,
    hits,
    level: score >= 3 ? "high" : score >= 1 ? "low" : "none",
  };
}

export function isHighRiskInjection(text) {
  return detectInjection(text).level === "high";
}

export function wrapUntrusted(source, content) {
  const body = String(content ?? "").replaceAll("</DATA>", "<\\/DATA>").slice(0, 4000);
  return `<DATA trust="UNTRUSTED" source="${source}">${body}</DATA>`;
}

export function sanitizeToolResult(value, { maxLength = 20000 } = {}) {
  let text;
  try {
    text = JSON.stringify(value);
  } catch {
    text = String(value);
  }
  if (text.length > maxLength) text = text.slice(0, maxLength);
  return text
    .replace(ZERO_WIDTH, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/onerror\s*=/gi, "");
}
