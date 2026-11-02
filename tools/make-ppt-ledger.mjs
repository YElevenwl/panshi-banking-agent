import fs from "node:fs";
import path from "node:path";
import pptxgen from "pptxgenjs";

const ROOT = path.resolve("..");
const SHOTS = path.join(ROOT, "deliverables", "screenshots");
const OUT = path.join(ROOT, "deliverables", "PANSHI-答辩-账本版.pptx");
const EVAL = path.join(ROOT, "eval");

const C = {
  paper: "F4EFE3",
  paper2: "EFE7D7",
  ink: "151713",
  ink2: "20231D",
  ink3: "2C3028",
  red: "B23A2B",
  gold: "A8874E",
  gold2: "C9A86A",
  sage: "3F6B57",
  ochre: "B8873B",
  muted: "6F6A5D",
  mutedD: "A6A397",
  line: "D8CFBC",
  lineD: "4A4C42",
};
const FD = "SimSun";
const FB = "Microsoft YaHei";
const FM = "Consolas";

const pptx = new pptxgen();
pptx.defineLayout({ name: "PANSHI_LEDGER", width: 13.333, height: 7.5 });
pptx.layout = "PANSHI_LEDGER";
pptx.author = "磐石团队";
pptx.subject = "银行 AI Banking Agent 竞赛答辩";
pptx.title = "磐石银行智能体 · 审计档案";
pptx.company = "PANSHI";
pptx.lang = "zh-CN";

const readJson = (p, f = null) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return f; } };
const mock = readJson(path.join(EVAL, "report-mock.json")) || {};
const real = readJson(path.join(EVAL, "report-real.json")) || {};
const audit = readJson(path.join(ROOT, "deliverables", "audit-sample.json")) || {};

function rule(s, x, y, w, color = C.line, h = 0.008) {
  s.addShape(pptx.ShapeType.rect, { x, y, w, h, fill: { color }, line: { color, transparency: 100 } });
}
function vrule(s, x, y, h, color = C.line, w = 0.01) {
  s.addShape(pptx.ShapeType.rect, { x, y, w, h, fill: { color }, line: { color, transparency: 100 } });
}
function txt(s, text, x, y, w, h, o = {}) {
  s.addText(text, {
    x, y, w, h,
    fontSize: o.size ?? 10,
    color: o.color ?? C.ink,
    fontFace: o.font ?? FB,
    bold: o.bold ?? false,
    align: o.align ?? "left",
    valign: o.valign ?? "top",
    margin: 0,
    lineSpacingMultiple: o.lh ?? 1.15,
    charSpacing: o.cs ?? 0,
    breakLine: false,
  });
}
function mono(s, text, x, y, w, h, o = {}) {
  txt(s, text, x, y, w, h, { font: FM, size: o.size ?? 7.5, color: o.color ?? C.muted, cs: o.cs ?? 0.4, ...o });
}
function base(s, no, kicker, title, dark = false) {
  s.background = { color: dark ? C.ink : C.paper };
  const fg = dark ? C.paper : C.ink;
  rule(s, 0.62, 0.34, 12.1, dark ? C.lineD : C.line);
  mono(s, kicker, 0.62, 0.45, 7.2, 0.22, { size: 7.2, color: dark ? C.gold2 : C.gold });
  txt(s, title, 0.62, 0.68, 10.7, 0.66, { size: 23, font: FD, color: fg, bold: true, cs: 0.7 });
  rule(s, 0.62, 7.04, 12.1, dark ? C.lineD : C.line);
  mono(s, "PANSHI / AUDIT DOSSIER", 0.62, 7.12, 4.0, 0.2, { size: 7, color: dark ? C.mutedD : C.muted });
  mono(s, `P. ${String(no).padStart(2, "0")} / 16`, 11.4, 7.12, 1.32, 0.2, { size: 7, color: dark ? C.mutedD : C.muted, align: "right" });
}
function seal(s, x, y, size, ch, color = C.red, textColor = C.paper) {
  s.addShape(pptx.ShapeType.rect, { x, y, w: size, h: size, fill: { color }, line: { color } });
  s.addShape(pptx.ShapeType.rect, { x: x + 0.055, y: y + 0.055, w: size - 0.11, h: size - 0.11, fill: { color, transparency: 100 }, line: { color: textColor, width: 1 } });
  s.addText(ch, { x, y: y + size * 0.02, w: size, h: size * 0.94, fontSize: size * 30, color: textColor, bold: true, fontFace: FD, align: "center", valign: "middle", margin: 0 });
}
function pngSize(file) {
  const b = fs.readFileSync(file);
  if (b.length >= 24 && b.toString("ascii", 1, 4) === "PNG") return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  return null;
}
function exhibit(s, file, x, y, w, h, label, dark = false) {
  const p = path.join(SHOTS, file);
  if (!fs.existsSync(p)) {
    s.addShape(pptx.ShapeType.rect, { x, y, w, h, fill: { color: dark ? C.ink2 : C.paper2 }, line: { color: dark ? C.lineD : C.line } });
    txt(s, `缺少截图 ${file}`, x + 0.2, y + h / 2, w - 0.4, 0.3, { size: 9, color: C.muted, align: "center" });
  } else {
    const d = pngSize(p);
    let ix = x, iy = y, iw = w, ih = h;
    if (d) {
      const k = Math.min(w / d.w, h / d.h);
      iw = d.w * k; ih = d.h * k;
      ix = x + (w - iw) / 2; iy = y + (h - ih) / 2;
    }
    s.addImage({ path: p, x: ix, y: iy, w: iw, h: ih });
    s.addShape(pptx.ShapeType.rect, { x, y, w, h, fill: { color: dark ? C.ink : C.paper, transparency: 100 }, line: { color: dark ? C.lineD : C.ink, width: 1 } });
  }
  mono(s, label, x, y + h + 0.04, w, 0.2, { size: 7, color: dark ? C.gold2 : C.gold });
}
function stat(s, x, y, w, n, label, color = C.ink, size = 34) {
  rule(s, x, y, w, color === C.red ? C.red : C.line);
  txt(s, n, x, y + 0.12, w, 0.55, { size, font: FD, color, bold: true });
  mono(s, label, x, y + 0.72, w, 0.24, { size: 7.4, color: C.muted });
}
function band(s, x, y, w, h, text, dark = false) {
  s.addShape(pptx.ShapeType.rect, { x, y, w, h, fill: { color: dark ? C.ink2 : C.ink }, line: { color: dark ? C.lineD : C.ink } });
  txt(s, text, x + 0.22, y + 0.14, w - 0.44, h - 0.2, { size: 10.5, color: C.paper, font: FB });
}
function node(s, x, y, w, h, id, title, risk, desc = "", color = C.line, dark = false) {
  s.addShape(pptx.ShapeType.rect, { x, y, w, h, fill: { color: dark ? C.ink2 : C.paper, transparency: 100 }, line: { color: dark ? C.lineD : C.line, width: 0.8 } });
  rule(s, x, y, w, color, 0.03);
  mono(s, id, x + 0.1, y + 0.08, 0.5, 0.18, { size: 6.8, color: dark ? C.gold2 : C.gold });
  txt(s, title, x + 0.1, y + 0.26, w - 0.2, 0.3, { size: 8.2, color: dark ? C.paper : C.ink, bold: true });
  txt(s, desc, x + 0.1, y + 0.52, w - 0.2, 0.4, { size: 6.8, color: dark ? C.mutedD : C.muted, lh: 1.35 });
  mono(s, risk, x + 0.1, y + h - 0.2, w - 0.2, 0.16, { size: 6.2, color: color === C.line ? C.muted : color });
}

