import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";
import puppeteer from "puppeteer-core";

const ROOT = path.resolve("..");
const OUT = path.join(ROOT, "submission");
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

const archSvg = `
<svg viewBox="0 0 1000 540" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto">
  <rect x="0" y="0" width="1000" height="540" fill="#fffdf8" stroke="#e6ddc8"/>
  <text x="36" y="34" font-size="12" fill="#8a6d3b" font-family="Microsoft YaHei">系统架构 · 控制面 / 执行面 / 数据面</text>

  <rect x="20" y="52" width="960" height="142" fill="#f7f1e2" stroke="#e3d6b7"/>
  <text x="36" y="78" font-size="13" fill="#8a6d3b" font-weight="bold" font-family="Microsoft YaHei">控制面</text>
  <rect x="128" y="70" width="150" height="52" rx="3" fill="#fff" stroke="#b08d57"/>
  <text x="203" y="92" text-anchor="middle" font-size="11" fill="#222" font-family="Microsoft YaHei">Intent Gateway</text>
  <text x="203" y="108" text-anchor="middle" font-size="9" fill="#777" font-family="Microsoft YaHei">规范化 / 注入检测</text>
  <rect x="318" y="70" width="150" height="52" rx="3" fill="#fff" stroke="#b08d57"/>
  <text x="393" y="92" text-anchor="middle" font-size="11" fill="#222" font-family="Microsoft YaHei">Orchestrator</text>
  <text x="393" y="108" text-anchor="middle" font-size="9" fill="#777" font-family="Microsoft YaHei">路由 / 状态机</text>
  <rect x="508" y="70" width="150" height="52" rx="3" fill="#fff" stroke="#b08d57"/>
  <text x="583" y="92" text-anchor="middle" font-size="11" fill="#222" font-family="Microsoft YaHei">Policy Gate</text>
  <text x="583" y="108" text-anchor="middle" font-size="9" fill="#777" font-family="Microsoft YaHei">GREEN / YELLOW / RED</text>
  <rect x="698" y="70" width="170" height="52" rx="3" fill="#fff" stroke="#b08d57"/>
  <text x="783" y="92" text-anchor="middle" font-size="11" fill="#222" font-family="Microsoft YaHei">审批 + Permit</text>
  <text x="783" y="108" text-anchor="middle" font-size="9" fill="#777" font-family="Microsoft YaHei">信封 / TOTP / 能力令牌</text>
  <rect x="898" y="70" width="70" height="52" rx="3" fill="#fff" stroke="#d97a6c"/>
  <text x="933" y="92" text-anchor="middle" font-size="10" fill="#222" font-family="Microsoft YaHei">熔断</text>
  <text x="933" y="108" text-anchor="middle" font-size="8" fill="#777" font-family="Microsoft YaHei">Kill Switch</text>

  <rect x="318" y="134" width="150" height="34" rx="3" fill="#fbf5e6" stroke="#d8c69d" stroke-dasharray="4 3"/>
  <text x="393" y="155" text-anchor="middle" font-size="9.5" fill="#6f5a35" font-family="Microsoft YaHei">LLM Adapter · 只提案</text>

  <line x1="278" y1="96" x2="316" y2="96" stroke="#b08d57" stroke-width="1.2"/>
  <line x1="468" y1="96" x2="506" y2="96" stroke="#b08d57" stroke-width="1.2"/>
  <line x1="658" y1="96" x2="696" y2="96" stroke="#b08d57" stroke-width="1.2"/>
  <line x1="868" y1="96" x2="896" y2="96" stroke="#b08d57" stroke-width="1.2"/>

  <rect x="20" y="212" width="960" height="150" fill="#eef4ee" stroke="#cfddcf"/>
  <text x="36" y="238" font-size="13" fill="#2f6b4f" font-weight="bold" font-family="Microsoft YaHei">执行面</text>
  <rect x="128" y="232" width="160" height="54" rx="3" fill="#fff" stroke="#5f9c78"/>
  <text x="208" y="254" text-anchor="middle" font-size="11" fill="#222" font-family="Microsoft YaHei">DAG Engine</text>
  <text x="208" y="270" text-anchor="middle" font-size="9" fill="#777" font-family="Microsoft YaHei">execute / rollback / interrupt</text>
  <rect x="318" y="232" width="150" height="54" rx="3" fill="#fff" stroke="#5f9c78"/>
  <text x="393" y="254" text-anchor="middle" font-size="11" fill="#222" font-family="Microsoft YaHei">Tool Gateway</text>
  <text x="393" y="270" text-anchor="middle" font-size="9" fill="#777" font-family="Microsoft YaHei">验签 / 参数哈希 / 幂等</text>
  <rect x="498" y="232" width="160" height="54" rx="3" fill="#fff" stroke="#5f9c78"/>
  <text x="578" y="254" text-anchor="middle" font-size="11" fill="#222" font-family="Microsoft YaHei">24 个受控工具</text>
  <text x="578" y="270" text-anchor="middle" font-size="9" fill="#777" font-family="Microsoft YaHei">账户 / 账单 / 订单 / 日历</text>
  <rect x="688" y="232" width="150" height="54" rx="3" fill="#fff" stroke="#5f9c78"/>
  <text x="763" y="254" text-anchor="middle" font-size="11" fill="#222" font-family="Microsoft YaHei">银行核心模拟</text>
  <text x="763" y="270" text-anchor="middle" font-size="9" fill="#777" font-family="Microsoft YaHei">账务 / 冻结 / 订单</text>
  <rect x="868" y="232" width="100" height="54" rx="3" fill="#fff" stroke="#5f9c78"/>
  <text x="918" y="254" text-anchor="middle" font-size="10" fill="#222" font-family="Microsoft YaHei">分析沙箱</text>
  <text x="918" y="270" text-anchor="middle" font-size="8" fill="#777" font-family="Microsoft YaHei">受限表达式</text>
  <line x1="288" y1="259" x2="316" y2="259" stroke="#5f9c78" stroke-width="1.2"/>
  <line x1="468" y1="259" x2="496" y2="259" stroke="#5f9c78" stroke-width="1.2"/>
  <line x1="658" y1="259" x2="686" y2="259" stroke="#5f9c78" stroke-width="1.2"/>
  <line x1="838" y1="259" x2="866" y2="259" stroke="#5f9c78" stroke-width="1.2"/>

  <rect x="20" y="382" width="960" height="128" fill="#f4f1fa" stroke="#ddd4ea"/>
  <text x="36" y="408" font-size="13" fill="#65538a" font-weight="bold" font-family="Microsoft YaHei">数据面</text>
  <rect x="128" y="400" width="190" height="54" rx="3" fill="#fff" stroke="#8f7ab5"/>
  <text x="223" y="422" text-anchor="middle" font-size="11" fill="#222" font-family="Microsoft YaHei">SQLite WAL</text>
  <text x="223" y="438" text-anchor="middle" font-size="9" fill="#777" font-family="Microsoft YaHei">运行 / 账务 / 冻结</text>
  <rect x="338" y="400" width="205" height="54" rx="3" fill="#fff" stroke="#8f7ab5"/>
  <text x="440" y="422" text-anchor="middle" font-size="11" fill="#222" font-family="Microsoft YaHei">审计哈希链</text>
  <text x="440" y="438" text-anchor="middle" font-size="9" fill="#777" font-family="Microsoft YaHei">append-only + Merkle anchor</text>
  <rect x="563" y="400" width="190" height="54" rx="3" fill="#fff" stroke="#8f7ab5"/>
  <text x="658" y="422" text-anchor="middle" font-size="11" fill="#222" font-family="Microsoft YaHei">FactStore</text>
  <text x="658" y="438" text-anchor="middle" font-size="9" fill="#777" font-family="Microsoft YaHei">数字证据锚定</text>
  <rect x="773" y="400" width="195" height="54" rx="3" fill="#fff" stroke="#8f7ab5"/>
  <text x="870" y="422" text-anchor="middle" font-size="11" fill="#222" font-family="Microsoft YaHei">版本与清单</text>
  <text x="870" y="438" text-anchor="middle" font-size="9" fill="#777" font-family="Microsoft YaHei">策略版本 / Manifest 哈希</text>

  <line x1="208" y1="194" x2="208" y2="230" stroke="#8a6d3b" stroke-width="1.2" stroke-dasharray="4 3"/>
  <line x1="393" y1="168" x2="393" y2="230" stroke="#8a6d3b" stroke-width="1.2" stroke-dasharray="4 3"/>
  <line x1="783" y1="122" x2="783" y2="230" stroke="#8a6d3b" stroke-width="1.2" stroke-dasharray="4 3"/>
  <line x1="208" y1="286" x2="208" y2="398" stroke="#5f9c78" stroke-width="1.2" stroke-dasharray="4 3"/>
  <line x1="393" y1="286" x2="440" y2="398" stroke="#5f9c78" stroke-width="1.2" stroke-dasharray="4 3"/>

  <text x="36" y="528" font-size="9" fill="#888" font-family="Microsoft YaHei">核心不变量：LLM 不直接执行；没有签名 Permit，网关拒绝写操作；工具结果默认不可信；每个数字必须有 FactStore 证据。</text>
</svg>`;

