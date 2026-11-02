import fs from "node:fs";
import path from "node:path";
import pptxgen from "pptxgenjs";

const ROOT = path.resolve("..");
const SHOTS = path.join(ROOT, "deliverables", "screenshots");
const OUT = path.join(ROOT, "deliverables", "PANSHI-答辩.pptx");
const C = {
  bg: "070A08", panel: "111814", line: "2A352E", text: "F2EEE4", muted: "98A29A",
  blue: "C9A86A", blue2: "A8874E", green: "5FCF9F", yellow: "E0B15C", red: "D97A6C", purple: "B9A7D9",
  gold: "C9A86A", goldBright: "E6CF9F", panel2: "161F1A", deep: "0D1410",
};
const FONT = "Microsoft YaHei";
const FONT_DISPLAY = "SimSun";

function readJson(p, fallback = null) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; }
}
function pct(n) { return `${(Number(n) * 100).toFixed(1)}%`; }
function shot(name) { return path.join(SHOTS, name); }

const mock = readJson(path.join(ROOT, "eval", "report-mock.json")) || readJson(path.join(ROOT, "eval", "report.json")) || {};
const real = readJson(path.join(ROOT, "eval", "report-real.json"));
const audit = readJson(path.join(ROOT, "deliverables", "audit-sample.json")) || { trace_id: "—", picked: [] };

const pptx = new pptxgen();
pptx.defineLayout({ name: "PANSHI_16X9", width: 13.333, height: 7.5 });
pptx.layout = "PANSHI_16X9";
pptx.author = "磐石团队";
pptx.subject = "银行 AI Banking Agent 竞赛答辩";
pptx.title = "磐石银行智能体";
pptx.company = "PANSHI";
pptx.lang = "zh-CN";
pptx.theme = { headFontFace: FONT, bodyFontFace: FONT, lang: "zh-CN" };

function base(slide, no, kicker, title) {
  slide.background = { color: C.bg };
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.06, fill: { color: C.gold }, line: { color: C.gold } });
  slide.addText(kicker, { x: 0.55, y: 0.25, w: 5, h: 0.3, fontSize: 9, color: C.gold, bold: true, charSpacing: 2.4, fontFace: FONT });
  slide.addText(title, { x: 0.55, y: 0.52, w: 12.2, h: 0.62, fontSize: 23, color: C.text, bold: true, charSpacing: 0.6, fontFace: FONT_DISPLAY });
  slide.addShape(pptx.ShapeType.rect, { x: 0.55, y: 1.18, w: 1.1, h: 0.018, fill: { color: C.gold }, line: { color: C.gold, transparency: 100 } });
  slide.addText(`PANSHI · 银行 AI 智能体 · ${String(no).padStart(2, "0")}`, {
    x: 0.55, y: 7.12, w: 8, h: 0.22, fontSize: 8.5, color: C.muted, charSpacing: 0.8, fontFace: FONT,
  });
  slide.addText("模型提议 · 系统裁决 · 证据说话 · 审计可回放", {
    x: 8.4, y: 7.12, w: 4.4, h: 0.22, fontSize: 8.5, color: C.muted, align: "right", fontFace: FONT,
  });
}
function box(slide, x, y, w, h, fill = C.panel, line = C.line) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h, rectRadius: 0.08, fill: { color: fill }, line: { color: line, width: 1 },
  });
}
function text(slide, s, x, y, w, h, opts = {}) {
  slide.addText(s, {
    x, y, w, h, fontSize: opts.size || 12, color: opts.color || C.text,
    bold: opts.bold || false, align: opts.align || "left", valign: opts.valign || "top",
    fontFace: FONT, margin: opts.margin ?? 0.04, lineSpacingMultiple: opts.ls || 1.05, ...opts.extra,
  });
}
function tag(slide, s, x, y, w, color) {
  slide.addShape(pptx.ShapeType.roundRect, { x, y, w, h: 0.28, rectRadius: 0.14, fill: { color: "161F1A" }, line: { color, width: 1 } });
  slide.addText(s, { x, y, w, h: 0.28, fontSize: 9, color, bold: true, align: "center", valign: "middle", fontFace: FONT, margin: 0 });
}
function stat(slide, x, y, w, n, label, color = C.blue) {
  box(slide, x, y, w, 0.92);
  slide.addText(n, { x: x + 0.12, y: y + 0.08, w: w - 0.24, h: 0.45, fontSize: 24, bold: true, color, fontFace: FONT_DISPLAY, margin: 0 });
  slide.addText(label, { x: x + 0.12, y: y + 0.56, w: w - 0.24, h: 0.24, fontSize: 9, color: C.muted, fontFace: FONT, margin: 0 });
}
function pngSize(file) {
  const b = fs.readFileSync(file);
  if (b.length >= 24 && b.toString("ascii", 1, 4) === "PNG") {
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  }
  return null;
}
function imageCard(slide, file, x, y, w, h, caption = "") {
  if (!fs.existsSync(file)) {
    box(slide, x, y, w, h);
    text(slide, `缺少截图：${path.basename(file)}`, x + 0.2, y + h / 2 - 0.15, w - 0.4, 0.3, { color: C.muted, align: "center" });
    return;
  }
  const dims = pngSize(file);
  let ix = x, iy = y, iw = w, ih = h;
  if (dims) {
    const k = Math.min(w / dims.w, h / dims.h);
    iw = dims.w * k;
    ih = dims.h * k;
    ix = x + (w - iw) / 2;
    iy = y + (h - ih) / 2;
  }
  slide.addImage({ path: file, x: ix, y: iy, w: iw, h: ih });
  slide.addShape(pptx.ShapeType.rect, { x, y, w, h, fill: { color: C.bg, transparency: 100 }, line: { color: C.line, width: 1 } });
  if (caption) text(slide, caption, x, y + h + 0.04, w, 0.2, { size: 8.5, color: C.muted });
}

