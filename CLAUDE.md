# CLAUDE.md

本文件为 Claude Code 提供项目上下文，帮助理解代码库和开发规范。

## 项目概述

GSSlackRobot 是一个中文 Slack Bot 个人助手，本机常驻运行，集成本机 Claude Code CLI。用户 @bot 任意文字即可透传给 Claude AI 对话。

- **语言**: TypeScript (strict mode) + ES2022 Modules
- **运行时**: Node.js
- **入口**: `src/app.ts`

## 常用命令

```bash
npm run dev      # 开发模式 (tsx watch 热重载)
npm run build    # 编译 TypeScript → dist/
npm start        # 生产模式 (node dist/app.js)
```

## 项目结构

```
src/
├── app.ts                    # 入口：加载配置 → 启动 Bolt
├── config/
│   ├── schema.ts             # 配置类型定义 (AppConfig 接口)
│   ├── index.ts              # loadConfig() 环境变量加载 + 验证调用
│   └── env-validator.ts      # 环境变量有效性验证 (格式/范围/占位符检测)
├── commands/
│   ├── index.ts              # app_mention 事件 → help 或 Claude 透传
│   ├── help.ts               # 帮助信息
│   ├── daily-report.ts       # 每日简报
│   ├── list-milestones.ts    # 列出活跃 milestones
│   ├── list-milestone-issues.ts # 列出 milestone issues
│   ├── create-milestone.ts   # 创建 milestone（含起止日期）+ 杂项 issue
│   ├── gemini.ts             # Gemini AI 对话
│   ├── gemini-draw.ts        # Gemini 画图生成
│   └── model.ts              # 模型/effort 切换命令
├── scheduler/
│   ├── daily-report.ts       # 每日简报定时调度
│   └── jenkins-cron.ts       # Jenkins Job 定时触发
├── services/
│   ├── claude.ts             # Claude CLI 子进程 (AsyncGenerator + stream-json)
│   ├── settings.ts           # 运行时设置持久化 (model/effort → data/settings.json)
│   ├── gitlab.ts             # GitLab REST API
│   ├── jenkins.ts            # Jenkins Script Console + Build API
│   └── gemini.ts             # Google Gemini API
├── webhooks/
│   ├── server.ts             # Express Webhook 服务器 (GitLab → Slack)
│   └── gitlab.ts             # GitLab 事件格式化 (Push/MR/Pipeline/Issue/Note)
└── utils/
    ├── logger.ts             # 彩色控制台日志
    └── message.ts            # 文本截断/分段
```

## 编码规范

- **测试策略**: 无单元测试套件；验证 = `npm run build`（tsc 通过）+ 必要时 Slack 端到端手动测试
- **模块导入**: 使用 ES Module，导入路径必须带 `.js` 扩展名（如 `from './schema.js'`）
- **类型导入**: 纯类型使用 `import type { ... }` 语法
- **异步模式**: 使用 async/await 和 Promise，不使用回调；流式场景使用 AsyncGenerator + `for await`
- **错误处理**: Command handler 用 try-catch 包裹，错误消息发送到 Slack thread
- **Slack 交互**: 所有回复必须包含 `thread_ts` 以保持线程
- **消息限制**: 单段最大字符数由 `SLACK_MAX_BLOCK_TEXT` 控制（默认 2000），超出由 `splitToBlocks()` 分段发送；流式 `safeUpdate` 使用 `SegmentTracker` 跟踪每段 ts/lastContent，所有 Slack API 调用经 `safeChat` 兜底，`msg_too_long` 仅记 warn 不中断
- **消息发送函数选择**: 普通文本回复用 `safePost(client, channel, text, threadTs, maxBlockText)`；流式增量更新用 `safeUpdate(..., tracker, maxBlockText)`；Block Kit 结构化消息（每日简报）用 `postBlocks(client, channel, blocks, threadTs)`；短固定文本通知（如 `<@user> ✅` 这类不会超长的提示）直接用 `client.chat.postMessage`，无需分段（`chat.update` 推送不可靠，分段对短文本是多余的）
- **节流更新**: 流式输出场景下，`chat.update()` 最小间隔 500ms
- **日志接口**: `src/utils/logger.ts` 导出 `log` 对象，方法：`info/warn/error/startup/incoming/claudeStart/claudeDone/reply/help/webhook/webhookServer/logSaved`