// ---------- 01 Cover ----------
{
  const s = pptx.addSlide();
  s.background = { color: C.paper };
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.18, h: 7.5, fill: { color: C.red }, line: { color: C.red } });
  txt(s, "001", 7.55, 0.12, 5.2, 2.2, { size: 130, font: FD, color: "E6DCC6", align: "right" });
  mono(s, "PRIVATE BANKING INTELLIGENCE / AUDIT DOSSIER", 0.65, 0.5, 8.5, 0.22, { size: 7.4, color: C.gold, cs: 1.5 });
  txt(s, "磐石", 0.64, 1.25, 5.6, 1.6, { size: 94, font: FD, color: C.ink, bold: true });
  txt(s, "银行智能体", 0.68, 2.9, 7.4, 0.85, { size: 40, font: FD, color: C.ink, bold: true, cs: 0.6 });
  mono(s, "PANSHI BANKING AGENT", 0.7, 3.88, 5.6, 0.24, { size: 8.5, color: C.gold, cs: 4.5 });
  seal(s, 9.7, 2.55, 1.5, "磐");
  txt(s, "模型提议 · 系统裁决 · 证据说话 · 审计可回放", 0.68, 4.55, 8.3, 0.5, { size: 17, font: FD, color: C.ink, bold: true });
  txt(s, "面向金融竞赛的银行 AI Banking Agent：三条端到端链路、24 个受控工具、171 条可回放审计事件。", 0.68, 5.2, 8.4, 0.6, { size: 9.6, color: C.muted });
  rule(s, 0.68, 6.32, 11.85, C.line);
  const items = [["44 / 44", "TESTS"], ["18 / 18", "ADVERSARIAL"], ["171", "AUDIT EVENTS"]];
  items.forEach(([n, l], i) => {
    const x = 0.68 + i * 3.9;
    txt(s, n, x, 6.43, 2.5, 0.45, { size: 20, font: FD, color: i === 1 ? C.sage : C.ink, bold: true });
    mono(s, l, x, 6.9, 2.5, 0.2, { size: 7, color: C.muted, cs: 1.4 });
  });
  mono(s, "DOSSIER 001 / 16 PAGES", 0.68, 7.15, 3.5, 0.2, { size: 6.8, color: C.muted });
}