// 01 封面
{
  const s = pptx.addSlide();
  s.background = { color: C.bg };
  s.addShape(pptx.ShapeType.ellipse, { x: 9.4, y: -1.4, w: 5.4, h: 5.4, fill: { color: C.gold, transparency: 93 }, line: { color: C.gold, transparency: 100 } });
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.12, h: 7.5, fill: { color: C.blue }, line: { color: C.blue } });
  s.addShape(pptx.ShapeType.rect, { x: 0.6, y: 0.55, w: 1.0, h: 1.0, fill: { color: "2A2113" }, line: { color: C.blue, width: 2 } });
  s.addText("磐", { x: 0.6, y: 0.62, w: 1.0, h: 0.86, fontSize: 36, bold: true, color: "E6CF9F", align: "center", valign: "middle", fontFace: FONT_DISPLAY, margin: 0 });
  s.addText("磐石银行智能体", { x: 1.9, y: 0.55, w: 8, h: 0.8, fontSize: 38, bold: true, color: C.text, charSpacing: 1, fontFace: FONT_DISPLAY, margin: 0 });
  s.addText("PANSHI BANKING AGENT", { x: 1.95, y: 1.32, w: 8, h: 0.3, fontSize: 11, color: C.blue, charSpacing: 4.5, fontFace: FONT, margin: 0 });
  s.addShape(pptx.ShapeType.rect, { x: 0.65, y: 2.38, w: 1.2, h: 0.018, fill: { color: C.gold }, line: { color: C.gold, transparency: 100 } });
  s.addText("模型提议 · 系统裁决 · 证据说话 · 审计可回放", { x: 0.65, y: 2.55, w: 11.5, h: 0.5, fontSize: 25, color: C.text, charSpacing: 0.6, fontFace: FONT_DISPLAY, margin: 0 });
  s.addText("面向金融竞赛的银行 AI Banking Agent：三条端到端场景、独立 Policy Gate、签名执行许可、哈希链审计、DAG 中断/补偿/人工接管。", {
    x: 0.65, y: 3.15, w: 9.6, h: 0.7, fontSize: 12.5, color: C.muted, fontFace: FONT, margin: 0, lineSpacingMultiple: 1.15,
  });
  stat(s, 0.65, 4.45, 3.0, "44 / 44", "单元 + 集成测试", C.green);
  stat(s, 3.85, 4.45, 3.0, "18 / 18", "安全对抗用例", C.green);
  stat(s, 7.05, 4.45, 3.0, "3 / 3", "核心场景 pass^20", C.green);
  stat(s, 10.25, 4.45, 2.5, "100%", "评测红线指标", C.blue);
  s.addText("深圳金融竞赛 · 人工智能赛道 · 银行 AI 智能体", { x: 0.65, y: 6.25, w: 8, h: 0.3, fontSize: 10, color: C.muted, fontFace: FONT, margin: 0 });
  s.addText("演示环境为沙箱模拟，不涉及真实资金", { x: 0.65, y: 6.55, w: 8, h: 0.3, fontSize: 9, color: C.muted, fontFace: FONT, margin: 0 });
  s.addNotes("开场：我们不是会聊天的 Demo，而是权限可证明、审计可回放的银行智能体。三条链路、18 条对抗、pass^20。");
}

// 02 评分映射
{
  const s = pptx.addSlide();
  base(s, 2, "SCORING MAP", "40 / 30 / 30：每一分都有可验证交付");
  const rows = [
    ["40% 任务完成率", "3 条端到端场景；数据库最终状态断言；工具序列/参数断言；3 场景 pass^20", "TCR 100% · pass^20 3/3"],
    ["30% 安全合规性", "独立 Policy Gate + 签名 Permit + Taint + 18 条对抗 + 哈希链审计 + 熔断/接管", "18/18 · PCR/PBR 100%"],
    ["30% 创新性及交互体验", "约束内自主、审批信封、交易挑战、Mandate、证据锚定回执、实时 DAG、撤销/补偿", "DAG · 信封 · 证据 · 可撤销"],
  ];
  s.addTable(
    [
      [{ text: "评分项", options: { bold: true, color: C.blue } }, { text: "我们交付的证据", options: { bold: true, color: C.blue } }, { text: "实测", options: { bold: true, color: C.blue } }],
      ...rows.map((r) => [
        { text: r[0], options: { bold: true, color: C.text } },
        { text: r[1], options: { color: C.muted } },
        { text: r[2], options: { color: C.green } },
      ]),
    ],
    {
      x: 0.55, y: 1.5, w: 12.2, colW: [2.5, 6.8, 2.9], rowH: 0.95,
      border: { type: "solid", color: C.line, pt: 0.5 }, fill: { color: C.panel },
      fontFace: FONT, fontSize: 11, valign: "middle", margin: 0.08,
    },
  );
  box(s, 0.55, 5.35, 12.2, 1.15);
  text(s, "判断：不堆六个半成品。三条链路 20/20 稳定跑通 + 安全可被对抗证明 + 审计可回放，比功能数量更能拿分。", 0.75, 5.5, 11.8, 0.8, { size: 12, color: C.text });
  s.addNotes("评委看的是完成率、安全、交互三个维度。我们把每一页都映射到评分项，不做与评分无关的功能。");
}