const lifecycleSvg = `
<svg viewBox="0 0 1000 190" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto">
  <rect x="0" y="0" width="1000" height="190" fill="#fffdf8" stroke="#e6ddc8"/>
  <text x="30" y="30" font-size="12" fill="#8a6d3b" font-family="Microsoft YaHei">请求生命周期 · 七段式执行边界</text>
  ${[
    ["1", "输入 Hook", "规范化 / 注入检测"],
    ["2", "LLM 提案", "Intent / Plan"],
    ["3", "DAG 执行", "固定拓扑 / checkpoint"],
    ["4", "Policy Gate", "确定性裁决"],
    ["5", "审批 / 强验证", "信封 / TOTP"],
    ["6", "Permit + 网关", "验签 / 幂等"],
    ["7", "证据 + 审计", "FactStore / 哈希链"],
  ].map(([n, t, d], i) => {
    const x = 30 + i * 135;
    return `<rect x="${x}" y="54" width="118" height="82" rx="3" fill="#fff" stroke="#b08d57"/>
      <text x="${x + 10}" y="74" font-size="10" fill="#b08d57" font-family="Microsoft YaHei">${n}</text>
      <text x="${x + 10}" y="94" font-size="11" fill="#222" font-family="Microsoft YaHei">${t}</text>
      <text x="${x + 10}" y="114" font-size="8.5" fill="#777" font-family="Microsoft YaHei">${d}</text>`;
  }).join("")}
  ${Array.from({ length: 6 }, (_, i) => `<line x1="${148 + i * 135}" y1="95" x2="${162 + i * 135}" y2="95" stroke="#b08d57" stroke-width="1"/>`).join("")}
  <text x="30" y="168" font-size="9" fill="#888" font-family="Microsoft YaHei">任一写操作都必须同时通过 Policy Gate 与 Tool Gateway 两道关；模型输出不构成执行授权。</text>
</svg>`;