// ---------- 02 Thesis ----------
{
  const s = pptx.addSlide();
  base(s, 2, "THESIS / 00", "模型可以提议，但不能给自己授权。");
  txt(s, "这是整套系统的第一条不变量。", 0.66, 1.42, 7.2, 0.3, { size: 10.5, color: C.muted });
  txt(s, "模型只负责理解意图、起草计划、\n提议工具调用。它不持有资金权限，\n也不参与权限裁决。", 0.66, 2.0, 7.6, 1.7, { size: 26, font: FD, color: C.ink, lh: 1.5 });
  vrule(s, 0.66, 4.02, 0.9, C.red, 0.035);
  txt(s, "权限由独立 Policy Gate 裁决；\n写操作由签名 Permit 放行；\n每一步都写入 append-only 审计链。", 0.9, 4.0, 6.4, 1.1, { size: 11.2, color: C.ink, lh: 1.65 });
  const pr = [["01", "权限", "确定性规则，不读取模型置信度。"], ["02", "执行", "没有 Permit，网关拒绝写操作。"], ["03", "审计", "每个事件哈希前一条，可回放。"]];
  pr.forEach(([n, t, d], i) => {
    const y = 1.45 + i * 1.32;
    mono(s, n, 9.1, y, 0.4, 0.2, { size: 7.5, color: C.gold });
    txt(s, t, 9.6, y - 0.04, 2.8, 0.38, { size: 15, font: FD, color: C.ink, bold: true });
    txt(s, d, 9.6, y + 0.4, 2.9, 0.6, { size: 8.8, color: C.muted, lh: 1.5 });
    rule(s, 9.1, y + 1.02, 3.3, C.line);
  });
  seal(s, 9.35, 5.55, 0.95, "证");
  band(s, 0.66, 5.72, 8.0, 0.72, "Policy Gate 不读取模型的置信度；它只读取金额、日累计、收款人、taint、熔断等结构化事实。");
}

// ---------- 03 Architecture ----------
{
  const s = pptx.addSlide();
  base(s, 3, "ARCHITECTURE / 01", "三平面：模型只在一个平面里出现", true);
  const bands = [
    { y: 1.52, label: "01 / CONTROL PLANE", color: C.gold2, boxes: [["Intent Gateway", "规范化 / 注入检测"], ["Orchestrator", "路由 / 状态机"], ["Policy Gate", "GREEN / YELLOW / RED"], ["审批 + Permit", "信封 / TOTP / 令牌"], ["熔断", "Kill Switch"]] },
    { y: 3.05, label: "02 / EXECUTION PLANE", color: C.sage, boxes: [["DAG Engine", "execute / rollback / interrupt"], ["Tool Gateway", "验签 / 参数哈希 / 幂等"], ["24 个受控工具", "账户 / 账单 / 订单 / 日历"], ["银行核心模拟", "账务 / 冻结 / 订单"], ["分析沙箱", "受限表达式"]] },
    { y: 4.58, label: "03 / DATA PLANE", color: C.gold2, boxes: [["SQLite WAL", "运行 / 账务 / 冻结"], ["审计哈希链", "append-only + Merkle"], ["FactStore", "数字证据锚定"], ["版本与清单", "策略 / Manifest 哈希"]] },
  ];
  bands.forEach((b, bi) => {
    s.addShape(pptx.ShapeType.rect, { x: 0.65, y: b.y, w: 12.0, h: bi === 2 ? 1.1 : 1.22, fill: { color: C.ink2, transparency: 100 }, line: { color: C.lineD, width: 0.8 } });
    mono(s, b.label, 0.8, b.y + 0.1, 3.3, 0.2, { size: 6.8, color: b.color });
    const bx = bi === 2 ? [0.85, 3.4, 6.2, 9.0] : [0.85, 3.05, 5.25, 7.45, 9.65];
    const bw = bi === 2 ? 2.3 : 1.95;
    b.boxes.forEach(([t, d], i) => {
      s.addShape(pptx.ShapeType.rect, { x: bx[i], y: b.y + 0.38, w: bw, h: 0.65, fill: { color: C.ink3, transparency: 100 }, line: { color: b.color, width: 0.8 } });
      txt(s, t, bx[i] + 0.1, b.y + 0.45, bw - 0.2, 0.26, { size: 8.6, color: C.paper, bold: true });
      txt(s, d, bx[i] + 0.1, b.y + 0.71, bw - 0.2, 0.24, { size: 6.8, color: C.mutedD });
    });
  });
  // connectors
  [[1.8, 2.9, 1.8, 3.05], [6.2, 2.9, 6.2, 3.05], [8.4, 4.3, 8.4, 4.58], [4.5, 4.3, 4.5, 4.58]].forEach(([x1, y1, x2, y2]) => {
    s.addShape(pptx.ShapeType.line, { x: x1, y: y1, w: 0, h: y2 - y1, line: { color: C.lineD, width: 0.8, dashType: "dash" } });
  });
  txt(s, "没有签名 Permit，Tool Gateway 拒绝写操作。", 0.65, 6.15, 9.8, 0.4, { size: 11.2, color: C.gold2, font: FB, bold: true });
  mono(s, "MODEL PROPOSES / SYSTEM DECIDES / GATEWAY EXECUTES", 0.65, 6.53, 9.0, 0.2, { size: 6.8, color: C.mutedD, cs: 1.2 });
}