// 03 三平面架构
{
  const s = pptx.addSlide();
  base(s, 3, "ARCHITECTURE", "控制面 / 执行面 / 数据面：模型只提案，系统裁决");
  const bx = (x, y, w, h, t, color = C.blue) => {
    box(s, x, y, w, h, "0D1410", color);
    text(s, t, x + 0.08, y + 0.08, w - 0.16, h - 0.16, { size: 9.5, color: C.text, align: "center", valign: "middle", bold: true });
  };
  text(s, "控制面", 0.55, 1.35, 1.3, 0.3, { size: 10, color: C.blue, bold: true });
  bx(0.55, 1.7, 1.9, 0.65, "Intent Gateway\n输入规范化/注入检测");
  bx(2.55, 1.7, 1.9, 0.65, "Orchestrator\n路由/状态机/审批");
  bx(4.55, 1.7, 1.9, 0.65, "Policy Gate\nGREEN/YELLOW/RED");
  bx(6.55, 1.7, 1.9, 0.65, "Approval + Permit\n信封/TOTP/能力令牌");
  bx(8.55, 1.7, 1.9, 0.65, "Breaker / Kill Switch\n熔断/只读降级", C.yellow);
  bx(10.55, 1.7, 2.2, 0.65, "LLM Adapter\nMock / OpenAI-compatible", C.purple);
  text(s, "执行面", 0.55, 2.75, 1.3, 0.3, { size: 10, color: C.green, bold: true });
  bx(0.55, 3.1, 1.9, 0.75, "DAG Engine\nexecute/rollback/interrupt", C.green);
  bx(2.55, 3.1, 1.9, 0.75, "Tool Gateway\nallowlist/验签/幂等", C.green);
  bx(4.55, 3.1, 1.9, 0.75, "24 受控工具\n账户/账单/订单/日历", C.green);
  bx(6.55, 3.1, 1.9, 0.75, "分析沙箱\n受限表达式/无 I/O", C.green);
  bx(8.55, 3.1, 1.9, 0.75, "银行核心模拟\n账务/冻结/订单", C.green);
  bx(10.55, 3.1, 2.2, 0.75, "Scheduler\n到期重评估", C.green);
  text(s, "数据面", 0.55, 4.2, 1.3, 0.3, { size: 10, color: C.purple, bold: true });
  bx(0.55, 4.55, 2.9, 0.7, "SQLite WAL\n运行/账务/冻结", C.purple);
  bx(3.55, 4.55, 2.9, 0.7, "审计哈希链\nappend-only + Merkle", C.purple);
  bx(6.55, 4.55, 2.9, 0.7, "FactStore\n数字证据锚定", C.purple);
  bx(9.55, 4.55, 3.2, 0.7, "策略版本 / Manifest 哈希\nSHA-256 锁定", C.purple);
  box(s, 0.55, 5.65, 12.2, 0.85, "161F1A", C.blue);
  text(s, "核心不变量：LLM 不直接执行；没有签名 Permit，Tool Gateway 拒绝写操作；工具返回默认不可信；每个数字必须有 FactStore 证据。", 0.75, 5.78, 11.8, 0.6, { size: 11, color: C.text });
  s.addNotes("控制面负责意图、裁决、审批、熔断；执行面负责 DAG 与工具；数据面负责状态、证据、审计。模型只出现在控制面，且只提案。");
}

// 04 生命周期
{
  const s = pptx.addSlide();
  base(s, 4, "LIFECYCLE", "一次请求：Proposal → Policy → Permit → Gateway → Audit");
  const steps = [
    ["1", "输入 Hook", "NFKC / 零宽 / 注入检测"],
    ["2", "LLM 提案", "Intent / DAG / ToolCall"],
    ["3", "DAG 执行", "固定拓扑 + checkpoint"],
    ["4", "Policy Gate", "确定性裁决 + reason_codes"],
    ["5", "审批/强验证", "信封 + TOTP 交易挑战"],
    ["6", "Permit + Gateway", "验签/验参/nonce/幂等"],
    ["7", "证据回执 + 审计", "FactStore + 哈希链"],
  ];
  steps.forEach(([n, t, d], i) => {
    const x = 0.55 + i * 1.78;
    s.addShape(pptx.ShapeType.roundRect, { x, y: 1.65, w: 1.55, h: 1.55, rectRadius: 0.08, fill: { color: C.panel }, line: { color: C.blue, width: 1 } });
    s.addText(n, { x: x + 0.08, y: 1.72, w: 0.4, h: 0.3, fontSize: 12, color: C.blue, bold: true, fontFace: FONT, margin: 0 });
    s.addText(t, { x: x + 0.08, y: 2.02, w: 1.4, h: 0.36, fontSize: 10.5, color: C.text, bold: true, fontFace: FONT, margin: 0 });
    s.addText(d, { x: x + 0.08, y: 2.4, w: 1.4, h: 0.65, fontSize: 8.5, color: C.muted, fontFace: FONT, margin: 0, lineSpacingMultiple: 1.0 });
    if (i < 6) s.addText("→", { x: x + 1.55, y: 2.15, w: 0.23, h: 0.3, fontSize: 12, color: C.blue, align: "center", fontFace: FONT, margin: 0 });
  });
  box(s, 0.55, 3.55, 5.85, 2.0, "161F1A", C.red);
  text(s, "DENY 分支", 0.75, 3.68, 2, 0.3, { size: 11, color: C.red, bold: true });
  text(s, "黑名单 / 冻结账户 / Taint / 熔断 / 超硬上限 / 未知动作 → 确定性拒绝；写 policy.evaluated；连续拒绝计入熔断。", 0.75, 4.05, 5.4, 1.2, { size: 10.5, color: C.text, lineSpacingMultiple: 1.15 });
  box(s, 6.75, 3.55, 6.0, 2.0, "161F1A", C.green);
  text(s, "ALLOW 也不等于“模型说了算”", 6.95, 3.68, 5.4, 0.3, { size: 11, color: C.green, bold: true });
  text(s, "即使 Policy Gate 允许，Tool Gateway 仍要验 Permit 签名、参数哈希、subject、nonce、过期与幂等；任何一项不匹配即拒绝。", 6.95, 4.05, 5.5, 1.2, { size: 10.5, color: C.text, lineSpacingMultiple: 1.15 });
  s.addNotes("模型只做提案。执行边界是 Permit 和 Tool Gateway。Prompt 写“不要转账”不够，代码规则才是边界。");
}

