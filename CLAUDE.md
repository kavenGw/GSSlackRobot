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
│   └── gemini-draw.ts        # Gemini 画图生成
├── scheduler/
│   ├── daily-report.ts       # 每日简报定时调度
│   └── jenkins-cron.ts       # Jenkins Job 定时触发
├── services/
│   ├── claude.ts             # Claude CLI 子进程 (AsyncGenerator + stream-json)
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

- **模块导入**: 使用 ES Module，导入路径必须带 `.js` 扩展名（如 `from './schema.js'`）
- **类型导入**: 纯类型使用 `import type { ... }` 语法
- **异步模式**: 使用 async/await 和 Promise，不使用回调；流式场景使用 AsyncGenerator + `for await`
- **错误处理**: Command handler 用 try-catch 包裹，错误消息发送到 Slack thread
- **Slack 交互**: 所有回复必须包含 `thread_ts` 以保持线程
- **消息限制**: 单条消息最大 3800 字符，超出使用 `splitToBlocks()` 分段发送
- **节流更新**: 流式输出场景下，`chat.update()` 最小间隔 500ms

## 环境变量

### 必填参数 (启动时验证)

| 变量 | 说明 | 格式要求 |
|------|------|---------|
| `SLACK_BOT_TOKEN` | Slack Bot Token | 必须以 `xoxb-` 开头 |
| `SLACK_APP_TOKEN` | Slack App Token | 必须以 `xapp-` 开头 |

### 可选参数 (带默认值)

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `CLAUDE_COMMAND` | `claude` | Claude CLI 命令路径 |
| `CLAUDE_TIMEOUT_MS` | `300000` | Claude 超时 (正整数, 上限 3600000ms) |
| `ANTHROPIC_BASE_URL` | 无 | Anthropic API Base URL (若设置需有效 URL) |
| `ANTHROPIC_AUTH_TOKEN` | 无 | Anthropic Auth Token (若设置不可为占位符) |
| `CLAUDE_PROJECT_DIR` | 无 | Claude 项目目录 |
| `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS` | `false` | 跳过 Claude 权限检查 |
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
   - 超时时间正数且不超过 1 小时

验证失败时抛出 `EnvValidationError`，输出所有错误详情后 `process.exit(1)` 退出。

## 关键设计注意事项

- **配置统一使用 env**: 所有配置通过环境变量加载，不使用配置文件，通过 `getConfig()` 获取单例
- **命令路由**: `help` 显示帮助，`commands` 列出 Claude Commands，`list-milestones`/`list-issues`/`daily-report`/`create-milestone <版本号> [结束日期]` 为 GitLab 命令（需配置），`gemini <问题>` 和 `gemini-draw <描述>` 为 Gemini 命令（需配置），其余输入透传 Claude CLI
- **Claude CLI 集成**: 通过子进程调用，使用 `--output-format stream-json` 参数，输出为 JSON Lines 格式
- **GitLab Webhook**: 设置 `GITLAB_NOTIFY_CHANNEL` 后自动启动 Express HTTP 服务器，接收 GitLab 事件推送并转发到 Slack 频道
- **定时调度模式**: scheduler 使用 setTimeout 单次调度（过点立即执行，否则定时等待），程序每日重启
- **配置变更同步**: 新增/修改环境变量配置时，需同步更新 `CLAUDE.md`、`README.md`、`.env.example` 三处
