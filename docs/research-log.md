# 外部检索日志与证据卡片

> 项目：磐石（PANSHI）银行 AI 智能体 — 深圳金融竞赛「人工智能赛道」
> 检索日期：2026-10-31
> 检索工具：WebSearch / WebFetch
> 规则：没有证据卡片的架构决策不得进入 `docs/spec.md`；证据冲突必须显式记录。
> 状态：证据库 v1（持续追加，不覆盖历史条目，只追加 E18、E19…）

---

## 0. 检索方法与局限

1. 本轮共检索 17 组关键词，抓取 5 个原文页面，形成 16 张可引用证据卡片 + 4 条「未能验证」记录。
2. 证据分层：
   - **A 级（硬约束）**：监管文件、团体标准、官方产品文档。
   - **B 级（工程实践）**：开源项目、厂商工程博客、生产系统公开说明。
   - **C 级（评测/研究）**：arXiv 预印本、基准论文、获奖报道。
3. 预印本与厂商博客不作为唯一依据；涉及资金安全的决策至少由 A 级或两个独立 B 级来源支撑。
4. 检索结果存在时间/地域偏差：部分 2026 年资料为中文媒体转述，原文条款可能未完整公开。凡转述均在卡片中标注「媒体转述」。
5. **未能验证的用户假设**（详见第 4 节）：
   - Zenodo 上的 “OmniBank Agents Architecture（2026-01）” 未检索到对应记录。
   - “WorkBuddy 金融版”未检索到独立产品页，仅验证到 WorkBuddy 通用沙箱文档。
   - “CIC 场景开放赛”检索结果为 CICC（语料数据智能创意大赛/智能体黑客松），名称可能不一致。
   - “挑战杯揭榜挂帅”本轮未形成可引用的一手评审规则，暂不作为设计依据。

---

## 1. 证据总表（设计决策 ↔ 证据）

| 编号 | 来源 | 关键结论 | 支撑决策 | 置信度 |
|---|---|---|---|---|
| E01 | 新华网 / T/BFIA 070—2026 | 金融智能体安全五类要求；第三方智能体操作金融 App 须机构授权 | 控制面/执行面分离；拒绝 GUI 自动化路径；输入/推理/身份/数据/合规五域控制 | 高 |
| E02 | 上海证券报 / 15 家机构联合倡议 | 十项原则：安全合规、身份可信、操作授权、调用受控、运行可控、注入防御、引入严审、决策可溯、人工确认、行业共治 | Policy Gate、工具网关、审计、HITL、注入防御 | 高 |
| E03 | 国家金融监督管理总局指导意见 | 高风险关键环节人工监督与干预；紧急停用、模型退出、人工替代流程 | 熔断、人工接管、kill switch、备用流程 | 高 |
| E04 | 中信百信银行 Orange / 信通院评估 | 双沙箱 + 统一 Hook 安全中枢；工具调用参数校验/脱敏/拦截/沙箱/结果脱敏闭环；六类指标 | 双沙箱、Hook 节点、工具调用闭环、审计合规 | 中高 |
| E05 | Revolut AIR 官方 | 零数据保留、生物识别确认、仅访问用户可见数据 | 强验证、数据最小化、第三方 LLM 零保留 | 高 |
| E06 | closegate 开源 Policy Gate | LLM 与财务系统之间的 policy gate；SoD、重要性阈值、敏感账户路由、哈希链审计、HITL 信封 | Policy Gate 位置、职责分离、哈希链审计、审批信封 | 高 |
| E07 | 腾讯云生产级权限治理 | auto/single/dual 三档；按可逆性+金额；“5 分钟内能否无损撤回”；四眼原则 | 文档三级之外增加内部动作分级与四眼原则 | 中高 |
| E08 | ThinkingBox-Bench（arXiv） | 507 个状态化任务；pass@1 与 pass^20 显著衰减；按最终状态/副作用评分 | 可靠性评测、pass^k、副作用断言 | 高 |
| E09 | MCP-Atlas（arXiv/Scale） | 1,000 任务、36 个真实 MCP 服务器、220 工具；3–6 次跨服务器调用；claims rubric | 工具选择/参数/多步编排评测 | 高 |
| E10 | DynamicMCPBench（arXiv） | 以执行轨迹为 ground truth；确定性回放；effect-scored | 过程可靠性评测、审计回放 | 高 |
| E11 | OWASP MCP Top 10 / Cheat Sheet | 工具返回默认不可信；schema poisoning、tool shadowing；过滤器不能证明安全；必须授权校验 | 工具结果信任分级、manifest 锁定、taint、网关授权 | 高 |
| E12 | Anthropic Building Effective Agents | workflow=预定义代码路径；agent=模型动态掌控流程；简单、透明、ACI | 主链路固定 DAG + 局部 LLM 节点 | 高 |
| E13 | LangGraph Interrupts 文档 | 中断在节点边界 checkpoint 全量状态；恢复按 thread_id；节点可从头重放 | DAG checkpoint/中断语义；副作用必须幂等/可补偿 | 高 |
| E14 | Stripe Idempotent Requests | idempotency key 保存首次响应；重试不会二次创建对象 | 双端幂等、重试安全 | 高 |
| E15 | AFAC2026 获奖报道 | 一等奖长文档方案=多路检索+证据压缩+动态复核；评审强调真转化而非 Demo | 证据锚定、复核节点、落地价值 | 中高 |
| E16 | 雄安 2026 AI+金融大赛 | 134 个项目、61 个决赛；评审五维：团队、技术创新、产业化、投资价值、场景适配 | 答辩叙事与场景选择 | 中高 |
| E17 | WorkBuddy 安全文档 | 沙箱隔离、默认只读、显式授权、JSONL 审计 | 沙箱执行、最小权限、结构化审计 | 中高 |
| U01 | OmniBank（用户引用） | **未能检索到 Zenodo 记录** | 不引用；其原则由 E06/E11/E12 独立支撑 | 未验证 |
| U02 | WorkBuddy 金融版 | **未检索到独立“金融版”产品页** | 仅引用通用 WorkBuddy 沙箱机制 | 未验证 |
| U03 | CIC 场景开放赛 | 检索到 CICC，名称不一致 | 不引用 | 未验证 |
| U04 | 挑战杯揭榜挂帅评审规则 | 未取得一手规则 | 不作为设计依据 | 未验证 |