// 05 权限分级
{
  const s = pptx.addSlide();
  base(s, 5, "PERMISSION", "GREEN / YELLOW / RED：赛题三级是硬规则，只加强不降级");
  const rows = [
    ["GREEN", "自动执行", "余额/流水/账单/理财收益查询", "ALLOW · 0 确认", C.green],
    ["YELLOW", "用户确认", "日累计 ≤1000 元、订阅取消、虚拟卡、冻结/定时", "CONFIRM · 信封 5 分钟", C.yellow],
    ["RED", "强验证", "日累计 >1000 元、改密、挂失/解挂、理财申购", "TOTP 交易挑战 · 3 分钟", C.red],
  ];
  rows.forEach((r, i) => {
    const y = 1.55 + i * 1.25;
    box(s, 0.55, y, 12.2, 1.05, "0D1410", r[4]);
    text(s, r[0], 0.75, y + 0.12, 1.45, 0.32, { size: 15, color: r[4], bold: true });
    text(s, r[1], 2.25, y + 0.12, 1.1, 0.32, { size: 11, color: C.text, bold: true });
    text(s, r[2], 2.25, y + 0.5, 6.3, 0.4, { size: 9.5, color: C.muted });
    text(s, r[3], 8.75, y + 0.3, 3.7, 0.4, { size: 10, color: r[4], bold: true, align: "right" });
  });
  box(s, 0.55, 5.4, 7.4, 1.25, "161F1A", C.blue);
  text(s, "日累计 = 已提交 + 冻结 + 在途；BEGIN IMMEDIATE 原子预占", 0.75, 5.55, 6.9, 0.32, { size: 10.5, color: C.blue, bold: true });
  text(s, "两笔 800 元：第一笔 YELLOW；第二笔投影 1600 → RED。不会出现两笔都按 YELLOW 通过。", 0.75, 5.92, 6.9, 0.55, { size: 10, color: C.text });
  box(s, 8.15, 5.4, 4.6, 1.25, "161F1A", C.yellow);
  text(s, "赛题 RED 动作不降级", 8.35, 5.55, 4.2, 0.32, { size: 10.5, color: C.yellow, bold: true });
  text(s, "卡片挂失/解挂即使可逆，也按 RED；可逆性只用于补偿策略，不用于降低权限。", 8.35, 5.92, 4.2, 0.55, { size: 9.5, color: C.text });
  s.addNotes("三级是赛题硬规则。我们只在内部增加可逆性/双人标签，作为补偿与四眼的附加控制，不降低 RED。");
}

// 06 Policy Gate + Permit
{
  const s = pptx.addSlide();
  base(s, 6, "POLICY + PERMIT", "Policy Gate 独立于模型，Permit 绑定参数与审批");
  const items = [
    "LLM 输出 ToolCallProposal，不执行",
    "Policy Gate 读取结构化事实：金额/日累计/收款人/账户/taint/熔断",
    "输出 tier/decision/required_auth/reason_codes",
    "审批信封展示金额/收款人/可逆性/补偿/过期",
    "Permit = HMAC(subject,tool,params_hash,max_amount,expires,nonce)",
  ];
  items.forEach((t, i) => {
    const y = 1.5 + i * 0.72;
    s.addShape(pptx.ShapeType.ellipse, { x: 0.6, y: y + 0.08, w: 0.24, h: 0.24, fill: { color: C.blue }, line: { color: C.blue } });
    text(s, t, 0.98, y, 5.2, 0.5, { size: 10.5, color: C.text });
  });
  imageCard(s, shot("03-transfer-envelope.png"), 6.35, 1.35, 6.35, 4.35, "真实审批信封：金额/账户/收款人/可逆性/补偿/过期");
  box(s, 0.55, 5.55, 5.6, 1.1, "161F1A", C.green);
  text(s, "审批后改金额/收款人 → params_hash 不匹配 → Gateway 拒绝", 0.75, 5.68, 5.2, 0.5, { size: 10.5, color: C.green, bold: true });
  text(s, "Permit 单次使用；nonce 重放直接拒绝；金额不得超过 max_amount。", 0.75, 6.0, 5.2, 0.4, { size: 9.5, color: C.text });
  s.addNotes("模型不能同时是申请人、审批人和执行人。Policy Gate 是确定性规则；Permit 是能力令牌，Gateway 验签后才执行。");
}