## 环境变量

### 必填参数 (启动时验证)

| 变量 | 说明 | 格式要求 |
|------|------|---------|
| `SLACK_BOT_TOKEN` | Slack Bot Token | 必须以 `xoxb-` 开头 |
| `SLACK_APP_TOKEN` | Slack App Token | 必须以 `xapp-` 开头 |

### 可选参数 (带默认值)

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `SLACK_MAX_BLOCK_TEXT` | `2000` | Slack 单段最大字符数（100..4000，过大易触发 `msg_too_long`） |
| `ANTHROPIC_BASE_URL` | 无 | Anthropic API Base URL (若设置需有效 URL) |
| `ANTHROPIC_AUTH_TOKEN` | 无 | Anthropic Auth Token (若设置不可为占位符) |
| `CLAUDE_PROJECT_DIR` | 无 | Claude 项目目录 |
| `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS` | `true` | 跳过 Claude 权限检查 |
| `CLAUDE_HTTP_PROXY` | 无 | Claude CLI HTTP 代理地址 |
| `CLAUDE_HTTPS_PROXY` | 无 | Claude CLI HTTPS 代理地址 |
| `GITLAB_NOTIFY_CHANNEL` | 无 | GitLab 通知 Slack 频道 ID（设置后启用 Webhook） |
| `GITLAB_WEBHOOK_PORT` | `3000` | Webhook 监听端口 |
| `GITLAB_WEBHOOK_SECRET` | 无 | GitLab Webhook Secret Token |
| `GITLAB_EVENTS_PUSH` | `true` | Push 事件通知开关 |
| `GITLAB_EVENTS_MR` | `true` | MR 事件通知开关 |
| `GITLAB_EVENTS_PIPELINE` | `true` | Pipeline 事件通知开关 |
| `GITLAB_EVENTS_ISSUE` | `true` | Issue 事件通知开关 |
| `GITLAB_EVENTS_NOTE` | `true` | Note 事件通知开关 |
| `GITLAB_API_URL` | 无 | GitLab API 基础 URL（三个都设置时启用 GitLab 命令） |
| `GITLAB_TOKEN` | 无 | GitLab Personal Access Token |
| `GITLAB_PROJECT_ID` | 无 | GitLab 项目 ID |
| `JENKINS_URL` | 无 | Jenkins 基础 URL（三个都设置时启用 Jenkins 集成） |
| `JENKINS_USERNAME` | 无 | Jenkins 用户名 |
| `JENKINS_API_TOKEN` | 无 | Jenkins API Token |
| `JENKINS_CRON_JOBS` | 无 | Jenkins 定时任务（格式：`JobName HH:MM[,...]`） |
| `JENKINS_NOTIFY_CHANNEL` | 无 | Jenkins 通知 Slack 频道 ID（设置后启用 bot 自动 @channel 补发功能） |
| `SINGLETON_PORT` | `19280` | 单实例检测端口 |
| `GEMINI_API_KEY` | 无 | Google AI Studio API Key（设置后启用 gemini 命令） |
| `GEMINI_MODEL` | `gemini-2.0-flash` | Gemini 模型名 |
| `GEMINI_IMAGE_MODEL` | `gemini-3-pro-image-preview` | Gemini 画图模型名 |

### 环境变量验证机制

`loadConfig()` 执行两阶段验证：

1. **存在性检查** (`validateRequiredEnvVars`): 确认必填环境变量已设置
2. **有效性检查** (`validateConfig`): 验证值的格式和范围
   - Token 前缀格式验证
   - URL 格式必须为有效的 HTTP/HTTPS（若设置）
   - Token 不能是占位符值

验证失败时抛出 `EnvValidationError`，输出所有错误详情后 `process.exit(1)` 退出。

## 关键设计注意事项