const tiersSvg = `
<svg viewBox="0 0 1000 210" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto">
  <rect x="0" y="0" width="1000" height="210" fill="#fffdf8" stroke="#e6ddc8"/>
  <text x="30" y="30" font-size="12" fill="#8a6d3b" font-family="Microsoft YaHei">赛题三级权限 · 只加强，不降级</text>
  ${[
    ["GREEN", "自动执行", "查询 / 低风险", "#2f6b4f", "#eef4ee"],
    ["YELLOW", "用户确认", "日累计 ≤ 1000 元", "#8a6d3b", "#f7f1e2"],
    ["RED", "强验证", "日累计 > 1000 元 / 改密 / 挂失", "#a65045", "#f8ecea"],
  ].map(([t, a, d, c, bg], i) => {
    const x = 30 + i * 315;
    return `<rect x="${x}" y="52" width="290" height="118" fill="${bg}" stroke="${c}" stroke-width="1.2"/>
      <text x="${x + 18}" y="82" font-size="18" fill="${c}" font-weight="bold" font-family="Microsoft YaHei">${t}</text>
      <text x="${x + 18}" y="110" font-size="12" fill="#222" font-family="Microsoft YaHei">${a}</text>
      <text x="${x + 18}" y="136" font-size="10" fill="#666" font-family="Microsoft YaHei">${d}</text>`;
  }).join("")}
  <text x="30" y="196" font-size="9" fill="#888" font-family="Microsoft YaHei">RED 动作即使金额小或可逆也不降级；可逆性只用于补偿策略，不用于降低权限。</text>
</svg>`;

