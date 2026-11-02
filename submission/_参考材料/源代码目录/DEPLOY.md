# 部署说明 · 磐石银行智能体

## 1. 运行环境

- Node.js ≥ 24（使用内置 `node:sqlite`、原生 HTTP/SSE，无运行时第三方依赖）
- 无需 `npm install`
- 默认监听 `8787`，数据写入 `data/panshi.db`

## 2. 本地启动

```bash
node src/server.js
```

打开 `http://localhost:8787`，演示账号 `user_1001` 林晓。

Windows PowerShell 重置演示数据：

```powershell
Remove-Item -Force data\panshi.db,data\panshi.db-wal,data\panshi.db-shm -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force data\audit -ErrorAction SilentlyContinue
node src/server.js
```

## 3. 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `8787` | HTTP 服务端口 |
| `PANSHI_DB` | `data/panshi.db` | SQLite 数据库路径 |
| `PANSHI_DEMO_NOW` | `2026-10-31T09:00:00+08:00` | 演示固定时间 |
| `PANSHI_DEMO_MODE` | `1` | `0` 关闭演示账号/TOTP 辅助接口 |
| `PANSHI_LLM` | `mock` | `mock` 或 `openai` |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible 端点 |
| `OPENAI_CHAT_PATH` | `/chat/completions` | 对话接口路径 |
| `OPENAI_MODEL` | `gpt-4.1-mini` | 模型名 |
| `OPENAI_API_KEY` | 空 | 模型 Key；公共端点可为空 |
| `PANSHI_LLM_STRICT` | `0` | `1` 时禁用 Mock 回退 |
| `PANSHI_LLM_MIN_INTERVAL_MS` | `0` | 模型调用最小间隔，公共端点建议 `46000` |
| `PANSHI_PERMIT_SECRET` | 开发默认值 | **生产必须替换**，用于 Permit HMAC |
| `PANSHI_SESSION_SECRET` | 开发默认值 | **生产必须替换**，用于会话签名 |

## 4. 健康检查

```bash
curl http://localhost:8787/api/health
```

预期返回 `ok: true`、`tools: 24`。

## 5. 测试与评测

```bash
npm test                  # 44 项单元 + 集成测试
npm run adversarial       # 18 条安全对抗
npm run eval              # 3 个核心场景各重复 20 次，输出 eval/report.md
npm run audit:verify      # 审计哈希链校验
```

## 6. Docker（配置已提供，本机未验证）

```bash
docker compose up --build
```

或：

```bash
docker build -t panshi-bank-agent .
docker run --rm -p 8787:8787 -v panshi-data:/app/data panshi-bank-agent
```

生产部署时应通过环境变量注入 `PANSHI_PERMIT_SECRET`、`PANSHI_SESSION_SECRET`，并挂载持久化卷保存 `data/`。

## 7. 公网演示

原型可用反向代理或隧道映射 `8787`，但必须满足：

- 只暴露演示环境，不接入真实银行核心；
- 设置访问控制，避免公开演示被任意重置或滥用；
- 不对外提供真实密钥、生产数据库或真实客户数据。

当前竞赛演示使用 Cloudflare Quick Tunnel，仅用于评审访问，不作为生产部署方案。

## 8. 生产化差距

- 银行核心、清算、对账仍需银行适配层；
- TOTP 需替换为 WebAuthn / FaceID + 设备绑定；
- SQLite 单进程需升级为分布式数据库、消息队列与 WORM 审计；
- Permit/补偿密钥需迁移到 HSM/KMS；
- 公共模型端点需替换为银行批准的模型服务与 Key。
