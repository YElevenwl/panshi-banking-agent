# 答辩交付物清单

| 文件 | 内容 | SHA-256 |
|---|---|---|
| `PANSHI-答辩.pptx` | 16 页答辩 PPT；私行审计档案视觉（象牙纸 / 朱砂印章 / 账本版式）；真实运行截图、审批信封、注入拦截、审计校验、真实模型对照 | `DD9671455E3E4DD0E5CFC64FFC480D1ADAC51C71B04BC8A78ACE3BA14B93C338` |
| `PANSHI-demo.mp4` | 4:02、1920×1080、H.264 + AAC；12 段中文 TTS 旁白；新版视觉；含注入拦截、撤销补偿、审计校验 | `48764B513C3B3B4A29BB0D7A3175053121F51A5F7A9D0CB2D9FC3A484C08193F` |
| `audit-sample.json` | 真实转账运行的审计导出：trace/策略/审批/工具/哈希 | `7A27CC0A15E6A21240F51BBDB16DBE9250C0347CCBA59B7644D6CAC6F22531DB` |
| `screenshots/` | 22 张真实 UI 截图，由 Edge 无头浏览器实际运行捕获 | — |
| `ui-preview/` | 新版深色私行 UI 的 4 张真实运行截图（登录/控制台/审批/完成） | — |

## 生成方式

```bash
# 1. 启动演示服务
node src/server.js

# 2. 另开终端，安装构建期工具（不影响运行时零依赖）
cd tools
npm install

# 3. 真实截图
node capture.mjs

# 4. PPT
node make-ppt.mjs

# 5. 视频（先启动服务并完成 capture，再生成 TTS 与帧）
powershell -ExecutionPolicy Bypass -File make-audio.ps1
node make-video-frames.mjs
node make-video.mjs
```

## 说明

- PPTX 已用 LibreOffice 26.8 渲染为 PDF/PNG 并逐页检查：画布 13.333×7.5 英寸，除封面装饰圆外无元素越界；第 6、12、13 页的图片裁切与压字问题已修复。
- 视频已用 ffmpeg 实际编码，并抽取帧检查；中文旁白使用 Windows Huihui TTS。
- 截图对应 `user_1001` 的真实运行状态，不是设计稿或 mockup。
- `ui-preview/` 为 4 张新版 UI 快速预览；`screenshots/`、PPT 与视频已统一为新版视觉。
- 审计截图显示 171 条事件、1 个 Merkle 锚点；`audit-sample.json` 为其中一笔转账 trace 的 33 条事件导出。
- PPT 采用深墨绿/香槟金配色与宋体标题，与新版 UI 一致。
- 公共模型端点评测有限流；真实模型结果见 `../eval/report-real.md`，10/11 用例通过，生日首次 `fetch failed` 为瞬断，定向复测通过。
- 竞赛统一归档目录：`../submission/`，含作品简介 DOCX/PDF、PPTX/PDF、视频、技术文档、源代码、评测报告、截图与审计；入口见 `../submission/00-提交说明.md`。