---

## 2. 证据卡片（详细）

### E01 · 金融领域智能体安全团体标准 T/BFIA 070—2026

- **来源**：新华网《金融领域智能体安全团体标准发布，第三方智能体操作金融应用界面须获授权》
- **URL**：http://www.xinhuanet.com/tech/20260914/7d28b22fe5884ab0b8cb0528ff9869ac/c.html
- **发布时间**：2026-09-14（标准批准日 2026-08-27）
- **类型**：A 级 / 官方媒体转述团体标准
- **原文摘录**：
  - “标准规定了智能体技术在金融领域应用时的初始化与输入安全、模型推理与决策安全、身份鉴别与操作安全、数据安全与隐私保护、风险防控与合规等五个方面的要求。”
  - “手机端第三方智能体未经金融机构授权不得利用系统权限自动化读取、操作金融应用软件 GUI 界面。”
- **支持**：
  - 智能体安全必须覆盖输入、推理、身份、数据、合规五域，不能只做 prompt 过滤。
  - 银行自有 Agent 应走 API/受控工具路径，而不是读屏、模拟点击的 GUI 自动化路径。
- **反对/限制**：
  - 该标准是团体标准，约束力来自采购、测评与争议参照，不是罚则。
  - 媒体转述未给出全部条款原文；具体控制项需在技术文档中做“对照表”而非声称“已认证”。
- **置信度**：高（标准编号、发布机构、日期一致，多家媒体交叉报道）。
- **适用条件**：金融场景智能体的开发、部署、安全建设。
- **对设计的影响**：D-01 五域控制矩阵；D-02 只走工具网关/API，不做 GUI 自动化；D-03 身份与操作授权独立于模型。

### E02 · 15 家机构《智能体技术金融领域安全应用联合倡议》

- **来源**：上海证券报·中国证券网
- **URL**：http://www.cnstock.com/commonDetail/821088
- **发布时间**：2026-10-30
- **类型**：A 级 / 官方媒体
- **原文摘录**：
  - “从安全合规、身份可信、操作授权、调用受控、运行可控、注入防御、引入严审、决策可溯、人工确认、行业共治十个方面提出原则性要求。”
  - “未经金融机构明确授权，不得对金融客户端实施读屏、模拟点击或自动化操控。”
- **支持**：
  - “调用受控”对应工具网关；“注入防御”对应不可信内容隔离；“决策可溯”对应审计回放；“人工确认”对应审批信封。
- **反对/限制**：原则性倡议，未给出可执行技术规范；需要自行落地为可测试控制项。
- **置信度**：高（发起机构名单、十项原则均有报道）。
- **适用条件**：金融智能体全生命周期治理。
- **对设计的影响**：D-04 十项原则 → 控制点矩阵；答辩安全自评报告按十项逐条对照。

### E03 · 国家金融监督管理总局《关于银行业保险业人工智能安全开发应用的指导意见》

- **来源**：国家金融监督管理总局官网
- **URL**：https://www.nfra.gov.cn/cn/view/pages/ItemDetail.html?docId=1261784&itemId=928
- **发布时间**：2026-06（报道与官网条目一致）
- **类型**：A 级 / 监管文件
- **原文摘录**：
  - “在高风险应用关键环节建立人工监督和干预机制，明确紧急停用及模型退出条件，建立备用系统或人工替代流程。”
- **支持**：
  - 高风险动作必须有人工监督与干预，不是“弹窗确认”即可。
  - 必须有紧急停用（kill switch）与人工替代流程（降级路径）。