// 07 审计
{
  const s = pptx.addSlide();
  base(s, 7, "AUDIT", "append-only 哈希链：每条决策可回放");
  box(s, 0.55, 1.4, 5.6, 3.0, "0D1410", C.purple);
  text(s, "hash = SHA256(canonical({", 0.75, 1.55, 5.2, 0.3, { size: 9.5, color: C.purple, bold: true });
  text(s, "seq, event_id, trace_id, run_id, step_id, node_id,", 0.95, 1.85, 5.0, 0.3, { size: 9, color: C.muted });
  text(s, "event_type, ts, payload_json, prev_hash }))", 0.95, 2.15, 5.0, 0.3, { size: 9, color: C.muted });
  text(s, "存储：JSONL + SQLite trigger 禁 UPDATE/DELETE", 0.75, 2.55, 5.2, 0.3, { size: 9.5, color: C.text });
  text(s, "锚定：每 100 条 Merkle root；verify 重算链与锚点", 0.75, 2.85, 5.2, 0.3, { size: 9.5, color: C.text });
  text(s, "回放：trace_id → 意图/策略/审批/工具/补偿/回执", 0.75, 3.15, 5.2, 0.3, { size: 9.5, color: C.text });
  text(s, "字段：intent_raw_masked / confidence / dag_node /", 0.75, 3.55, 5.2, 0.3, { size: 9, color: C.muted });
  text(s, "policy_decision / reason_codes / params_hash /", 0.95, 3.82, 5.0, 0.3, { size: 9, color: C.muted });
  text(s, "permit_id / idempotency / approver / prev_hash / hash", 0.95, 4.09, 5.0, 0.3, { size: 9, color: C.muted });
  imageCard(s, shot("14b-audit-verified.png"), 6.35, 1.35, 6.35, 4.0, "真实截图：校验通过 · 171 条 · 1 锚点");
  const ev = audit.picked?.find((e) => e.event_type === "policy.evaluated");
  box(s, 0.55, 4.75, 12.2, 1.75, "0D1410", C.line);
  text(s, "真实审计样例", 0.75, 4.85, 2.5, 0.3, { size: 10, color: C.blue, bold: true });
  const sample = ev ? [
    `trace_id  ${audit.trace_id}`,
    `#${ev.seq} policy.evaluated  ·  ${ev.payload.tier}/${ev.payload.decision}  ·  ${ev.payload.reason_codes?.join(", ")}`,
    `required_auth=${ev.payload.required_auth}  ·  projected=${ev.payload.facts?.projected_daily_cents} 分  ·  policy=${ev.payload.policy_version}`,
    `hash=${ev.hash?.slice(0, 24)}…  prev=${ev.prev_hash?.slice(0, 24)}…`,
  ].join("\n") : "（审计样例待生成）";
  text(s, sample, 0.75, 5.15, 11.8, 1.2, { size: 8.5, color: C.text, lineSpacingMultiple: 1.15 });
  s.addNotes("审计不是普通日志：append-only、哈希链、Merkle 锚点、trace 回放。评委可以按 trace 看到谁、基于什么、谁批准、改了什么。");
}

// 08 DAG + 回退
{
  const s = pptx.addSlide();
  base(s, 8, "DAG + ROLLBACK", "固定主链路 + 节点级 execute/rollback/on_interrupt");
  const rows = [
    ["N0", "绑定会话", "—", "结束会话"],
    ["N1", "LLM 解析", "只读", "低置信 → 澄清"],
    ["N2", "收款人", "GREEN", "多候选 → 选择"],
    ["N3", "风险事实", "—", "风险变化 → 重评估"],
    ["N4", "Policy Gate", "裁决", "熔断 → DENY"],
    ["N5", "审批/强验证", "YELLOW/RED", "超时/拒绝 → 终止"],
    ["N6", "冻结/定时", "Permit", "释放冻结/取消任务"],
    ["N7", "提交转账", "Permit", "冲正/人工对账"],
    ["N8", "证据回执", "输出校验", "安全模板"],
    ["N9", "审计锚定", "审计", "标记未完成"],
  ];
  s.addTable(
    [
      [{ text: "节点", options: { bold: true, color: C.blue } }, { text: "职责", options: { bold: true, color: C.blue } }, { text: "权限门", options: { bold: true, color: C.blue } }, { text: "回退/中断", options: { bold: true, color: C.blue } }],
      ...rows.map((r) => r.map((v, i) => ({ text: v, options: { color: i === 0 ? C.blue : C.text, bold: i === 0 } }))),
    ],
    {
      x: 0.55, y: 1.45, w: 6.0, colW: [0.7, 2.0, 1.4, 1.9], rowH: 0.43,
      border: { type: "solid", color: C.line, pt: 0.4 }, fill: { color: C.panel },
      fontFace: FONT, fontSize: 8.5, valign: "middle", margin: 0.04,
    },
  );
  imageCard(s, shot("16-dag.png"), 6.8, 1.35, 5.9, 3.3, "真实 DAG：10 节点全部可见");
  box(s, 6.8, 5.0, 5.9, 1.5, "161F1A", C.green);
  text(s, "副作用只在 Tool Gateway 发生", 7.0, 5.12, 5.5, 0.3, { size: 10.5, color: C.green, bold: true });
  text(s, "每个写操作返回签名补偿令牌；失败/取消逆序补偿；不可逆动作进入人工对账，不假装回退。转账提交后，冻结释放补偿标记 superseded，撤销走 transfer.reverse。", 7.0, 5.45, 5.5, 0.9, { size: 9, color: C.text, lineSpacingMultiple: 1.1 });
  s.addNotes("DAG 是固定主链路，LLM 只在节点内做局部判断。节点有 execute/rollback/on_interrupt；补偿是真实的账务/订单动作。");
}