// ---------- 04 Lifecycle ----------
{
  const s = pptx.addSlide();
  base(s, 4, "LIFECYCLE / 02", "一条请求，七道边界。");
  s.addShape(pptx.ShapeType.line, { x: 0.9, y: 2.55, w: 11.6, h: 0, line: { color: C.ink, width: 0.8 } });
  const steps = [
    ["01", "输入 Hook", "规范化 / 注入检测"],
    ["02", "LLM 提案", "Intent / Plan"],
    ["03", "DAG 执行", "固定拓扑 / checkpoint"],
    ["04", "Policy Gate", "确定性裁决"],
    ["05", "审批 / 强验证", "信封 / TOTP"],
    ["06", "Permit + 网关", "验签 / 幂等"],
    ["07", "证据 + 审计", "FactStore / 哈希链"],
  ];
  steps.forEach(([n, t, d], i) => {
    const x = 1.0 + i * 1.66;
    const critical = i === 3 || i === 4;
    s.addShape(pptx.ShapeType.ellipse, { x: x + 0.05, y: 2.46, w: 0.18, h: 0.18, fill: { color: critical ? C.red : C.ink }, line: { color: critical ? C.red : C.ink } });
    mono(s, n, x, 2.12, 0.5, 0.2, { size: 7.5, color: critical ? C.red : C.gold });
    txt(s, t, x, 2.76, 1.45, 0.3, { size: 9.6, color: C.ink, bold: true });
    txt(s, d, x, 3.1, 1.45, 0.72, { size: 7.8, color: C.muted, lh: 1.45 });
  });
  mono(s, "7 STEPS / 2 HARD GATES", 10.6, 1.3, 2.1, 0.2, { size: 6.8, color: C.gold, align: "right" });
  txt(s, "写操作只有两条路：被拒绝，或被签名许可后执行。", 0.66, 4.25, 11.6, 0.5, { size: 15.5, font: FD, color: C.ink, bold: true });
  band(s, 0.66, 5.05, 12.0, 0.9, "模型输出不是授权。Permit 才是。Tool Gateway 是唯一能产生资金副作用的入口。", true);
  mono(s, "INPUT → PROPOSAL → DECISION → PERMIT → EXECUTION → EVIDENCE → AUDIT", 0.66, 6.35, 11.6, 0.2, { size: 6.8, color: C.muted, cs: 0.8 });
}

// ---------- 05 Permission ----------
{
  const s = pptx.addSlide();
  base(s, 5, "PERMISSION / 03", "三级权限，是一道硬边界。");
  const tiers = [
    ["01 / GREEN", "绿", "自动执行", "只读 / 低风险查询", "ALLOW · 0 CONFIRM", C.sage],
    ["02 / YELLOW", "认", "用户确认", "日累计 ≤ 1000 元 / 订阅 / 冻结", "CONFIRM · 信封 5 分钟", C.ochre],
    ["03 / RED", "验", "强验证", "日累计 > 1000 元 / 改密 / 挂失", "TOTP · 3 分钟", C.red],
  ];
  tiers.forEach(([k, ch, t, d, code, color], i) => {
    const x = 0.65 + i * 4.05;
    rule(s, x, 1.45, 3.75, color, 0.05);
    mono(s, k, x, 1.58, 2.2, 0.2, { size: 7.4, color });
    txt(s, ch, x, 1.95, 0.8, 0.85, { size: 52, font: FD, color, bold: true });
    txt(s, t, x + 0.9, 2.08, 2.7, 0.4, { size: 18, font: FD, color: C.ink, bold: true });
    txt(s, d, x, 2.95, 3.4, 0.55, { size: 9.2, color: C.muted, lh: 1.5 });
    mono(s, code, x, 3.66, 3.5, 0.2, { size: 7, color });
  });
  rule(s, 0.65, 4.55, 12.0, C.line);
  txt(s, "日累计 = 已提交 + 冻结 + 在途", 0.66, 4.72, 5.4, 0.35, { size: 12.5, font: FD, color: C.ink, bold: true });
  txt(s, "两笔 800 元：第一笔 YELLOW；第二笔投影 1600 → RED。不会出现两笔都按 YELLOW 通过。", 0.66, 5.18, 6.3, 0.9, { size: 9.4, color: C.muted, lh: 1.6 });
  txt(s, "赛题 RED 动作不降级：挂失/解挂即使可逆也按 RED；可逆性只用于补偿策略。", 7.1, 4.72, 5.5, 0.8, { size: 9.4, color: C.muted, lh: 1.6 });
  seal(s, 11.4, 5.95, 0.8, "界");
}

// ---------- 06 Policy + Permit ----------
{
  const s = pptx.addSlide();
  base(s, 6, "ENVELOPE / 04", "两把钥匙：裁决与许可。");
  const box = (x, y, w, h, t, d, color = C.ink) => {
    s.addShape(pptx.ShapeType.rect, { x, y, w, h, fill: { color: C.paper, transparency: 100 }, line: { color, width: 1 } });
    txt(s, t, x + 0.12, y + 0.12, w - 0.24, 0.3, { size: 11, font: FD, color, bold: true });
    txt(s, d, x + 0.12, y + 0.46, w - 0.24, 0.4, { size: 7.8, color: C.muted });
  };
  box(0.65, 1.5, 2.8, 0.85, "Policy Gate", "GREEN / YELLOW / RED", C.gold);
  box(3.75, 1.5, 2.8, 0.85, "Permit", "HMAC / params_hash / nonce", C.red);
  box(2.1, 2.95, 2.9, 0.85, "Tool Gateway", "验签 / 幂等 / taint", C.sage);
  s.addShape(pptx.ShapeType.line, { x: 2.05, y: 2.35, w: 0.75, h: 0.6, line: { color: C.ink, width: 0.8 } });
  s.addShape(pptx.ShapeType.line, { x: 4.2, y: 2.35, w: 0.6, h: 0.6, line: { color: C.ink, width: 0.8 } });
  mono(s, "审批信封：金额 / 收款人 / 可逆性 / 补偿 / 过期 / nonce", 0.66, 4.05, 6.2, 0.2, { size: 7.2, color: C.gold });
  txt(s, "改金额、改收款人、重放 nonce，都会让网关拒绝。", 0.66, 4.35, 5.6, 0.4, { size: 9.4, color: C.muted });
  seal(s, 5.75, 5.4, 0.85, "审");
  exhibit(s, "03-transfer-envelope.png", 7.0, 1.35, 5.45, 3.4, "EXHIBIT A / 审批信封");
  txt(s, "审批不是弹窗，是一份可核对的执行契约。", 0.66, 5.55, 5.2, 0.5, { size: 14, font: FD, color: C.ink, bold: true });
}