- **反对/限制**：面向银行保险机构整体 AI 应用，未细化到 Agent 工具调用级别；需要工程化解释。
- **置信度**：高（官网原文）。
- **适用条件**：银行业保险业 AI 开发应用。
- **对设计的影响**：D-05 熔断状态机 + kill switch + 人工接管 + 降级只读模式；答辩直接引用条款。

### E04 · 中信百信银行 Orange 智能体平台通过信通院“企业级智能体安全能力评估”

- **来源**：中信百信银行官网转载中国网报道
- **URL**：https://www.aibank.com/bsdt/xwdt/277883.shtml
- **发布时间**：2026-07-10
- **类型**：B 级 / 企业官方 + 评估结果转述
- **原文摘录**：
  - “平台采用双沙箱执行环境，并以统一 Hook 系统作为安全中枢，在智能体运行的关键生命周期节点预埋安全干预点，实现对权限、参数、数据、工具调用和执行结果的全链路管控。”
  - “在工具调用环节，该平台形成了覆盖参数校验与脱敏、安全规则拦截、沙箱执行与结果脱敏等闭环防护机制。”
  - 六类指标：“身份安全与访问控制、数据安全防护、智能体行为安全、知识库安全、Skills 可信、审计与合规安全。”
- **支持**：
  - 双沙箱 + 统一 Hook 是可被行业评估认可的生产级模式。
  - 工具调用需要“参数校验→规则拦截→沙箱执行→结果脱敏”的闭环，而不是只在入口检查一次。
- **反对/限制**：
  - 单一企业来源，未取得 Q/KXY CS108—2026 全文；不能声称本作品“通过该评估”。
  - “双沙箱”具体边界未公开，需自行定义并说明差异。
- **置信度**：中高（企业官网 + 评估名称/编号一致；细节未公开）。
- **适用条件**：企业级金融智能体平台。
- **对设计的影响**：D-06 双沙箱定义（工具沙箱 + 分析沙箱）；D-07 生命周期 Hook 点（输入、规划、授权、工具前、工具后、输出、收尾）。

### E05 · Revolut AIR 官方安全说明

- **来源**：Revolut 官方博客与产品页
- **URL**：
  - https://www.revolut.com/blog/post/air-ai-by-revolut/
  - https://www.revolut.com/news/revolut_enters_new_era_of_money_intelligence_with_launch_of_ai_assistant/
- **发布时间**：2026-04-09（发布）
- **类型**：A 级 / 官方产品文档
- **原文摘录**：
  - “Zero data retention: your personal data is never stored by third-party AI partners or used for training.”
  - “Biometric protection: AIR cannot perform sensitive actions without your biometric approval.”
  - “AIR only accesses the data you can already see, such as your transactions, investments, and cards.”
- **支持**：
  - 敏感动作必须有不可绕过的强验证检查点。
  - 数据最小化：Agent 只访问用户可见范围；第三方 LLM 零保留。
- **反对/限制**：
  - 生物识别在竞赛 Demo 中难以真实复现；只能用 TOTP/设备挑战模拟，并在文档中声明。
  - “零保留”是商业承诺，需合同与技术双重保障；本作品仅做本地/可配置。
- **置信度**：高（官方原文）。
- **适用条件**：面向消费者的 AI 银行助手。
- **对设计的影响**：D-08 强验证检查点；D-09 数据最小化与 LLM 上下文脱敏；答辩对标 Revolut。

### E06 · closegate：面向金融 AI Agent 的开源 Policy Gate

- **来源**：PyPI 项目页 + 官方 FAQ
- **URL**：
  - https://pypi.org/project/closegate/
  - https://closegate.neullabs.com/faq/
- **发布时间**：2026（项目页）
- **类型**：B 级 / 开源实现
- **原文摘录**：
  - “closegate is an open-source policy gate, audit log, and human-in-the-loop (HITL) approval framework for finance AI agents. It's the controls layer that goes between an LLM ... and your accounting systems — enforcing segregation of duties (SoD), materiality thresholds, sensitive-account routing, and a hash-chained audit log that an external auditor can replay.”
  - “Every state-changing decision writes an event to an append-only SQLite audit log with the verbatim policy clause text + a JSON-pointer to the rule.”
- **支持**：
  - Policy Gate 必须位于 LLM 与业务系统之间，而不是模型内部。
  - 职责分离（SoD）、重要性阈值、敏感账户路由、哈希链审计、HITL 信封是同一套控制面的组成部分。
  - 审计要保存“命中的政策原文 + 规则指针”，便于外部审计复现。
- **反对/限制**：
  - 面向会计/总账场景，不是零售银行转账；金额阈值与账户模型需重新设计。
  - 开源项目的测试数量（站点称 986 passing tests）不能直接证明本作品质量。
