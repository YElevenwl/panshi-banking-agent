# 任务清单与里程碑

> 状态：M0–M4 已完成；M5 文档已完成；实际 PPT/视频录制待人工完成。  
> 验收口径：可运行、可演示、可复现、有审计证据。

---

## 里程碑总览

| 里程碑 | 内容 | 状态 | 验收证据 |
|---|---|---|---|
| M0 | 仓库骨架、文档迁移、种子数据、健康检查 | 完成 | `node src/server.js` / `/api/health` 200 |
| M1 | Policy Gate、工具网关、审计、幂等、熔断 | 完成 | `policy/permit/audit/ledger` 单测 |
| M2 | 智能转账端到端（审批/强验证/回退/撤销） | 完成 | `transfer.test.js` 6 条 |
| M3 | 账单分析 + 生日跨场景（定时/补偿） | 完成 | `bill.test.js` / `birthday.test.js` |
| M4 | 对抗测试、安全面板、pass^20 评测 | 完成 | 18/18；3/3 pass^20 |
| M5 | 简介、技术文档、PPT/视频脚本、README | 完成（文档） | `docs/` + `README.md` |
| M6 | 实际 PPT、视频、真实模型对照 | 完成 | `deliverables/PANSHI-答辩.pptx`、`PANSHI-demo.mp4`、`eval/report-real.md` |

---

## M0 · 仓库骨架

| ID | 任务 | 状态 | 验收 |
|---|---|---|---|
| M0-1 | 目录骨架 `src/tests/eval/adversarial_tests/docs` | 完成 | 目录存在 |
| M0-2 | `package.json`、零依赖启动 | 完成 | `node src/server.js` |
| M0-3 | SQLite schema 与种子数据 | 完成 | 3 用户、账户、账单、日历 |
| M0-4 | 健康检查与静态控制台 | 完成 | `/api/health`、`/` |
| M0-5 | 文档迁移与 research-log | 完成 | `docs/spec.md` 等 |

---

## M1 · 控制面

| ID | 任务 | 状态 | 验收 |
|---|---|---|---|
| M1-1 | 权限规则表 GREEN/YELLOW/RED/DENY | 完成 | `policy.test.js` 12 条 |
| M1-2 | 日累计投影 + 原子冻结 | 完成 | `ledger.test.js`、对抗 12 |
| M1-3 | Execution Permit 签发/验签/重放 | 完成 | `permit.test.js` 4 条、对抗 07–09 |
| M1-4 | Tool Gateway allowlist/manifest/幂等/脱敏 | 完成 | 对抗 13、17、18 |
| M1-5 | append-only 审计 + 哈希链 + Merkle anchor | 完成 | `audit.test.js` 3 条、对抗 16 |
| M1-6 | 熔断状态机 + kill switch | 完成 | 对抗 15 |
| M1-7 | 审批信封 + TOTP 交易挑战 | 完成 | `transfer.test.js` RED 用例 |

---

## M2 · 智能转账

| ID | 任务 | 状态 | 验收 |
|---|---|---|---|
| M2-1 | N0–N9 节点 execute/rollback/on_interrupt | 完成 | DAG 表、审计事件 |
| M2-2 | 800 元 YELLOW 端到端 | 完成 | 余额 19200.00 |
| M2-3 | 5000 元 RED + TOTP | 完成 | 错误码拒绝、正确码通过 |
| M2-4 | 审批阶段取消无副作用 | 完成 | `cancel` 用例 |
| M2-5 | 已完成转账撤销/冲正 | 完成 | `reversed`、余额恢复 |
| M2-6 | 控制台审批信封/审计/DAG | 完成 | `src/ui` |

**评审自检**：任务完成率 7/10、安全 8/10、创新交互 6/10。  
差距：只有一条链路；账单/生日未做；真实 LLM 未接入。

---

## M3 · 账单 + 生日