// ---------- 07 Audit ----------
{
  const s = pptx.addSlide();
  base(s, 7, "AUDIT / 05", "每一条事件，都指向前一条。");
  const hashes = ["d2ca…f99f", "ec36…6b00", "6299…a18", "1f56…4799"];
  hashes.forEach((h, i) => {
    const x = 0.65 + i * 1.7;
    s.addShape(pptx.ShapeType.rect, { x, y: 1.55, w: 1.5, h: 0.68, fill: { color: C.paper, transparency: 100 }, line: { color: C.line, width: 0.8 } });
    mono(s, `EV ${i + 1}`, x + 0.1, 1.61, 0.6, 0.18, { size: 6.5, color: C.gold });
    mono(s, h, x + 0.1, 1.83, 1.3, 0.2, { size: 6.8, color: C.ink });
    if (i < 3) s.addText("→", { x: x + 1.5, y: 1.72, w: 0.2, h: 0.2, fontSize: 9, color: C.red, margin: 0 });
  });
  txt(s, "171", 0.65, 2.7, 3.0, 1.3, { size: 72, font: FD, color: C.ink, bold: true });
  mono(s, "EVENTS / 1 MERKLE ANCHOR / VERIFY OK", 0.68, 4.0, 4.0, 0.22, { size: 7.2, color: C.gold, cs: 0.8 });
  txt(s, "trace_id 让每一笔资金动作可以按时间线回放：谁、基于什么、申请什么、谁批准、调了什么。", 0.68, 4.5, 5.7, 0.9, { size: 10, color: C.muted, lh: 1.65 });
  exhibit(s, "14b-audit-verified.png", 7.15, 1.32, 5.3, 3.3, "EXHIBIT B / 哈希链校验");
  txt(s, "篡改不是改一条日志，\n而是改整条历史。", 7.15, 5.1, 5.2, 0.9, { size: 18, font: FD, color: C.ink, bold: true, lh: 1.35 });
  seal(s, 11.5, 5.95, 0.8, "审");
}

// ---------- 08 DAG ----------
{
  const s = pptx.addSlide();
  base(s, 8, "ROLLBACK / 06", "固定链路，允许中断，允许撤回。");
  const nodes = [
    ["N0", "绑定会话", "—", "建立会话与账户"], ["N1", "解析意图", "READ", "LLM 输出意图提案"], ["N2", "收款人", "GREEN", "只读工具解析收款人"], ["N3", "风险事实", "—", "金额 / 日累计 / taint"], ["N4", "策略裁决", "POLICY", "确定性规则输出"],
    ["N5", "审批 / 强验证", "YELLOW", "信封 + TOTP 挑战"], ["N6", "冻结 / 定时", "PERMIT", "hold / scheduled job"], ["N7", "提交转账", "RED", "网关提交 + 补偿令牌"], ["N8", "证据回执", "GREEN", "FactStore 数字校验"], ["N9", "审计锚定", "—", "哈希链 + Merkle"],
  ];
  nodes.forEach(([id, t, r, d], i) => {
    const x = 0.65 + (i % 5) * 2.36;
    const y = i < 5 ? 1.55 : 3.15;
    const color = id === "N4" ? C.gold : id === "N5" ? C.ochre : id === "N7" ? C.red : C.line;
    node(s, x, y, 2.14, 1.18, id, t, r, d, color);
    if (i % 5 < 4) txt(s, "→", x + 2.15, y + 0.42, 0.2, 0.2, { size: 8, color: C.gold, align: "center" });
  });
  s.addShape(pptx.ShapeType.line, { x: 0.65, y: 4.75, w: 11.8, h: 0, line: { color: C.red, width: 1, dashType: "dash" } });
  mono(s, "COMPENSATION PATH / 逆序：取消订单 / 释放冻结 / 冲正 / 撤销 Mandate", 0.68, 4.82, 11.6, 0.2, { size: 7, color: C.red });
  txt(s, "副作用只在 Tool Gateway 发生。节点可重放，幂等键防止重复扣款。", 0.66, 5.35, 7.4, 0.4, { size: 10.2, color: C.muted });
  band(s, 0.66, 6.0, 11.9, 0.55, "不可逆动作进入人工对账，不假装回退。", true);
}