- **置信度**：高（可检查的开源工件与文档）。
- **适用条件**：金融 AI Agent 的控制层。
- **对设计的影响**：D-10 Policy Gate 独立服务；D-11 审计保存 policy_version + rule_id + 原文摘要；D-12 HITL 审批信封字段。

### E07 · 腾讯云开发者社区《为什么你的 AI Agent 审批形同虚设？生产级权限治理 8 步落地法》

- **来源**：腾讯云开发者社区
- **URL**：https://developer.cloud.tencent.com/article/2729892?policyId=1003
- **发布时间**：2026（文章页）
- **类型**：B 级 / 厂商工程实践
- **原文摘录**：
  - “动作分级：auto / single / dual。按可逆性 + 金额分三档：auto：查询、草稿、建工单，错了重来；single：改状态、非资金通知，可逆，单人确认；dual：退款、改预算、删数据、跨市场写，资金或不可逆，四眼原则。”
  - “判断标准：做错了 5 分钟内能否无损撤回？不能就别自动跑。”
- **支持**：
  - 权限分级不能只看金额，还要看可逆性。
  - 不可逆/资金动作需要双人（四眼）或更强控制。
- **反对/限制**：
  - 厂商博客不是监管标准；与赛题的三级分类不完全一致。
  - “5 分钟无损撤回”是经验法则，不是所有银行产品都成立。
- **置信度**：中高（工程实践合理，但非标准）。
- **适用条件**：生产级 Agent 权限治理。
- **对设计的影响**：D-13 赛题三级为对外口径，内部增加 reversibility/dual 作为“不得降低”的附加控制；D-14 卡片挂失/解挂按赛题 RED，即使可逆也不降级。

### E08 · ThinkingBox-Bench：状态化业务流程中的 Agent 可靠性

- **来源**：arXiv 预印本 + Microsoft Command Line 博客
- **URL**：
  - https://arxiv.org/pdf/2608.19741v4
  - https://commandline.microsoft.com/thinkingbox-bench-agent-benchmarking/
- **发布时间**：2026-10（博客称 2026-10-03 发布）
- **类型**：C 级 / 评测基准
- **原文摘录**：
  - “Claude Opus 5 falls from 66.50% pass@1 to 47.53% pass^20, and Kimi-K3 from 57.37% pass@1 to 17.60% pass^20.”
  - “507-task benchmark across five business domains. Each task is graded by multiple executable checks over final state, side effects, and dialogue rather than a single final answer.”
  - “many failed trials terminate cleanly after valid state-changing actions, so response- or tool-call-level checks are insufficient.”
- **支持**：
  - 一次演示成功不等于可靠；必须测 pass^k。
  - 评分要看最终状态与副作用，不能只看回复文本。
- **反对/限制**：预印本，未经过同行评审；任务域不一定等同银行转账。
- **置信度**：高（论文给出具体数字与方法；与 Microsoft 博客一致）。
- **适用条件**：状态化业务 Agent 评测。
- **对设计的影响**：D-15 评测三维（outcome/compliance/process）；D-16 3 个核心场景各跑 20 次，报告 pass^20；D-17 断言数据库最终状态与副作用。

### E09 · MCP-Atlas：真实 MCP 服务器上的工具使用能力基准

- **来源**：arXiv 预印本 + Scale AI 博客
- **URL**：
  - https://arxiv.org/pdf/2602.00933v3
  - https://scale.com/blog/mcp-atlas
- **发布时间**：2026
- **类型**：C 级 / 评测基准
- **原文摘录**：
  - “1,000 natural-language tasks ... spanning 36 real MCP servers and 220 tools.”
  - “Prompts do not specify servers, tools, or parameters, requiring agents to identify relevant tools among semantically plausible distractors and to compose multistep, cross-server workflows.”
  - “scored using a claims-based rubric.”
- **支持**：
  - 工具调用要分三层评：是否决定用工具、是否选对工具、参数是否正确。
  - 多步跨工具编排是主要难点，必须有确定性评测。
- **反对/限制**：通用 MCP 工具集，不是银行核心系统；不能直接套用分数。
- **置信度**：高（论文与厂商博客一致）。
- **适用条件**：MCP/工具型 Agent。
- **对设计的影响**：D-18 工具调用三层指标；D-19 允许工具集 + 语义干扰项测试。

### E10 · DynamicMCPBench：以执行轨迹为 ground truth 的评测

- **来源**：arXiv
- **URL**：https://arxiv.org/html/2607.20531v1
- **发布时间**：2026
- **类型**：C 级 / 评测基准
- **原文摘录**：
  - “the right ground truth for an MCP-agent benchmark is neither the final answer nor a list of tools, but the execution trace.”
  - “scores path-agnostic effects under deterministic replay instead of answers.”
- **支持**：
  - 过程可靠性要从执行轨迹提取信号；确定性回放是审计与评测的共同基础。
