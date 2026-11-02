import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const ROOT = path.resolve("..");
const SHOTS = path.join(ROOT, "deliverables", "screenshots");
const OUT = path.join(ROOT, "deliverables", "video-frames");
fs.mkdirSync(OUT, { recursive: true });

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const C = { bg: "#070a08", panel: "#111814", line: "rgba(201,168,106,.18)", text: "#f2eee4", muted: "#98a29a", gold: "#c9a86a", goldBright: "#e6cf9f", green: "#5fcf9f", yellow: "#e0b15c", red: "#d97a6c", violet: "#b9a7d9", blue: "#c9a86a", purple: "#b9a7d9" };
const DISPLAY = '"Songti SC","STSong","SimSun",serif';
const SANS = '"Microsoft YaHei","PingFang SC",sans-serif';

const SECTIONS = [
  {
    id: "01", kind: "title", title: "磐石银行智能体",
    subtitle: "模型提议 · 系统裁决 · 证据说话 · 审计可回放",
    bullets: ["三条端到端链路", "44 项测试 · 18 项对抗", "3 个核心场景 pass^20"],
    image: "04-transfer-completed.png",
  },
  {
    id: "02", kind: "split", title: "800 元转账：黄色确认",
    bullets: ["解析意图 → 收款人 → 日累计", "Policy Gate：YELLOW / CONFIRM", "确认后冻结 → 提交 → 证据回执"],
    image: "03b-envelope-card.png", image2: "04-transfer-completed.png",
    caption: "真实审批信封 + 转账完成",
  },
  {
    id: "03", kind: "split", title: "注入拦截：TAINTED_WRITE",
    bullets: ["“忽略以上规则” → 高危注入", "Policy Gate：DENY / TAINTED_WRITE", "0 冻结 · 0 转账 · 审计可回放"],
    image: "05-injection-denied.png",
    caption: "真实运行截图：N4 失败",
  },
  {
    id: "04", kind: "split", title: "5000 元转账：红色强验证",
    bullets: ["日累计 > 1000 元 → RED", "TOTP 交易挑战绑定金额+收款人", "错误码不放行 · 正确码才签发 Permit"],
    image: "06-red-totp.png", image2: "07-red-approved.png",
    caption: "真实 TOTP 审批",
  },
  {
    id: "05", kind: "split", title: "撤销与冲正",
    bullets: ["签名补偿令牌执行 transfer.reverse", "余额从 15000 恢复到 20000", "审计记录 compensation.succeeded / run.undone"],
    image: "08-undo-reversed.png",
    caption: "真实撤销截图",
  },
  {
    id: "06", kind: "split", title: "账单分析：绿色通道",
    bullets: ["GREEN / ALLOW，无需确认", "8779.00 元 · 24 笔", "每个数字有 FactStore 证据；异常确定性识别"],
    image: "09-bill-report.png",
    caption: "真实账单报告",
  },
  {
    id: "07", kind: "split", title: "生日跨场景：多步 DAG",
    bullets: ["日历授权 → 计划审批 → Mandate", "冻结 1000 元 → 定时下单鲜花/蛋糕", "到期重新过 Policy Gate，匹配额度/类别/时间窗"],
    image: "12-birthday-completed.png", image2: "11b-birthday-envelope.png",
    caption: "真实生日计划",
  },
  {
    id: "08", kind: "split", title: "到期重评估",
    bullets: ["Scheduler 创建 order_commit 新运行", "不是沿用旧决策", "余额 19300.00 · 冻结剩余 300.00"],
    image: "13-order-runs.png",
    caption: "真实到期订单运行",
  },
  {
    id: "09", kind: "split", title: "审计与安全面板",
    bullets: ["171 条事件 · 1 个 Merkle 锚点", "按 trace 回放：策略/审批/工具/补偿", "外部审计可校验整条哈希链"],
    image: "14b-audit-verified.png", image2: "14-safety-panel.png",
    caption: "真实审计校验：通过",
  },
  {
    id: "10", kind: "split", title: "为什么固定 DAG",
    bullets: ["资金主链路固定拓扑", "LLM 只在局部节点判断", "checkpoint + 幂等键，重放不重复扣款"],
    image: "16-dag.png",
    caption: "10 节点 DAG",
  },
  {
    id: "11", kind: "split", title: "权限、执行、审计三者分离",
    bullets: ["模型不能同时是申请人/审批人/执行人", "Policy Gate 确定性裁决", "Permit 能力令牌 + 哈希链审计"],
    image: "03-transfer-envelope.png",
    caption: "审批信封与执行边界",
  },
  {
    id: "12", kind: "title", title: "模型提议，系统裁决",
    subtitle: "证据说话，审计可回放。",
    bullets: ["44/44 测试 · 18/18 对抗", "3/3 pass^20 · 指标 100%", "node src/server.js 一条命令复现"],
    image: "04-transfer-completed.png",
  },
];