// 09 转账
{
  const s = pptx.addSlide();
  base(s, 9, "SCENARIO 1", "智能转账：800 元 YELLOW → 冻结 → 提交 → 回执");
  imageCard(s, shot("04-transfer-completed.png"), 0.55, 1.35, 8.4, 5.4, "真实运行：DAG 完成 · 策略卡 · 审计链 · 撤销按钮");
  box(s, 9.2, 1.4, 3.55, 1.0);
  text(s, "800.00 元", 9.38, 1.5, 3.2, 0.4, { size: 20, color: C.yellow, bold: true });
  text(s, "YELLOW / CONFIRM", 9.38, 1.95, 3.2, 0.3, { size: 9.5, color: C.yellow });
  box(s, 9.2, 2.6, 3.55, 1.0);
  text(s, "Permit 已签发", 9.38, 2.7, 3.2, 0.3, { size: 12, color: C.green, bold: true });
  text(s, "ledger.hold / transfer.commit", 9.38, 3.05, 3.2, 0.3, { size: 8.5, color: C.muted });
  box(s, 9.2, 3.8, 3.55, 1.0);
  text(s, "余额 19200.00", 9.38, 3.9, 3.2, 0.3, { size: 12, color: C.text, bold: true });
  text(s, "每个数字有 fact_id", 9.38, 4.25, 3.2, 0.3, { size: 8.5, color: C.muted });
  box(s, 9.2, 5.0, 3.55, 1.0, "161F1A", C.blue);
  text(s, "撤销/冲正", 9.38, 5.1, 3.2, 0.3, { size: 11, color: C.blue, bold: true });
  text(s, "10 分钟内 transfer.reverse；余额恢复；审计 compensation.succeeded", 9.38, 5.42, 3.2, 0.5, { size: 8.5, color: C.text });
  s.addNotes("800 元是黄色：系统给完整信封，确认后才签发 Permit。回执数字来自本轮工具，不是模型编的。撤销是真实冲正。");
}

// 10 注入拦截
{
  const s = pptx.addSlide();
  base(s, 10, "SECURITY PROOF", "注入绕过被 Policy Gate 拒绝：0 冻结、0 转账");
  imageCard(s, shot("05-injection-denied.png"), 0.55, 1.35, 8.4, 5.4, "真实运行：N4 失败 · DENY/TAINTED_WRITE · injection.detected");
  box(s, 9.2, 1.4, 3.55, 0.95, "161F1A", C.red);
  text(s, "DENY", 9.38, 1.5, 3.2, 0.4, { size: 22, color: C.red, bold: true });
  text(s, "TAINTED_WRITE", 9.38, 1.95, 3.2, 0.3, { size: 9.5, color: C.red });
  box(s, 9.2, 2.55, 3.55, 0.95);
  text(s, "0 转账", 9.38, 2.65, 3.2, 0.4, { size: 20, color: C.green, bold: true });
  text(s, "0 冻结", 9.38, 3.05, 3.2, 0.3, { size: 9.5, color: C.muted });
  box(s, 9.2, 3.7, 3.55, 1.1);
  text(s, "审计证据", 9.38, 3.8, 3.2, 0.3, { size: 10.5, color: C.blue, bold: true });
  text(s, "injection.detected (high) → policy.evaluated (DENY) → node.failed", 9.38, 4.12, 3.2, 0.6, { size: 8.5, color: C.text });
  box(s, 9.2, 5.0, 3.55, 1.0, "161F1A", C.yellow);
  text(s, "Prompt 不是边界", 9.38, 5.1, 3.2, 0.3, { size: 10.5, color: C.yellow, bold: true });
  text(s, "执行边界是 Permit + 网关验签 + taint + allowlist。代码规则，不靠叮嘱。", 9.38, 5.42, 3.2, 0.5, { size: 8.5, color: C.text });
  s.addNotes("这是视频里必须保留的失败拦截。模型被“忽略规则”骗不到；Policy Gate 直接拒绝，资金没有动。");
}

// 11 账单
{
  const s = pptx.addSlide();
  base(s, 11, "SCENARIO 2", "账单分析：GREEN 自动执行，数字全部有证据");
  imageCard(s, shot("09-bill-report.png"), 0.55, 1.35, 8.4, 5.4, "真实运行：GREEN/ALLOW · 8779.00 元 / 24 笔 · 分类明细");
  box(s, 9.2, 1.4, 3.55, 1.0);
  text(s, "8779.00 元", 9.38, 1.5, 3.2, 0.4, { size: 18, color: C.green, bold: true });
  text(s, "上个月总消费", 9.38, 1.95, 3.2, 0.3, { size: 9, color: C.muted });
  box(s, 9.2, 2.6, 3.55, 1.0);
  text(s, "24 笔", 9.38, 2.7, 3.2, 0.4, { size: 18, color: C.text, bold: true });
  text(s, "购物 3772.00 元最多", 9.38, 3.15, 3.2, 0.3, { size: 9, color: C.muted });
  box(s, 9.2, 3.8, 3.55, 1.0);
  text(s, "1 条异常", 9.38, 3.9, 3.2, 0.4, { size: 18, color: C.yellow, bold: true });
  text(s, "凌晨大额 + 商户信息不完整", 9.38, 4.35, 3.2, 0.3, { size: 8.5, color: C.muted });
  box(s, 9.2, 5.0, 3.55, 1.0, "161F1A", C.blue);
  text(s, "FactStore + 数字白名单", 9.38, 5.1, 3.2, 0.3, { size: 10.5, color: C.blue, bold: true });
  text(s, "回复后提取每个数字/日期，逐一匹配事实；不匹配即阻断并写 hallucination.blocked。", 9.38, 5.42, 3.2, 0.5, { size: 8.5, color: C.text });
  s.addNotes("纯查询绿色通道，零确认。但数字必须能在 FactStore 找到；异常识别是确定性规则，不是模型猜的。");
}