- **反对/限制**：路径无关评分需要精心定义 effect；银行场景中部分路径有强合规要求，不能完全路径无关。
- **置信度**：高（方法明确）。
- **适用条件**：MCP Agent 评测。
- **对设计的影响**：D-20 审计事件即评测数据源；D-21 回放器同时服务评测与外部审计。

### E11 · OWASP MCP Top 10 / MCP Security Cheat Sheet

- **来源**：OWASP 官方
- **URL**：
  - https://owasp.org/www-project-mcp-top-10/2025/MCP03-2025%E2%80%93Tool-Poisoning
  - https://cheatsheetseries.owasp.org/cheatsheets/MCP_Security_Cheat_Sheet.html
- **发布时间**：2025（MCP Top 10），持续更新
- **类型**：A 级 / 安全标准组织
- **原文摘录**：
  - “Treat every tool response as untrusted data, including responses from approved servers.”
  - “Use tag stripping and instruction-pattern detection only as additional filtering or alerting measures. They cannot establish that the remaining text is safe.”
  - Tool poisoning 包括 rug pulls、schema poisoning、tool shadowing。
- **支持**：
  - 工具返回不可信；过滤不是安全边界；必须靠授权与执行控制。
  - 工具清单/schema 需要锁定与哈希校验。
- **反对/限制**：偏 MCP 生态；本作品核心工具是内部 API，但同样适用“返回不可信”原则。
- **置信度**：高（OWASP 官方）。
- **适用条件**：所有工具调用型 Agent。
- **对设计的影响**：D-22 信任标签与 taint；D-23 manifest 哈希锁定；D-24 网关授权而非内容过滤作为最终边界。

### E12 · Anthropic《Building Effective Agents》

- **来源**：Anthropic 工程博客
- **URL**：https://www.anthropic.com/engineering/building-effective-agents
- **发布时间**：2024-12（持续引用）
- **类型**：B 级 / 一线厂商工程指南
- **原文摘录**：
  - “workflows are systems where LLMs and tools are orchestrated through predefined code paths.”
  - “agents are systems where LLMs dynamically direct their own processes and tool usage.”
  - 三原则：保持简单、显式展示规划步骤、认真设计 agent-computer interface。
- **支持**：
  - 支付/转账主链路应使用 workflow（固定 DAG），而不是让模型动态改变全局路径。
  - 局部需要判断的节点再嵌入 LLM。
- **反对/限制**：不是金融监管标准；对“动态 Agent”的创新能力展示不利，需要用受约束的动态规划来平衡。
- **置信度**：高（官方工程指南）。
- **适用条件**：通用 Agent 架构选型。
- **对设计的影响**：D-25 顶层固定 DAG + 局部 LLM 决策节点；D-26 只在只读/分析场景允许受限动态计划。

### E13 · LangGraph Interrupts 官方文档

- **来源**：Docs by LangChain
- **URL**：https://docs.langchain.com/oss/python/langgraph/interrupts
- **发布时间**：2026（文档）
- **类型**：A 级 / 框架官方文档
- **原文摘录**：
  - “Interrupts allow you to pause graph execution at specific points and wait for external input before continuing.”
  - “When an interrupt is triggered, LangGraph saves the graph state using its persistence layer and waits indefinitely until you resume execution.”
- **支持**：
  - 中断应保存全量状态，按 thread_id 恢复。
  - 节点边界 checkpoint 是可恢复执行的基础。
- **反对/限制**：
  - 框架在恢复时可能从节点开头重放；副作用节点必须幂等或把副作用移到网关。
  - 本作品不直接依赖 LangGraph，避免框架版本与重放语义风险。
- **置信度**：高（官方文档）。
- **适用条件**：图编排与 HITL。
- **对设计的影响**：D-27 自研最小 DAG 内核，实现 checkpoint/interrupt/resume；D-28 副作用只发生在 Tool Gateway，节点可重放。

### E14 · Stripe Idempotent Requests

- **来源**：Stripe API Reference
- **URL**：https://docs.stripe.com/api/idempotent_requests
- **发布时间**：持续更新
- **类型**：A 级 / 支付基础设施官方文档
- **原文摘录**：
  - “When creating or updating an object, use an idempotency key. Then, if a connection error occurs, you can safely repeat the request without risk of creating a second object or performing the update twice.”
  - “Stripe's idempotency works by saving the resulting status code and body of the first request made for any given idempotency key.”
- **支持**：
  - 资金动作必须双端幂等；重试返回首次结果，而不是再次执行。
- **反对/限制**：Stripe 的实现细节不适用于银行核心；但幂等语义是通用的。
- **置信度**：高（官方文档）。
- **适用条件**：支付/转账 API。
- **对设计的影响**：D-29 网关与账务双端幂等表；D-30 幂等冲突返回 409 而非重复执行。

### E15 · AFAC2026 金融智能创新大赛获奖方案与评审逻辑

- **来源**：中国人民大学科学技术发展部、中国日报网
- **URL**：
  - http://se-office.ruc.edu.cn/xwdt/ab008b896d264ab1937246f21a685a93.htm
  - http://cn.chinadaily.com.cn/a/202609/07/WS6a9e7cd4e4b09a165c7887fd.html