| ID | 任务 | 状态 | 验收 |
|---|---|---|---|
| M3-1 | 账单聚合（分类/总额/笔数） | 完成 | 8779.00 / 24 笔 |
| M3-2 | 异常识别（重复扣款/凌晨大额/未知商户） | 完成 | 1 条合并异常 |
| M3-3 | FactStore + 数字白名单 | 完成 | violations=0 |
| M3-4 | 生日日历授权 + 计划审批 | 完成 | consent + approval |
| M3-5 | Mandate + 冻结 + 定时下单 | 完成 | 2 个 order.schedule |
| M3-6 | 到期调度器 + 扣款/退款 | 完成 | 2 个 order_commit 完成 |
| M3-7 | 撤销生日计划（补偿） | 完成（引擎 undo） | 订单取消/冻结释放/授权撤销 |

**评审自检**：任务完成率 8/10、安全 8/10、创新交互 8/10。  
差距：订阅/卡片/理财未端到端；真实 LLM 未接入；MCP 运行时 manifest 热更新校验未做。

---

## M4 · 对抗与评测

| ID | 任务 | 状态 | 验收 |
|---|---|---|---|
| M4-1 | 18 条对抗用例 | 完成 | 18/18 |
| M4-2 | 安全面板 | 完成 | 审计/熔断/PBR 指标 |
| M4-3 | eval 脚本与报告 | 完成 | `eval/report.md` |
| M4-4 | pass^20 | 完成 | 3/3 |
| M4-5 | 分析沙箱 | 完成 | 受限表达式 3 条测试 |
| M4-6 | 安全自评报告 | 完成 | `docs/security-self-assessment.md` |

**评审自检**：任务完成率 9/10、安全 9/10、创新交互 8/10。  
差距：真实生物识别、生产数据库、通用代码沙箱未实现（明确列为风险）。

---

## M5 · 交付文档

| ID | 任务 | 状态 | 验收 |
|---|---|---|---|
| M5-1 | README 一键启动/账号/对抗/审计样例 | 完成 | 第一屏可照做 |
| M5-2 | 技术文档（三平面/算法/数据/API） | 完成 | `docs/technical.md` |
| M5-3 | 安全自评报告 | 完成 | 五域/十项/风险清单 |
| M5-4 | PPT 大纲（≤10 分钟） | 完成 | 15 页 + 备用页 |
| M5-5 | 5 分钟视频脚本（含拦截时间码） | 完成 | `docs/demo-script.md` |
| M5-6 | 作品简介 200 字 | 完成 | 183 字（含标点） |
| M5-7 | 场景 JSON | 完成 | `scenarios/*.json` |

---

## 交付物完成情况

| ID | 事项 | 状态 | 产物 |
|---|---|---|---|
| H-1 | 实际 PPT 制作 | 完成 | `deliverables/PANSHI-答辩.pptx`（16 页，真实截图 + 审计样例） |
| H-2 | 演示视频录制 | 完成 | `deliverables/PANSHI-demo.mp4`（4:02，1080p，中文 TTS） |
| H-3 | 真实模型对照 | 完成（公共端点） | `eval/report-real.md`；GPT-OSS-20B，严格模式，真实占比 100% |
| H-4 | Docker 构建验证 | 未验证 | 本机无 Docker |
| H-5 | GitHub 仓库地址 | 未完成 | 本机无 git；需人工推送 |
| H-6 | PowerPoint 渲染预览 | 完成 | LibreOffice 26.8 → PDF/PNG 逐页检查；新版“私行审计档案”视觉 16 页无元素越界 |

---

## 下一步优先级

1. 用真实模型跑同一组 eval，对比 Mock 的延迟/失败率。
2. 录制视频，严格保留 01:05–01:45 注入拦截。
3. 制作 PPT，第 3/6/7/8 页配真实截图与审计字段。
4. 在答辩环境预装 Node 24 或准备 Docker 镜像。