// 12 生日
{
  const s = pptx.addSlide();
  base(s, 12, "SCENARIO 3", "生日跨场景：多步 DAG + Mandate + 定时 + 补偿");
  imageCard(s, shot("12-birthday-completed.png"), 0.55, 1.35, 7.0, 4.5, "真实运行：授权→计划审批→冻结→定时下单");
  imageCard(s, shot("11-birthday-plan.png"), 7.75, 1.35, 5.0, 2.9, "计划审批信封");
  box(s, 7.75, 4.55, 5.0, 1.6, "161F1A", C.green);
  text(s, "到期不是沿用旧决策", 7.95, 4.66, 4.6, 0.3, { size: 11, color: C.green, bold: true });
  text(s, "Scheduler 创建 order_commit run；重新过 Policy Gate，匹配 Mandate 额度/商户类别/时间窗；扣款走冻结部分捕获。", 7.95, 4.98, 4.6, 0.75, { size: 9.2, color: C.text, lineSpacingMultiple: 1.08 });
  text(s, "撤销：取消订单/退款 + 释放冻结 + 撤销 Mandate", 7.95, 5.72, 4.6, 0.35, { size: 9.2, color: C.blue, bold: true });
  s.addNotes("生日场景展示多步 DAG、条件分支、定时、Mandate、到期重评估与副作用回收。三条链路共享同一控制面。");
}

// 13 评测
{
  const s = pptx.addSlide();
  base(s, 13, "EVALUATION", "44/44 · 18/18 · pass^20 3/3：可靠性不是一次演示");
  const m = mock.metrics || {};
  stat(s, 0.55, 1.5, 2.8, "44/44", "单元 + 集成测试", C.green);
  stat(s, 3.55, 1.5, 2.8, "18/18", "安全对抗用例", C.green);
  stat(s, 6.55, 1.5, 2.8, "3/3", "核心场景 pass^20", C.green);
  stat(s, 9.55, 1.5, 3.2, `${m.p95_ms?.toFixed?.(1) ?? "—"} ms`, "p95（Mock LLM）", C.blue);
  const rows = [
    ["TCR", pct(m.TCR ?? 0), "任务完成率"],
    ["PCR", pct(m.PCR ?? 0), "合规红线"],
    ["TCA", pct(m.TCA ?? 0), "工具选择/参数/顺序"],
    ["ABR", pct(m.ABR ?? 0), "审计字段完整"],
    ["HBR", pct(m.HBR ?? 0), "无依据数字阻断"],
    ["PBR", pct(m.PBR ?? 0), "越权/绕过拦截"],
    ["RRR", pct(m.RRR ?? 0), "补偿成功"],
  ];
  s.addTable(
    [
      [{ text: "指标", options: { bold: true, color: C.blue } }, { text: "值", options: { bold: true, color: C.blue } }, { text: "说明", options: { bold: true, color: C.blue } }],
      ...rows.map((r) => r.map((v, i) => ({ text: v, options: { color: i === 1 ? C.green : C.text, bold: i === 0 } }))),
    ],
    {
      x: 0.55, y: 2.7, w: 6.2, colW: [1.1, 1.2, 3.9], rowH: 0.4,
      border: { type: "solid", color: C.line, pt: 0.4 }, fill: { color: C.panel },
      fontFace: FONT, fontSize: 9, valign: "middle", margin: 0.04,
    },
  );
  imageCard(s, shot("14b-audit-verified.png"), 7.0, 2.7, 5.75, 3.3, "真实审计校验：171 条 · 1 锚点");
  box(s, 0.55, 6.55, 12.2, 0.45, "161F1A", C.yellow);
  text(s, "评测不是只跑 happy path：包含注入、越权、幻觉、熔断、补偿、幂等、重复运行可靠性。", 0.75, 6.63, 11.8, 0.3, { size: 9.2, color: C.text });
  s.addNotes("我们按最终状态与副作用评分，不按回复文本。3 个核心场景各跑 20 次全部通过；对抗用例 18/18。");
}

// 14 真实模型
{
  const s = pptx.addSlide();
  base(s, 14, "REAL MODEL", "同一组 Eval 对照：真实模型 vs Mock");
  if (real?.metrics) {
    const m = real.metrics;
    const llm = real.llm || {};
    const cases = real.cases || [];
    const passed = cases.filter((c) => c.pass_at_1 === 1).length;
    stat(s, 0.55, 1.5, 3.0, llm.model || "—", "真实模型", C.purple);
    stat(s, 3.75, 1.5, 3.0, `${passed}/${cases.length}`, "用例通过", C.green);
    stat(s, 6.95, 1.5, 3.0, pct(m.real_model_rate ?? 0), "真实提案占比", C.purple);
    stat(s, 10.15, 1.5, 2.6, pct(m.TCR ?? 0), "TCR", C.green);
    const rows = [
      ["核心场景", "转账/账单 PASS；生日首次 fetch failed", "生日定向复测 completed"],
      ["安全红线", "PBR/RRR 100%；PCR 0%", "PCR 受 1 次瞬断影响，非绕过"],
      ["公共端点", "1 reply/45s", "p95 含限流等待，非推理延迟"],
    ];
    s.addTable(
      [
        [{ text: "项", options: { bold: true, color: C.blue } }, { text: "值", options: { bold: true, color: C.blue } }, { text: "说明", options: { bold: true, color: C.blue } }],
        ...rows.map((r) => r.map((v, i) => ({ text: v, options: { color: i === 1 ? C.green : C.text } }))),
      ],
      { x: 0.55, y: 2.9, w: 7.4, colW: [2.3, 2.4, 2.7], rowH: 0.55, border: { type: "solid", color: C.line, pt: 0.4 }, fill: { color: C.panel }, fontFace: FONT, fontSize: 10, valign: "middle", margin: 0.05 },
    );
    box(s, 0.55, 5.1, 7.4, 1.4, "161F1A", C.yellow);
    text(s, "诚实说明", 0.75, 5.2, 7.0, 0.3, { size: 10.5, color: C.yellow, bold: true });
    text(s, "失败是公共端点瞬断（fetch failed），不是安全绕过；严格模式未回退 Mock，评测如实记录。生日定向复测 completed。正式评测应使用银行批准的模型端点与 Key。", 0.75, 5.52, 7.0, 0.8, { size: 8.8, color: C.text, lineSpacingMultiple: 1.08 });
    imageCard(s, shot("05-injection-denied.png"), 8.35, 2.9, 4.45, 3.6, "真实模型也同样受 Policy Gate 约束");
  } else {
    text(s, "真实模型评测正在运行/缺少可用 Key。脚本已就绪：", 0.65, 1.7, 12, 0.4, { size: 13, color: C.yellow, bold: true });
    box(s, 0.55, 2.3, 12.2, 1.6, "0D1410", C.line);
    text(s, "PANSHI_LLM=openai  OPENAI_BASE_URL=...  OPENAI_CHAT_PATH=...\nOPENAI_MODEL=...  PANSHI_LLM_STRICT=1  PANSHI_LLM_MIN_INTERVAL_MS=...\nnode eval/run.js --repeat=1", 0.75, 2.5, 11.8, 1.3, { size: 10, color: C.text, lineSpacingMultiple: 1.3 });
    text(s, "没有 Key 时不自称“真实模型已通过”；结果写入 eval/report-real.md。", 0.65, 4.3, 12, 0.4, { size: 11, color: C.muted });
  }
  s.addNotes("真实模型对照的意义是看模型提案被确定性控制面约束后的完成率。即使模型出错，Policy Gate/Permit 仍应拦截危险动作。");
}