- **发布时间**：2026-09
- **类型**：C 级 / 获奖报道
- **原文摘录**：
  - 一等奖“过目不忘”：面向金融长文档问答，构建“自进化的多路检索、自适应证据压缩与动态复核智能体”。
  - 二等奖“智慧易”：反欺诈鉴别大模型，通过多维度交叉验证识别 AI 造假图片，已签约 100 多家银行一级分行。
  - 报道称大赛强调“真题、真训练、真转化”，让金融 AI 走出 Demo。
- **支持**：
  - 获奖方案共同点：证据检索/交叉验证 + 真实落地，而不是单点 Demo。
  - 评审看重“可转化、可落地”的完成度。
- **反对/限制**：媒体报道不等于评审细则；不能把获奖方案直接复制到银行 Agent 赛道。
- **置信度**：中高（官方高校与媒体一致）。
- **适用条件**：金融 AI 竞赛叙事。
- **对设计的影响**：D-31 证据锚定与复核节点；D-32 答辩强调“可复现、可审计、可试点”，而非功能数量。

### E16 · 雄安 2026 国际金融科技创新技术应用大赛评审维度

- **来源**：经济日报、中国日报网
- **URL**：
  - https://www.jingjiribao.cn/static/detail.jsp?id=668033
  - https://caijing.chinadaily.com.cn/a/202607/10/WS6a50a89da310d709c2fbce80.html
- **发布时间**：2026-07
- **类型**：C 级 / 赛事报道
- **原文摘录**：
  - “‘AI+金融’赛道 134 个参赛项目……61 个优质项目晋级决赛。”
  - “评审从团队综合实力、技术创新能力、产业化落地前景、投资价值、场景适配度五大维度开展综合研判。”
- **支持**：
  - 场景适配度与落地前景是独立评分维度；不能只讲技术创新。
  - 竞争激烈：134→61，必须有清晰差异化。
- **反对/限制**：不同赛事评审维度不能直接套用到深圳赛；仅作叙事参考。
- **置信度**：中高（两家媒体一致）。
- **适用条件**：金融科技竞赛答辩。
- **对设计的影响**：D-33 答辩结构：技术创新（控制面）→ 场景适配（3 场景）→ 落地价值（可复现/可审计）→ 团队执行。

### E17 · WorkBuddy 权限模式与安全沙箱文档

- **来源**：WorkBuddy 官方文档、腾讯云文档
- **URL**：
  - https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Permission-Modes
  - https://www.tencentcloud.com/document/product/1316/84555
- **发布时间**：2026
- **类型**：B 级 / 产品官方文档
- **原文摘录**：
  - “AI 运行于隔离沙箱，并配置文件、命令、网络访问策略。”
  - “启动时仅拥有只读权限，编辑文件、运行命令需显式授权。”
  - 关键行为写入 JSONL 结构化审计日志（第三方拆解文章补充）。
- **支持**：
  - 默认只读、显式授权、沙箱隔离、结构化审计是可复用的产品级模式。
- **反对/限制**：
  - 未验证“WorkBuddy 金融版”存在；通用办公 Agent 的沙箱边界与银行核心不同。
- **置信度**：中高（官方文档 + 第三方拆解一致）。
- **适用条件**：桌面/云端 Agent 安全。
- **对设计的影响**：D-34 默认只读的工具清单；D-35 显式授权与 JSONL 审计；D-36 网络出口默认拒绝。

---

## 3. 证据冲突与裁决

### C1 · 赛题三级分类 vs 腾讯云 auto/single/dual

- **冲突**：
  - 赛题：绿色=纯查询自动；黄色=小额转账/订阅取消/虚拟卡；红色=大额转账/改密/挂失/理财申购。
  - 腾讯云：按“可逆性 + 金额”分 auto/single/dual，强调“5 分钟无损撤回”和四眼原则。
- **裁决**：
  1. **对外口径严格按赛题三级**，不擅自把 RED 降为 YELLOW。
  2. 在三级之上增加**内部动作风险标签**（reversible / irreversible / dual-required），用于选择补偿策略与是否加四眼。
  3. 赛题未覆盖的动作（如修改限额、删除收款人）默认按“不可逆→RED 或拒绝”处理。
- **理由**：附件是最高规则；腾讯云是工程实践，只能加强不能削弱。
- **残余风险**：三级分类较粗，可能出现“金额小但不可逆”的动作被误判为 YELLOW；用内部标签兜底。

### C2 · 动态 Agent 创新 vs 固定 DAG 可靠性

- **冲突**：
  - 赛题鼓励“自主规划任务链路”，创新性评分可能偏好动态 Agent。
  - Anthropic/E08 证据表明，开放式动态路径在状态化业务中可靠性显著下降。