// ---------- 09 Transfer ----------
{
  const s = pptx.addSlide();
  base(s, 9, "EVIDENCE / 07", "800 元：一次可回放的转账。");
  exhibit(s, "04-transfer-completed.png", 0.65, 1.35, 8.2, 5.1, "EXHIBIT C / 转账完成 · DAG / 策略 / 审计");
  const x = 9.12;
  txt(s, "800.00", x, 1.35, 3.0, 0.55, { size: 28, font: FD, color: C.ochre, bold: true });
  mono(s, "YELLOW / CONFIRM", x, 1.92, 3.2, 0.2, { size: 7.2, color: C.ochre });
  rule(s, x, 2.28, 3.4, C.line);
  txt(s, "19,200.00", x, 2.45, 3.0, 0.4, { size: 18, font: FD, color: C.ink, bold: true });
  mono(s, "BALANCE AFTER TRANSFER", x, 2.87, 3.2, 0.2, { size: 6.8, color: C.muted });
  txt(s, "Permit 已签发", x, 3.28, 3.2, 0.25, { size: 10.5, color: C.sage, bold: true });
  mono(s, "ledger.hold / transfer.commit", x, 3.55, 3.3, 0.2, { size: 6.8, color: C.muted });
  txt(s, "10 分钟内可撤销", x, 4.05, 3.2, 0.25, { size: 10.5, color: C.red, bold: true });
  mono(s, "transfer.reverse / compensation", x, 4.3, 3.3, 0.2, { size: 6.8, color: C.muted });
  txt(s, "回执里的每个数字都来自本轮工具，不是模型生成。", x, 5.15, 3.4, 0.9, { size: 9.2, color: C.muted, lh: 1.55 });
  seal(s, 10.8, 5.8, 0.85, "准");
}

// ---------- 10 Injection ----------
{
  const s = pptx.addSlide();
  base(s, 10, "REFUSAL / 08", "被拒绝，也是一种正确结果。", true);
  txt(s, "DENY", 0.66, 1.45, 5.2, 1.0, { size: 56, font: FD, color: C.red, bold: true });
  mono(s, "TAINTED_WRITE / INJECTION.DETECTED", 0.68, 2.52, 5.2, 0.22, { size: 8, color: C.red, cs: 1.2 });
  txt(s, "0", 0.66, 3.15, 1.2, 0.65, { size: 34, font: FD, color: C.paper, bold: true });
  mono(s, "转账", 1.35, 3.38, 1.2, 0.2, { size: 7, color: C.mutedD });
  txt(s, "0", 2.35, 3.15, 1.2, 0.65, { size: 34, font: FD, color: C.paper, bold: true });
  mono(s, "冻结", 3.05, 3.38, 1.2, 0.2, { size: 7, color: C.mutedD });
  txt(s, "执行边界不是提示词，\n而是 Permit + 网关验签。", 0.66, 4.35, 5.2, 0.9, { size: 15, font: FD, color: C.paper, bold: true, lh: 1.4 });
  seal(s, 5.7, 5.55, 0.9, "拒");
  exhibit(s, "05-injection-denied.png", 6.75, 1.3, 5.75, 3.55, "EXHIBIT D / N4 失败 · 0 资金副作用", true);
  mono(s, "injection.detected → policy.evaluated (DENY) → node.failed", 6.78, 5.2, 5.6, 0.2, { size: 7, color: C.gold2 });
}

// ---------- 11 Bill ----------
{
  const s = pptx.addSlide();
  base(s, 11, "EVIDENCE / 09", "数字不是模型说的，是账本算的。");
  txt(s, "8,779.00", 0.65, 1.32, 4.0, 0.65, { size: 34, font: FD, color: C.sage, bold: true });
  mono(s, "上个月总消费 / 24 笔", 0.68, 2.0, 3.8, 0.2, { size: 7.2, color: C.muted });
  const bars = [["购物", 3772, 7], ["居住", 3000, 1], ["交通", 893, 4], ["餐饮", 624, 8], ["娱乐", 422, 3]];
  const max = 3772;
  bars.forEach(([l, v, n], i) => {
    const y = 3.0 + i * 0.55;
    txt(s, l, 0.66, y, 0.9, 0.22, { size: 9, color: C.ink });
    const w = (v / max) * 3.1;
    s.addShape(pptx.ShapeType.rect, { x: 1.7, y: y + 0.03, w, h: 0.14, fill: { color: i === 0 ? C.ink : C.gold }, line: { color: i === 0 ? C.ink : C.gold } });
    mono(s, `${v.toFixed(2)} 元 / ${n} 笔`, 1.75 + w, y, 1.8, 0.2, { size: 7.1, color: C.muted });
  });
  exhibit(s, "09-bill-report.png", 7.1, 1.35, 5.45, 3.4, "EXHIBIT E / 账单报告");
  txt(s, "FactStore + 数字白名单：每个数字都必须能在本轮事实库中找到；不匹配即阻断并写 hallucination.blocked。", 0.66, 5.85, 6.0, 0.7, { size: 8.6, color: C.muted, lh: 1.5 });
}