- **配置统一使用 env**: 所有配置通过环境变量加载，不使用配置文件，通过 `getConfig()` 获取单例
- **命令路由**: `help` 显示帮助，`commands` 列出 Claude Commands，`model [模型] [effort]`/`effort [级别]` 切换 Claude 模型和 effort（持久化到 `data/settings.json`），`list-milestones`/`list-issues`/`daily-report`/`reset-daily-report`/`create-milestone <版本号> [结束日期]` 为 GitLab 命令（需配置），`gemini <问题>` 和 `gemini-draw <描述>` 为 Gemini 命令（需配置），其余输入透传 Claude CLI（支持 `opus/sonnet/haiku` 前缀单次指定模型）
- **Claude CLI 集成**: 通过子进程调用，使用 `--output-format stream-json` 参数，输出为 JSON Lines 格式。支持 `--model`（opus/sonnet/haiku）和 `--effort`（max/high/medium/low）参数
- **Slack 图片附件**: `app_mention` 事件的 `files` 字段未在 Bolt 类型中定义，需用 `(event as any).files` 访问；图片通过 bot token + `url_private_download` 下载到内存，**不落临时文件**。bot token 必须有 `files:read` scope，否则 Slack 返回 200 OK + `text/html` 登录页（非 401）——`downloadSlackImages` 会校验 `content-type` 并 warn 提示
- **Slack 图片预处理与多模态透传**: 下载图片后用 `sharp` 归一化（最大 1568px、转 PNG），转 base64 后通过 `askClaude(text, images, ...)` 以 Claude Agent SDK 的多模态 `content block`（`{type:'image', source:{type:'base64', ...}}`）发给 Claude，让模型真正"看到"图片，不依赖 Read 工具
- **运行时设置**: `data/settings.json` 存储 Claude 模型和 effort 偏好，启动时加载，通过 Slack 命令动态修改
- **GitLab Webhook**: 设置 `GITLAB_NOTIFY_CHANNEL` 后自动启动 Express HTTP 服务器，接收 GitLab 事件推送并转发到 Slack 频道
- **Jenkins @channel 补发**: 设置 `JENKINS_NOTIFY_CHANNEL` 后，bot 注册 Slack `message` 事件 handler 监听该频道。频道里出现新的顶层消息（且非 bot 自己发的、非 message_changed/deleted、非 thread 回复）时，自动在同频道独立发一条 `<!channel>` 触发推送提醒。频道纯净度（只用于 Jenkins App 推送）是运维约定，不在代码层校验。需要 Slack App 订阅 `message.channels`（或 `message.groups`）event，并加 `channels:history`（或 `groups:history`）scope，bot 也需 invite 进该频道。
- **定时调度模式**: scheduler 使用 setTimeout 单次调度（过点立即执行，否则定时等待），程序每日重启
- **配置变更同步**: 新增/修改环境变量配置或 Slack OAuth scope 时，需同步更新 `CLAUDE.md`、`docs/setup-guide.md`、`.env.example` 三处
- **设计/计划文档**: 非平凡功能走 `docs/superpowers/specs/<YYYY-MM-DD>-<feature>-design.md`（设计） → `docs/superpowers/plans/<YYYY-MM-DD>-<feature>.md`（实现计划）流程
- **Slash 前缀转义**: `handleClaude` 在透传给 Claude Agent SDK 前，对以 `/` 开头的 prompt 前置一个空格，避免 SDK 把 `/foo:bar` 当作 skill 调用返回 `Unknown skill`
- **Claude 完成通知**: `handleClaude` 透传链路在成功结束（`✅`）或失败（`❌`）后，会在同一 thread 独立 `postMessage` 一条 `<@user> ✅|❌` 消息，用于触发 Slack 推送通知；该行为仅作用于 Claude，不涉及 Gemini 等其他命令；`postMessage` 自身失败仅 `log.warn`，不中断主流程
- **命令变更同步**: 新增/修改/删除命令时，需同步更新以下位置：
  1. `src/commands/help.ts` — 帮助文本中的命令列表
  2. `src/commands/index.ts` — `COMMAND_ALIASES` 别名 + 路由正则 + handler 分支
  3. `CLAUDE.md` — 命令路由说明
  4. `docs/setup-guide.md` — 中文配置指南中的命令列表