- **裁决**：
  - **资金/写操作主链路 100% 固定 DAG**；LLM 只做意图理解、槽位抽取、计划提议、解释。
  - **只读/分析场景允许受限动态计划**：LLM 从预定义节点库中组合，最多 6 个节点，必须通过 schema 与策略校验；不允许自由生成代码。
  - 答辩明确讲“约束下的自主”：自主发生在意图与计划提议层，不发生在执行与授权层。
- **理由**：40% 任务完成率 + 30% 安全合规优先于“看起来更 Agent”。
- **残余风险**：评委可能认为 DAG 不够“智能”；用跨场景联动、条件分支、澄清追问、错误恢复展示“约束内的智能”。

### C3 · “权限交给模型判断” vs 外部确定性裁决

- **冲突**：
  - 一些 Demo 让 LLM 输出 “risk: high/low” 并据此决定是否确认。
  - E02/E06/E11 明确要求操作授权、调用受控、工具返回不可信；模型输出只是意图表达。
- **裁决**：
  - Policy Gate 是独立进程/模块，输入是结构化事实（金额、日累计、收款人、账户状态、认证等级、taint），输出是**签名许可**（Execution Permit）。
  - LLM 不参与权限裁决，也不能直接调用工具网关。
- **理由**：模型可被注入、可产生幻觉；权限必须可证明、可回归测试。
- **残余风险**：规则维护成本；用策略表 + 单元测试 + 版本号管理。

### C4 · 强验证安全 vs 对话轮次效率

- **冲突**：
  - 30% 安全要求 RED 强验证；30% 交互体验要求对话轮次效率。
  - 每次转账都弹 TOTP 会显著增加摩擦。
- **裁决**：
  - 仅 RED 触发强验证；YELLOW 一次确认；GREEN 零确认。
  - 引入**签名消费授权（Mandate）**：用户一次授权“生日预算 1000 元、商户类别鲜花/蛋糕、截止日期”，后续在该范围内自动执行；超出范围重新确认。
  - 强验证采用“交易挑战”：TOTP + 金额/收款人哈希绑定，防钓鱼与防篡改。
- **理由**：安全边界不降低，同时用 mandate 降低重复确认。
- **残余风险**：mandate 被盗用；用额度、类别、时间窗、一次性 nonce、可撤销与审计兜底。

### C5 · 代码沙箱 vs 不生成代码

- **冲突**：
  - 赛题要求“生成的代码在受限、可监控的逻辑隔离环境中运行”。
  - 但让 LLM 生成任意代码执行是最大攻击面之一。
- **裁决**：
  - 核心资金链路**不生成代码**；账单分析用参数化 SQL/受限表达式，天然消除代码执行攻击面。
  - 仍交付一个**分析沙箱**：子进程 + Node 权限模型 + 超时/内存上限 + 无网络 + 只读输入；用于可选的用户自定义公式。
  - 生产环境建议 gVisor/Firecracker；Demo 明确标注隔离等级与残余风险。
- **理由**：最安全的沙箱是“不执行不可信代码”；同时满足赛题对沙箱的展示要求。
- **残余风险**：Node 权限模型不是强安全边界；在安全自评报告中列为已知风险。

### C6 · Python/FastAPI 建议 vs 本机环境

- **冲突**：
  - 用户建议 Python（FastAPI + LangGraph 或等效）。
  - 本机 `python`/`py`/`python3` 均不可用，`git`、`docker` 也不可用；Node 24.22 + npm 可用，`node:sqlite` 验证通过。
- **裁决**：
  - 默认实现改为 **Node 24 + 零运行时依赖 + 内置 SQLite**，保证“一条命令启动、可复现、可测试”。
  - 架构与语言无关；Policy Gate、DAG、审计、工具网关均为独立模块。
  - 若坚持 Python，需先在 M0 前安装 Python 3.11+，并接受额外的环境风险。
- **理由**：竞赛第一原则是“已实现、可运行、可演示”；环境不可用会直接摧毁复现性。
- **残余风险**：评委可能偏好 Python 生态；在 README 与答辩中解释选型，并强调零依赖可复现。

---

## 4. 未能验证的记录（不得作为设计依据）

### U01 · OmniBank Agents Architecture（Zenodo，2026-01）

- **用户引用**：LLMs propose and explain; tools execute. Policy before action. Evidence by default. Least privilege. Observability and rollback. 中央 Orchestrator + Manager Agents + Tool Agents。
- **检索结果**：在 Zenodo 与通用搜索中未找到对应标题/作者/记录；检索到的是 New Omni Bank 商业网站、OmniBank LEI 记录，以及若干相关但不相同的 Zenodo 论文（如 Typestate-Enforced Agent Loops、PAHA）。
- **处理**：
  - **不引用 OmniBank 作为证据**，避免编造来源。
  - 其核心原则由 E06（Policy Gate/审计）、E11（工具不可信/授权）、E12（workflow vs agent）、E03（人工监督）独立支撑。
  - 答辩中若被问及，可说明“我们参考的是可验证的 Policy Gate 与 OWASP 工具安全原则，不依赖单一未公开论文”。