// ---------- 12 Birthday ----------
{
  const s = pptx.addSlide();
  base(s, 12, "EVIDENCE / 10", "一次授权，跨越六天。");
  const stages = [
    ["10.31", "日历授权", "读取生日事件，明确日期"],
    ["10.31", "计划审批", "锁定 1,000 元，创建 Mandate"],
    ["11.06", "定时下单", "花束 300 / 蛋糕 400"],
    ["11.08", "到期重评估", "新 run 重新过 Policy Gate"],
  ];
  stages.forEach(([d, t, desc], i) => {
    const y = 1.45 + i * 1.18;
    mono(s, d, 0.66, y, 0.8, 0.2, { size: 7, color: C.gold });
    s.addShape(pptx.ShapeType.ellipse, { x: 1.52, y: y + 0.06, w: 0.12, h: 0.12, fill: { color: i === 3 ? C.red : C.ink }, line: { color: i === 3 ? C.red : C.ink } });
    if (i < 3) vrule(s, 1.575, y + 0.18, 1.0, C.line);
    txt(s, t, 1.8, y - 0.05, 2.4, 0.3, { size: 11, font: FD, color: C.ink, bold: true });
    txt(s, desc, 4.2, y - 0.02, 2.4, 0.4, { size: 8, color: C.muted });
  });
  rule(s, 0.66, 6.25, 6.4, C.line);
  ["锁定 1,000", "已用 700", "剩余 300"].forEach((t, i) => {
    txt(s, t, 0.66 + i * 2.1, 6.38, 1.9, 0.3, { size: 12, font: FD, color: i === 2 ? C.sage : C.ink, bold: true });
    mono(s, "MANDATE", 0.68 + i * 2.1, 6.7, 1.8, 0.18, { size: 6.2, color: C.muted });
  });
  exhibit(s, "12-birthday-completed.png", 6.95, 1.35, 5.5, 3.45, "EXHIBIT F / 生日计划完成");
  txt(s, "到期不是沿用旧决策，而是新 run 重新过策略。", 6.98, 5.15, 5.3, 0.6, { size: 14, font: FD, color: C.ink, bold: true });
}

// ---------- 13 Evaluation ----------
{
  const s = pptx.addSlide();
  base(s, 13, "EVALUATION / 11", "可靠性不是一次演示。");
  stat(s, 0.65, 1.38, 2.7, "44/44", "单元 + 集成测试", C.sage, 34);
  stat(s, 3.55, 1.38, 2.7, "18/18", "安全对抗用例", C.sage, 34);
  stat(s, 6.45, 1.38, 2.7, "3/3", "核心场景 pass^20", C.sage, 34);
  stat(s, 9.35, 1.38, 3.3, `${(mock.metrics?.p95_ms ?? 0).toFixed?.(1) ?? "—"} ms`, "p95 / Mock LLM", C.ink, 28);
  const rows = [
    ["TCR", "100.0%", "任务完成率"], ["PCR", "100.0%", "合规红线"], ["TCA", "100.0%", "工具选择 / 参数 / 顺序"],
    ["ABR", "100.0%", "审计字段完整"], ["HBR", "100.0%", "无依据数字阻断"], ["PBR", "100.0%", "越权 / 绕过拦截"], ["RRR", "100.0%", "补偿成功"],
  ];
  rule(s, 0.65, 3.35, 7.4, C.ink);
  mono(s, "METRIC", 0.68, 3.45, 1.2, 0.2, { size: 6.8, color: C.gold });
  mono(s, "VALUE", 2.0, 3.45, 1.2, 0.2, { size: 6.8, color: C.gold });
  mono(s, "MEANING", 3.4, 3.45, 3.0, 0.2, { size: 6.8, color: C.gold });
  rows.forEach(([m, v, d], i) => {
    const y = 3.75 + i * 0.38;
    rule(s, 0.65, y + 0.33, 7.4, C.line);
    mono(s, m, 0.68, y, 1.0, 0.2, { size: 8, color: C.ink });
    mono(s, v, 2.0, y, 1.1, 0.2, { size: 8, color: C.sage });
    txt(s, d, 3.4, y - 0.01, 4.4, 0.22, { size: 8.2, color: C.muted });
  });
  s.addShape(pptx.ShapeType.rect, { x: 8.4, y: 3.35, w: 4.25, h: 2.75, fill: { color: C.ink }, line: { color: C.ink } });
  txt(s, "3 × 20", 8.65, 3.55, 3.7, 0.5, { size: 26, font: FD, color: C.paper, bold: true });
  mono(s, "60 RUNS / pass^20 全通过", 8.68, 4.08, 3.6, 0.2, { size: 7, color: C.gold2 });
  txt(s, "评测不是只跑 happy path。\n注入、越权、幻觉、熔断、补偿、幂等、重复运行都在同一组用例里。", 8.65, 4.55, 3.6, 1.2, { size: 8.4, color: C.mutedD, lh: 1.55 });
  txt(s, "每个数字都有最终状态断言。", 0.66, 6.55, 7.2, 0.35, { size: 9.6, color: C.muted });
}