function b64(file) {
  const p = path.join(SHOTS, file);
  if (!fs.existsSync(p)) return null;
  return `data:image/png;base64,${fs.readFileSync(p).toString("base64")}`;
}

function html(sec, idx) {
  const img = b64(sec.image);
  const img2 = sec.image2 ? b64(sec.image2) : null;
  const progress = `${((idx + 1) / SECTIONS.length) * 100}%`;
  if (sec.kind === "title") {
    return `<!doctype html><html><head><meta charset="utf-8"><style>
      *{box-sizing:border-box}body{margin:0;background:${C.bg};font-family:${SANS};color:${C.text};width:1920px;height:1080px;overflow:hidden}
      .frame{position:relative;width:100%;height:100%;padding:80px 100px;background:
        radial-gradient(900px 620px at 8% -14%, rgba(201,168,106,.12), transparent 62%),
        radial-gradient(700px 520px at 102% 4%, rgba(58,104,82,.16), transparent 58%), ${C.bg}}
      .mark{width:92px;height:92px;border:1px solid rgba(201,168,106,.55);background:rgba(201,168,106,.05);display:flex;align-items:center;justify-content:center;font-size:42px;font-family:${DISPLAY};color:${C.goldBright};border-radius:4px}
      .brand{display:flex;gap:26px;align-items:center}
      h1{font-family:${DISPLAY};font-size:62px;margin:0;letter-spacing:2px;font-weight:600}
      .sub{font-size:18px;color:${C.gold};margin-top:10px;letter-spacing:5px}
      .hero{font-family:${DISPLAY};font-size:42px;line-height:1.55;margin-top:64px;color:${C.text};letter-spacing:1px}
      .rule{width:140px;height:1px;background:linear-gradient(90deg,${C.gold},transparent);margin-top:38px}
      .bullets{display:flex;gap:16px;margin-top:48px}
      .b{border:1px solid ${C.line};background:rgba(17,24,20,.82);border-radius:4px;padding:18px 24px;font-size:20px;color:${C.muted}}
      .b strong{color:${C.goldBright};display:block;font-family:${DISPLAY};font-size:24px;margin-bottom:6px;letter-spacing:1px}
      .shot{position:absolute;right:70px;bottom:96px;width:900px;border:1px solid ${C.line};border-radius:6px;opacity:.96}
      .progress{position:absolute;left:100px;bottom:60px;width:1720px;height:4px;background:#1a241e;border-radius:2px}
      .fill{height:4px;background:${C.gold};border-radius:2px;width:${progress}}
      .foot{position:absolute;left:100px;bottom:26px;font-size:15px;color:${C.muted};letter-spacing:1px}
      </style></head><body><div class="frame">
        <div class="brand"><div class="mark">磐</div><div><h1>${sec.title}</h1><div class="sub">PANSHI BANKING AGENT</div></div></div>
        <div class="hero">${sec.subtitle}</div>
        <div class="rule"></div>
        <div class="bullets">${sec.bullets.map((b, i) => `<div class="b"><strong>${String(i + 1).padStart(2, "0")}</strong>${b}</div>`).join("")}</div>
        ${img ? `<img class="shot" src="${img}">` : ""}
        <div class="progress"><div class="fill"></div></div>
        <div class="foot">深圳金融竞赛 · 人工智能赛道 · 沙箱演示，不涉及真实资金</div>
      </div></body></html>`;
  }
  const media = img ? `<div class="media"><img src="${img}">${img2 ? `<img class="inset" src="${img2}">` : ""}<div class="cap">${sec.caption || ""}</div></div>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;background:${C.bg};font-family:${SANS};color:${C.text};width:1920px;height:1080px;overflow:hidden}
    .frame{position:relative;width:100%;height:100%;padding:56px 80px;background:
      radial-gradient(820px 620px at 0% 0%, rgba(201,168,106,.09), transparent 62%), ${C.bg}}
    .kicker{font-size:14px;color:${C.gold};letter-spacing:4px;font-weight:700}
    h1{font-family:${DISPLAY};font-size:44px;margin:14px 0 0;letter-spacing:1.2px;font-weight:600}
    .content{display:grid;grid-template-columns:1.35fr 1fr;gap:34px;margin-top:30px;height:750px}
    .media{position:relative;border:1px solid ${C.line};border-radius:8px;background:#0b100d;overflow:hidden;display:flex;align-items:center;justify-content:center}
    .media>img{max-width:100%;max-height:100%;object-fit:contain}
    .media .inset{position:absolute;right:18px;bottom:42px;width:38%;border:1px solid ${C.line};border-radius:6px;background:#0b100d;box-shadow:0 10px 30px rgba(0,0,0,.4)}
    .cap{position:absolute;left:16px;bottom:12px;font-size:12px;color:${C.muted};background:rgba(7,10,8,.85);padding:5px 9px;border:1px solid rgba(201,168,106,.16);border-radius:3px;letter-spacing:1px}
    .copy{display:flex;flex-direction:column;gap:18px;justify-content:center}
    .item{border-left:3px solid ${C.gold};padding:12px 0 12px 18px;font-size:21px;line-height:1.55;color:${C.text};letter-spacing:.4px}
    .item:nth-child(2){border-left-color:${C.green}}
    .item:nth-child(3){border-left-color:${C.yellow}}
    .progress{position:absolute;left:80px;bottom:40px;width:1760px;height:4px;background:#1a241e;border-radius:2px}
    .fill{height:4px;background:${C.gold};border-radius:2px;width:${progress}}
    .foot{position:absolute;left:80px;bottom:14px;font-size:13px;color:${C.muted};letter-spacing:1px}
    .num{position:absolute;right:80px;bottom:14px;font-size:13px;color:${C.muted};font-family:${DISPLAY};letter-spacing:1px}
    </style></head><body><div class="frame">
      <div class="kicker">真实运行 · ${sec.kind.toUpperCase()}</div>
      <h1>${sec.title}</h1>
      <div class="content">${media}<div class="copy">${sec.bullets.map((b) => `<div class="item">${b}</div>`).join("")}</div></div>
      <div class="progress"><div class="fill"></div></div>
      <div class="foot">PANSHI · 模型提议，系统裁决，证据说话，审计可回放</div>
      <div class="num">${idx + 1} / ${SECTIONS.length}</div>
    </div></body></html>`;
}

const browser = await puppeteer.launch({
  executablePath: EDGE, headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
  defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
for (let i = 0; i < SECTIONS.length; i += 1) {
  const sec = SECTIONS[i];
  await page.setContent(html(sec, i), { waitUntil: "load" });
  await new Promise((r) => setTimeout(r, 300));
  const file = path.join(OUT, `sec${sec.id}.png`);
  await page.screenshot({ path: file });
  console.log("frame", sec.id, file);
}
await browser.close();
console.log("frames done");