### U02 · WorkBuddy 金融版

- **用户引用**：AI 访问文件/命令/外部工具需事先授权或安全网关校验；投毒/注入自动拦截；隔离沙箱。
- **检索结果**：验证到 WorkBuddy 通用产品的权限模式、沙箱、只读默认、显式授权、JSONL 审计；未找到“金融版”独立页面。
- **处理**：只引用 E17 通用机制，不声称“金融版”。

### U03 · CIC 场景开放赛

- **检索结果**：找到 CICC 语料数据智能创意大赛、CICC 智能体开放主题黑客松挑战赛；未找到“CIC 场景开放赛”同名赛事。
- **处理**：不引用；改用 AFAC/雄安等可验证赛事。

### U04 · 挑战杯揭榜挂帅评审规则

- **检索结果**：本轮未取得一手评审规则。
- **处理**：不作为设计依据；答辩结构参考 E15/E16 的可验证维度。

---

## 5. 追加检索计划（M0-M5 持续）

| 阶段 | 待检索问题 | 用途 |
|---|---|---|
| M1 | OAuth RAR / capability token / macaroon 在工具授权中的实践 | 强化 Execution Permit 设计 |
| M1 | SQLite append-only trigger、WORM 存储、Merkle anchor 的工程实现 | 审计防篡改 |
| M2 | 中国个人账户转账限额、反诈“断卡”与收款人风险规则 | 政策规则的真实性 |
| M2 | TOTP/WebAuthn 交易挑战的最佳实践 | 强验证交互 |
| M3 | 定时任务/延迟队列的 exactly-once 语义 | 生日场景调度 |
| M4 | Agent 红队测试用例库（prompt injection、tool poisoning、confused deputy） | 对抗测试覆盖 |
| M5 | 金融科技竞赛答辩评分表与获奖项目路演结构 | PPT/视频叙事 |

---

## 6. 证据 → 实现落点（回填）

> 目的：证明架构决策不是“写完就丢”，每条关键证据都能在代码与测试中找到落点。

| 证据 | 实现落点 | 验证 |
|---|---|---|
| E01 T/BFIA 五域 | `security/injection.js`、`policy/gate.js`、`audit/log.js`、`security/redact.js` | 对抗 01–06、16 |
| E02 15 家倡议十项 | `policy/`、`gateway/`、`audit/`、`security/breaker.js` | 44 个测试、18 对抗 |
| E03 NFRA 人工监督/停用 | `security/breaker.js`、`dag/engine.js`、kill switch API | 对抗 15 |
| E04 百信双沙箱/Hook | `gateway/tool_gateway.js`、`sandbox/expression.js` | 沙箱 3 测试、网关 7 测试 |
| E05 Revolut 生物识别/零保留 | `policy/approvals.js` TOTP 挑战、`intent/llm.js` 可切换 | `transfer.test.js` RED |
| E06 closegate Policy Gate | `policy/gate.js`、`policy/permit.js`、`policy/approvals.js` | `permit.test.js`、对抗 07–09 |
| E07 腾讯云可逆性/四眼 | `policy/tiers.js`、`policy/rules.js` | `policy.test.js` 12 条 |
| E08 ThinkingBox pass^k | `eval/run.js`、`eval/report.md` | 3/3 pass^20 |
| E09 MCP-Atlas 工具三层 | `eval/run.js` `expectedTools`、`toolsMatch` | TCA 100% |
| E10 DynamicMCPBench 轨迹 | `audit/log.js`、`audit/replay.js` | 审计/回放测试 |
| E11 OWASP 工具不可信 | `gateway/tool_gateway.js` taint、`dag/nodes/transfer_nodes.js` | 对抗 03 |
| E12 Anthropic workflow/agent | `dag/engine.js` 固定 DAG、`intent/schema.js` 受限提案 | 转账/账单/生日链路 |
| E13 LangGraph 中断/重放 | `dag/engine.js` checkpoint/resume、`gateway/idempotency.js` | 中断/幂等测试 |
| E14 Stripe 幂等 | `gateway/idempotency.js`、`state/ledger.js` 唯一约束 | 对抗 13 |
| E15 AFAC 证据复核 | `security/facts.js`、`security/hallucination.js` | 对抗 10、账单 violations=0 |
| E16 雄安评审五维 | `docs/ppt-outline.md`、`docs/demo-script.md` | 答辩叙事 |
| E17 WorkBuddy 默认只读 | `gateway/manifests.js` read_only、`ui` 安全面板 | 工具清单/审计 |

---

## 7. 版本记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v1 | 2026-10-31 | 初始化；16 张证据卡片；6 组冲突裁决；4 条未验证记录 |
| v2 | 2026-10-31 | 回填“证据 → 实现落点”；实现 44 测试 / 18 对抗 / pass^20 |

