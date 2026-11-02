const CN_DIGITS = {
  零: 0, 〇: 0, 一: 1, 壹: 1, 二: 2, 贰: 2, 两: 2, 三: 3, 叁: 3,
  四: 4, 肆: 4, 五: 5, 伍: 5, 六: 6, 陆: 6, 七: 7, 柒: 7, 八: 8, 捌: 8, 九: 9, 玖: 9,
};

const CN_UNITS = { 十: 10, 拾: 10, 百: 100, 佰: 100, 千: 1000, 仟: 1000, 万: 10000, 萬: 10000 };

function parseChineseInteger(text) {
  let total = 0;
  let section = 0;
  let number = 0;
  for (const ch of text) {
    if (CN_DIGITS[ch] !== undefined) {
      number = CN_DIGITS[ch];
    } else if (CN_UNITS[ch] !== undefined) {
      const unit = CN_UNITS[ch];
      if (unit === 10000) {
        section = (section + number) * unit;
        total += section;
        section = 0;
        number = 0;
      } else {
        section += (number || 1) * unit;
        number = 0;
      }
    }
  }
  return total + section + number;
}

/**
 * 从自然语言中提取金额，返回分。
 * 支持：800、800.5、1,000、一千、五百、1万2、一千二百。
 * 找不到返回 null。
 */
export function parseAmountToCents(text) {
  if (!text || typeof text !== "string") return null;
  const cleaned = text.replaceAll(",", "").replaceAll("，", "");

  // 1万2 / 2万5
  const wanShort = cleaned.match(/(\d+(?:\.\d+)?)\s*万\s*(\d{1,4})?\s*(?:元|块)?/);
  if (wanShort) {
    const base = Number(wanShort[1]) * 10000;
    const tail = wanShort[2] ? Number(wanShort[2]) : 0;
    const cents = Math.round((base + tail) * 100);
    if (Number.isFinite(cents)) return cents;
  }

  // 阿拉伯数字 + 千/百
  const arabicUnit = cleaned.match(/(\d+(?:\.\d+)?)\s*(千|百)\s*(?:元|块)?/);
  if (arabicUnit) {
    const mult = arabicUnit[2] === "千" ? 1000 : 100;
    return Math.round(Number(arabicUnit[1]) * mult * 100);
  }

  // 阿拉伯数字（元/块/结尾）
  const arabic = cleaned.match(/(\d+(?:\.\d{1,2})?)\s*(?:元|块|块钱)?/);
  if (arabic) {
    const n = Number(arabic[1]);
    if (Number.isFinite(n)) return Math.round(n * 100);
  }

  // 中文数字
  const cn = cleaned.match(/[零〇一壹二贰两三四叁肆五伍六陆七柒八捌九玖十拾百佰千仟万萬]+/);
  if (cn) {
    const n = parseChineseInteger(cn[0]);
    if (n > 0) return n * 100;
  }
  return null;
}

export function formatCents(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n)) return "0.00";
  return (n / 100).toFixed(2);
}

export function formatYuan(cents) {
  return `${formatCents(cents)} 元`;
}

/**
 * 从“转账/预算/元”上下文提取主金额，避免把手机号/日期当成金额。
 * 这是确定性 grounding：金额以用户原话为准，不由模型自行换算。
 */
export function primaryAmountCents(text) {
  if (!text) return null;
  const patterns = [
    /(?:转|转账|打|汇|预算|锁定|准备)\s*(?:给)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?|[一二三四五六七八九十百千万两]+)\s*(?:元|块)?/,
    /([0-9][0-9,]*(?:\.[0-9]{1,2})?|[一二三四五六七八九十百千万两]+)\s*(?:元|块)/,
  ];
  for (const re of patterns) {
    const m = String(text).match(re);
    if (m) {
      const cents = parseAmountToCents(m[1]);
      if (cents) return cents;
    }
  }
  return parseAmountToCents(text);
}

export function parseAmountText(text) {
  const cents = parseAmountToCents(text);
  return cents === null ? null : formatCents(cents);
}