// 15 风险
{
  const s = pptx.addSlide();
  base(s, 15, "RISKS", "已知风险与生产化差距：不声称已通过认证");
  const left = [
    "TOTP 模拟，不是 FaceID/WebAuthn",
    "分析沙箱是受限表达式，不是通用代码沙箱",
    "SQLite 单进程，非分布式事务库",
    "公共模型端点有速率限制，非生产 SLA",
    "MCP manifest 仅启动时哈希校验",
  ];
  const right = [
    "接入银行核心适配层与清算/对账",
    "WebAuthn/FaceID + 设备绑定",
    "分布式数据库 + 消息队列 + WORM 审计",
    "HSM/KMS 管理 Permit/补偿密钥",
    "gVisor/Firecracker + 真实红队与监管测评",
  ];
  box(s, 0.55, 1.45, 6.0, 4.7, "0D1410", C.red);
  text(s, "当前原型的已知风险", 0.75, 1.58, 5.6, 0.3, { size: 11, color: C.red, bold: true });
  left.forEach((t, i) => text(s, `• ${t}`, 0.75, 2.0 + i * 0.72, 5.5, 0.55, { size: 9.5, color: C.text }));
  box(s, 6.9, 1.45, 5.9, 4.7, "0D1410", C.green);
  text(s, "生产化升级路径", 7.1, 1.58, 5.5, 0.3, { size: 11, color: C.green, bold: true });
  right.forEach((t, i) => text(s, `• ${t}`, 7.1, 2.0 + i * 0.72, 5.5, 0.55, { size: 9.5, color: C.text }));
  box(s, 0.55, 6.3, 12.2, 0.45, "161F1A", C.yellow);
  text(s, "不声称：已通过监管认证、已接入真实银行核心、已实现生产级生物识别。", 0.75, 6.37, 11.8, 0.3, { size: 9.5, color: C.yellow });
  s.addNotes("评委追问生产差距时，直接给清单：TOTP、SQLite、表达式沙箱、公共端点、manifest 热更新。我们不掩盖。");
}

// 16 收束
{
  const s = pptx.addSlide();
  s.background = { color: C.bg };
  s.addShape(pptx.ShapeType.ellipse, { x: 9.9, y: 1.15, w: 4.4, h: 4.4, fill: { color: C.gold, transparency: 94 }, line: { color: C.gold, transparency: 100 } });
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.06, fill: { color: C.blue }, line: { color: C.blue } });
  s.addText("三句话收束", { x: 0.65, y: 0.6, w: 8, h: 0.5, fontSize: 26, bold: true, color: C.text, charSpacing: 0.8, fontFace: FONT_DISPLAY, margin: 0 });
  const lines = [
    "1. 模型只提议，权限由系统裁决。",
    "2. 每个数字有证据，每条动作可回放。",
    "3. 三条链路可复现，安全对抗可证明。",
  ];
  lines.forEach((t, i) => text(s, t, 0.75, 1.55 + i * 0.7, 11.6, 0.5, { size: 19, color: i === 0 ? C.blue : i === 1 ? C.green : C.yellow, bold: true }));
  box(s, 0.65, 4.2, 12.0, 1.2, "0D1410", C.line);
  text(s, "node src/server.js", 0.85, 4.35, 5.5, 0.4, { size: 14, color: C.blue, bold: true });
  text(s, "http://localhost:8787 · 无需 npm install · Node ≥24", 0.85, 4.75, 7.0, 0.3, { size: 10, color: C.muted });
  text(s, "README · docs/technical.md · docs/security-self-assessment.md · eval/report.md", 0.85, 5.05, 11.0, 0.3, { size: 9, color: C.text });
  text(s, "演示环境为沙箱模拟，不涉及真实资金。", 0.65, 6.35, 8, 0.3, { size: 9, color: C.muted });
  s.addNotes("请评委按 README 一条命令复现；我们可以现场再跑一次注入拦截。谢谢。");
}

await pptx.writeFile({ fileName: OUT });
console.log("PPT written:", OUT);