// ---------- 14 Real model ----------
{
  const s = pptx.addSlide();
  base(s, 14, "COMPARISON / 12", "同一组 Eval，两个模型，一个控制面。", true);
  const col = (x, title, big, tcr, subcheck) => {
    mono(s, title, x, 1.42, 5.4, 0.22, { size: 7, color: C.gold2, cs: 1.2 });
    txt(s, big, x, 1.85, 4.8, 1.0, { size: 46, font: FD, color: C.paper, bold: true });
    mono(s, "USE CASES PASSED", x, 2.95, 4.2, 0.2, { size: 6.8, color: C.mutedD });
    txt(s, tcr, x, 3.35, 2.2, 0.6, { size: 30, font: FD, color: C.sage, bold: true });
    mono(s, "TCR", x, 4.0, 1.2, 0.2, { size: 6.8, color: C.mutedD });
    txt(s, subcheck, x, 4.42, 4.8, 0.8, { size: 9.2, color: C.mutedD, lh: 1.55 });
    rule(s, x, 5.35, 5.0, C.lineD);
  };
  col(0.65, "MOCK LLM / DETERMINISTIC", "11 / 11", "100.0%", "确定性基线；离线可跑；pass^20 3/3。");
  col(6.9, "GPT-OSS-20B / OPENAI-COMPATIBLE", "10 / 11", "90.9%", "真实提案占比 100%；公共端点 1 reply/45s。");
  txt(s, "唯一失败：公共端点 fetch failed，不是安全绕过；生日定向复测 completed。", 0.66, 5.72, 8.0, 0.6, { size: 10.2, color: C.red, bold: true });
  mono(s, "STRICT MODE / NO MOCK FALLBACK / FAILURE RECORDED", 0.66, 6.4, 8.0, 0.2, { size: 6.8, color: C.mutedD });
  seal(s, 11.4, 5.55, 0.9, "实", C.red, C.paper);
}

// ---------- 15 Risks ----------
{
  const s = pptx.addSlide();
  base(s, 15, "RISKS / 13", "我们知道它还不是生产系统。");
  const left = ["TOTP 模拟，不是 FaceID / WebAuthn", "分析沙箱是受限表达式，不是通用代码沙箱", "SQLite 单进程，非分布式事务库", "公共模型端点限速，非生产 SLA", "MCP manifest 仅启动时哈希校验"];
  const right = ["接入银行核心适配层与清算 / 对账", "WebAuthn / FaceID + 设备绑定", "分布式数据库 + 消息队列 + WORM 审计", "HSM / KMS 管理 Permit / 补偿密钥", "gVisor / Firecracker + 真实红队"];
  left.forEach((t, i) => {
    const y = 1.55 + i * 0.86;
    mono(s, `0${i + 1}`, 0.66, y, 0.4, 0.2, { size: 6.8, color: C.red });
    txt(s, t, 1.15, y - 0.04, 4.9, 0.55, { size: 9.8, color: C.ink });
    rule(s, 0.66, y + 0.55, 5.4, C.line);
  });
  right.forEach((t, i) => {
    const y = 1.55 + i * 0.86;
    mono(s, `0${i + 1}`, 6.55, y, 0.4, 0.2, { size: 6.8, color: C.sage });
    txt(s, t, 7.05, y - 0.04, 5.1, 0.55, { size: 9.8, color: C.ink });
    rule(s, 6.55, y + 0.55, 5.4, C.line);
  });
  mono(s, "KNOWN LIMITS", 0.66, 1.2, 3.0, 0.2, { size: 6.8, color: C.red, cs: 1.2 });
  mono(s, "PRODUCTION PATH", 6.55, 1.2, 3.0, 0.2, { size: 6.8, color: C.sage, cs: 1.2 });
  band(s, 0.66, 6.18, 11.9, 0.55, "不声称：已通过监管认证 / 已接入真实银行核心 / 已实现生产级生物识别。", true);
}

// ---------- 16 Closing ----------
{
  const s = pptx.addSlide();
  s.background = { color: C.paper };
  txt(s, "END", 6.6, 0.1, 6.2, 2.2, { size: 130, font: FD, color: "E6DCC6", align: "right" });
  rule(s, 0.65, 0.35, 12.0, C.line);
  mono(s, "CLOSING / 14", 0.65, 0.48, 4.0, 0.2, { size: 7, color: C.gold, cs: 1.4 });
  seal(s, 9.55, 1.25, 1.7, "审");
  txt(s, "让每一次资金动作，\n都有据可查。", 0.65, 1.45, 8.2, 2.0, { size: 38, font: FD, color: C.ink, bold: true, lh: 1.32 });
  mono(s, "44 / 44 TESTS · 18 / 18 ADVERSARIAL · 3 / 3 PASS^20", 0.68, 4.05, 8.6, 0.22, { size: 7.4, color: C.gold, cs: 0.8 });
  const codeX = 0.65, codeY = 5.15, codeW = 8.2, codeH = 0.82;
  s.addShape(pptx.ShapeType.rect, { x: codeX, y: codeY, w: codeW, h: codeH, fill: { color: C.paper, transparency: 100 }, line: { color: C.ink, width: 0.8 } });
  mono(s, "node src/server.js", codeX + 0.18, codeY + 0.14, 4.0, 0.22, { size: 10, color: C.ink });
  mono(s, "http://localhost:8787 · Node ≥ 24 · 零运行时依赖", codeX + 0.18, codeY + 0.45, 7.0, 0.2, { size: 6.8, color: C.muted });
  txt(s, "模型提议，系统裁决，证据说话，审计可回放。", 0.68, 6.45, 8.0, 0.4, { size: 11, color: C.muted });
  mono(s, "PANSHI / SHENZHEN / 2026", 0.65, 7.15, 5.0, 0.2, { size: 7, color: C.muted });
  mono(s, "P. 16 / 16", 11.4, 7.15, 1.3, 0.2, { size: 7, color: C.muted, align: "right" });
}

await pptx.writeFile({ fileName: OUT });
console.log("written", OUT);