function readDoc(name) {
  return fs.readFileSync(path.join(ROOT, "docs", name), "utf8");
}

function cleanMd(md) {
  return md.replace(/^\uFEFF/, "").replace(/^# .*\r?\n/, "");
}

function pageHtml({ title, subtitle, meta, body, coverKicker, summary = "" }) {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 17mm 15mm 20mm; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #fffdf8; color: #1c1c1c; font-family: "Microsoft YaHei", "PingFang SC", sans-serif; font-size: 10.5pt; line-height: 1.72; }
  .cover { min-height: 245mm; padding: 26mm 8mm 10mm; page-break-after: always; }
  .kicker { font-size: 9pt; letter-spacing: 3px; color: #8a6d3b; text-transform: uppercase; }
  .cover h1 { font-family: "SimSun", "Songti SC", serif; font-size: 34pt; line-height: 1.35; margin: 18mm 0 6mm; font-weight: 600; }
  .cover .sub { font-family: "SimSun", "Songti SC", serif; font-size: 17pt; color: #3e3a31; line-height: 1.55; margin-bottom: 10mm; }
  .rule { width: 34%; height: 1px; background: linear-gradient(90deg,#b08d57,transparent); margin: 8mm 0; }
  .cover .meta { color: #6e675b; font-size: 10pt; line-height: 2; }
  .cover .foot { margin-top: 48mm; font-size: 8.5pt; color: #8a857a; border-top: 1px solid #e6ddc8; padding-top: 4mm; }
  h2 { font-family: "SimSun", "Songti SC", serif; font-size: 17pt; color: #1f3a2f; margin: 9mm 0 3mm; padding-bottom: 2mm; border-bottom: 1px solid #e3d6b7; page-break-after: avoid; }
  h3 { font-size: 12pt; color: #2f4a3b; margin: 6mm 0 2mm; page-break-after: avoid; }
  p { margin: 0 0 2.2mm; text-align: justify; }
  ul, ol { margin: 0 0 3mm; padding-left: 6mm; }
  li { margin-bottom: 1.1mm; }
  strong { color: #1f3a2f; }
  code { font-family: "Consolas", "Courier New", monospace; font-size: 8.8pt; background: #f4efe2; padding: 0.5mm 1mm; border-radius: 2px; }
  pre { background: #f7f4ec; border: 1px solid #e6ddc8; border-left: 3px solid #b08d57; padding: 3mm; overflow-wrap: anywhere; white-space: pre-wrap; page-break-inside: avoid; }
  pre code { background: transparent; padding: 0; font-size: 8.3pt; line-height: 1.55; }
  table { width: 100%; border-collapse: collapse; margin: 3mm 0 5mm; font-size: 8.4pt; page-break-inside: avoid; }
  th, td { border: 1px solid #ddd3bd; padding: 1.5mm 2mm; vertical-align: top; word-break: break-word; }
  th { background: #efe7d6; color: #3b3325; font-weight: bold; }
  blockquote { margin: 3mm 0; padding: 2.5mm 4mm; background: #f7f1e2; border-left: 3px solid #b08d57; color: #5d5546; }
  .summary { background: #f7f1e2; border: 1px solid #e3d6b7; border-left: 4px solid #b08d57; padding: 5mm 6mm; margin: 8mm 0 6mm; page-break-inside: avoid; }
  .summary b { color: #8a6d3b; }
  .caption { text-align: center; color: #8a857a; font-size: 8pt; margin: 2mm 0 6mm; }
  .doc-h1 { display: none; }
  a { color: #8a6d3b; text-decoration: none; }
  svg { page-break-inside: avoid; }
</style></head><body>
  <section class="cover">
    <div class="kicker">${coverKicker}</div>
    <h1>${title}</h1>
    <div class="sub">${subtitle}</div>
    <div class="rule"></div>
    <div class="meta">${meta}</div>
    <div class="foot">磐石（PANSHI）银行智能体 · 深圳金融竞赛 · 人工智能赛道<br/>演示环境为沙箱模拟，不涉及真实资金。</div>
  </section>
  <main>${summary}${body}</main>
</body></html>`;
}

function ensureDir() {
  fs.mkdirSync(OUT, { recursive: true });
}

async function renderPdf(html, outPath, footerTitle) {
  const browser = await puppeteer.launch({
    executablePath: EDGE, headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "load" });
  await new Promise((r) => setTimeout(r, 300));
  await page.pdf({
    path: outPath,
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: `<div style="font-size:7pt;color:#aaa;width:100%;padding:0 15mm;font-family:Microsoft YaHei">${footerTitle}</div>`,
    footerTemplate: `<div style="font-size:7pt;color:#999;width:100%;padding:0 15mm;font-family:Microsoft YaHei;text-align:right">第 <span class="pageNumber"></span> 页 / 共 <span class="totalPages"></span> 页</div>`,
    margin: { top: "20mm", right: "15mm", bottom: "20mm", left: "15mm" },
  });
  await browser.close();
}

async function main() {
  ensureDir();

  let tech = cleanMd(readDoc("technical.md"));
  tech = tech.replace(/```mermaid[\s\S]*?```/g, "<!--ARCH_DIAGRAM-->");
  tech = marked.parse(tech);
  tech = tech.replace("<!--ARCH_DIAGRAM-->", `${archSvg}<div class="caption">图 2-1  三平面架构：控制面负责提案与裁决，执行面只经网关产生副作用，数据面保存状态、证据与审计</div>`);
  tech = tech.replace(/(<h2[^>]*>3\. 请求生命周期<\/h2>)/, `$1${lifecycleSvg}<div class="caption">图 3-1  请求生命周期与两道执行边界</div>`);
  tech = tech.replace(/(<h2[^>]*>5\. 数据模型)/, `<h3>4.11 安全设计总览</h3>
  <p>信任边界：用户输入、LLM 提案与工具返回值均不可信；Policy Gate 是确定性裁决者；Tool Gateway 是唯一写操作入口；审计链 append-only，任何外部修改都会被哈希链与 Merkle 锚点发现。</p>
  <table><thead><tr><th>威胁</th><th>控制</th><th>落地证据</th></tr></thead><tbody>
    <tr><td>直接 / 间接提示注入</td><td>输入 Hook + 工具结果 taint 扫描</td><td><code>injection.detected</code> / <code>TAINTED_WRITE</code></td></tr>
    <tr><td>模型幻觉金额 / 周期</td><td>FactStore + 数字白名单 + 确定性 grounding</td><td><code>hallucination.blocked</code> / 用户原话金额覆盖</td></tr>
    <tr><td>越权 / 拆单 / 日累计绕过</td><td>Policy Gate + <code>BEGIN IMMEDIATE</code> 原子预占</td><td><code>TIER_RED</code> / 日累计投影升级</td></tr>
    <tr><td>Permit 伪造、重放、参数篡改</td><td>HMAC + nonce + params_hash + 单次使用</td><td><code>PERMIT_REPLAYED</code> / <code>PERMIT_PARAMS_MISMATCH</code></td></tr>
    <tr><td>审计篡改</td><td>append-only trigger + 哈希链 + Merkle anchor</td><td><code>audit:verify</code> 校验通过 / 断点定位</td></tr>
    <tr><td>不可逆副作用</td><td>补偿令牌 + 逆序补偿 + 人工对账标记</td><td><code>compensation</code> / <code>NEEDS_RECONCILIATION</code></td></tr>
    <tr><td>模型供应商风险</td><td>strict 模式、确定性 grounding、不回退 Mock</td><td>真实模型对照报告 10/11，失败如实记录</td></tr>
  </tbody></table>
  <p>残余风险：TOTP 为模拟、SQLite 单进程、分析沙箱为受限表达式、公共模型端点限流；生产化需 WebAuthn/FaceID、分布式数据库、WORM 审计与 HSM/KMS。详见配套《安全自评报告》。</p>
  $1`);

  const techHtml = pageHtml({
    title: "技术文档",
    subtitle: "系统架构图 · 核心算法说明 · 安全设计",
    meta: "作品名称：磐石（PANSHI）银行智能体<br/>文档版本：v0.2 · 2026-11-02<br/>适用场景：银行 AI Banking Agent 竞赛原型",
    coverKicker: "PANSHI PRIVATE BANKING · TECHNICAL DOSSIER",
    body: tech,
    summary: `<div class="summary"><b>阅读摘要</b><br/>本文档说明磐石智能体的三平面架构、固定资金 DAG、确定性 Policy Gate、签名 Permit、日累计原子预占、append-only 哈希链审计与幻觉/注入防御。核心判断是：模型只负责提议，权限与执行边界由模型之外的确定性系统裁决；每个数字必须可追溯到 FactStore，每条资金动作必须可回放。</div>`,
  });
  await renderPdf(techHtml, path.join(OUT, "01-技术文档.pdf"), "磐石银行智能体 · 技术文档");

  let safety = cleanMd(readDoc("security-self-assessment.md"));
  safety = marked.parse(safety);
  safety = safety.replace(/(<h2[^>]*>3\. 权限分级实现<\/h2>)/, `$1${tiersSvg}<div class="caption">图 3-1  GREEN / YELLOW / RED 三级权限与强验证边界</div>`);

  const safetyHtml = pageHtml({
    title: "安全自评报告",
    subtitle: "权限分级实现说明 · 对抗验证 · 已知风险清单",
    meta: "作品名称：磐石（PANSHI）银行智能体<br/>文档版本：v0.2 · 2026-11-02<br/>对照：T/BFIA 070—2026、15 家机构联合倡议、NFRA 指导意见",
    coverKicker: "PANSHI PRIVATE BANKING · SECURITY SELF-ASSESSMENT",
    body: safety,
    summary: `<div class="summary"><b>结论摘要</b><br/>当前原型已实现 GREEN / YELLOW / RED 三级权限、独立 Policy Gate、签名 Execution Permit、TOTP 强验证、日累计原子预占、append-only 哈希链审计与 18 条对抗用例。已知风险包括 TOTP 为模拟、SQLite 单进程、受限表达式沙箱、公共模型端点限流，以及 Docker/GitHub/真实银行核心尚未验证；报告不声称已通过监管认证。</div>`,
  });
  await renderPdf(safetyHtml, path.join(OUT, "04-安全自评报告.pdf"), "磐石银行智能体 · 安全自评报告");

  console.log("submission PDFs written");
}

main().catch((e) => { console.error(e); process.exit(1); });
