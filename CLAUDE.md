# CLAUDE.md

本文件为 Claude Code 提供项目上下文，帮助理解代码库和开发规范。

## 项目概述

GSSlackRobot 是一个中文 Slack Bot 个人助手，本机常驻运行，集成本机 Claude Code CLI。用户 @bot 任意文字即可透传给 Claude AI 对话。

- **语言**: TypeScript (strict mode) + ES2022 Modules
- **运行时**: Node.js
- **入口**: `src/app.ts`

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

## 环境变量

完整清单（变量名、默认值、说明）见 `.env.example` 与 `docs/setup-guide.md`；类型定义见 `src/config/schema.ts`。必填项只有 `SLACK_BOT_TOKEN` 和 `SLACK_APP_TOKEN`，其余均为可选并带默认值。

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
- **命令路由**: `help` 显示帮助，`commands` 列出 Claude Commands，`list-milestones`/`list-issues`/`daily-report`/`reset-daily-report`/`create-milestone <版本号> [结束日期]` 为 GitLab 命令（需配置），`gemini <问题>` 和 `gemini-draw <描述>` 为 Gemini 命令（需配置），其余输入透传 Claude
- **Claude SDK 集成**: 通过 Claude Agent SDK 的 `query()` 流式调用，`includePartialMessages` 增量输出；不显式指定 model/effort，跟随本机 Claude Code 默认配置
- **Slack 图片附件**: `app_mention` 事件的 `files` 字段未在 Bolt 类型中定义，需用 `(event as any).files` 访问；图片通过 bot token + `url_private_download` 下载到内存，**不落临时文件**。bot token 必须有 `files:read` scope，否则 Slack 返回 200 OK + `text/html` 登录页（非 401）——`downloadSlackImages` 会校验 `content-type` 并 warn 提示
- **Slack 图片预处理与多模态透传**: 下载图片后用 `sharp` 归一化（最大 1568px、转 PNG），转 base64 后通过 `askClaude(text, images, ...)` 以 Claude Agent SDK 的多模态 `content block`（`{type:'image', source:{type:'base64', ...}}`）发给 Claude，让模型真正"看到"图片，不依赖 Read 工具
- **GitLab Webhook**: 设置 `GITLAB_NOTIFY_CHANNEL` 后自动启动 Express HTTP 服务器，接收 GitLab 事件推送并转发到 Slack 频道
- **Jenkins @channel 补发**: 设置 `JENKINS_NOTIFY_CHANNEL` 后，bot 注册 Slack `message` 事件 handler 监听该频道。频道里出现新的顶层消息（且非 bot 自己发的、非 message_changed/deleted、非 thread 回复）时，自动在同频道独立发一条 `<!channel>` 触发推送提醒。频道纯净度（只用于 Jenkins App 推送）是运维约定，不在代码层校验。需要 Slack App 订阅 `message.channels`（或 `message.groups`）event，并加 `channels:history`（或 `groups:history`）scope，bot 也需 invite 进该频道。
- **Slack Bolt 事件 / 类型 quirks**: `chat.postMessage` 的 `link_names` 是 `boolean | undefined`（不是 Slack REST 文档里写的 `0|1`，传数字编不过）；`message` 事件**没有** `subtype: 'message_replied'`，thread 回复是带 `thread_ts` 的普通 message，应用 `thread_ts !== ts` 过滤而非 subtype；订阅 `message.channels/groups` 后 bot **必须**被 invite 进目标频道，否则 Slack 静默丢事件且无任何错误信号
- **定时调度模式**: scheduler 使用 setTimeout 单次调度（过点立即执行，否则定时等待），程序每日重启
- **配置变更同步**: 新增/修改环境变量配置或 Slack OAuth scope 时，需同步更新 `docs/setup-guide.md` 与 `.env.example` 两处
- **设计/计划文档**: 非平凡功能走 `docs/superpowers/specs/<YYYY-MM-DD>-<feature>-design.md`（设计） → `docs/superpowers/plans/<YYYY-MM-DD>-<feature>.md`（实现计划）流程
- **Slash 前缀转义**: `handleClaude` 在透传给 Claude Agent SDK 前，对以 `/` 开头的 prompt 前置一个空格，避免 SDK 把 `/foo:bar` 当作 skill 调用返回 `Unknown skill`；例外由 `src/commands/index.ts` 的 `SKILL_PREFIXES` 表驱动（`toPrompt()`）：`头脑风暴`→`/superpowers:brainstorming`、`bug修复`→`/superpowers:systematic-debugging`、`归纳总结`→`/claude-md-management:claude-md-improver`、`压缩`→`/compact`（内建命令，压缩当前 thread 会话上下文）。命中条件是消息**等于**触发词或以「触发词+空格」开头，替换后保持斜杠开头从而真正触发（不前置空格）。新增映射只需往表里加一行。**注意**：skill 能被解析的前提是 `src/services/claude.ts` 的 SDK `options` 设了 `settingSources: ['user']`——否则 SDK 处于隔离模式不读 `~/.claude` 的 `enabledPlugins`，任何 `/plugin:skill` 都会返回 `Unknown skill`
- **Claude 完成通知**: `handleClaude` 透传链路在成功结束（`✅`）或失败（`❌`）后，会在同一 thread 独立 `postMessage` 一条 `<@user> ✅|❌` 消息，用于触发 Slack 推送通知；该行为仅作用于 Claude，不涉及 Gemini 等其他命令；`postMessage` 自身失败仅 `log.warn`，不中断主流程
- **命令变更同步**: 新增/修改/删除命令时，需同步更新以下位置：
  1. `src/commands/help.ts` — 帮助文本中的命令列表
  2. `src/commands/index.ts` — `COMMAND_ALIASES` 别名 + 路由正则 + handler 分支
  3. `CLAUDE.md` — 命令路由说明
  4. `docs/setup-guide.md` — 中文配置指南中的命令列表
