# CLAUDE.md

本文件为 Claude Code 提供项目上下文，帮助理解代码库和开发规范。

## 项目概述

GSSlackRobot 是一个中文 Slack Bot 个人助手，本机常驻运行，集成自建 GitLab、Jenkins 和本机 Claude Code CLI。

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
├── app.ts                    # 入口：加载配置 → 启动 Bolt + Webhook
├── config/
│   ├── schema.ts             # 配置类型定义 (AppConfig 接口)
│   ├── index.ts              # loadConfig() 环境变量加载 + 验证调用
│   └── env-validator.ts      # 环境变量有效性验证 (格式/范围/占位符检测)
├── commands/
│   ├── index.ts              # app_mention 事件 → 正则路由分发
│   ├── help.ts               # 帮助信息
│   ├── issue.ts              # GitLab 创建 issue
│   ├── brainstorm.ts         # Claude 流式输出 + 节流更新 + 消息分段
│   ├── version-status.ts     # Milestone issue 分组展示
│   ├── jenkins.ts            # 触发 Jenkins 构建
│   └── daily-report.ts       # 每日简报 (Jenkins + GitLab + Claude 三步流水线)
├── services/
│   ├── gitlab.ts             # GitLab REST API v4 (native fetch)
│   ├── jenkins.ts            # Jenkins Remote API (Basic Auth + 轮询)
│   └── claude.ts             # Claude CLI 子进程 (AsyncGenerator + stream-json)
├── webhooks/
│   ├── server.ts             # Express HTTP 服务 (接收 GitLab Webhook)
│   └── gitlab.ts             # 5 种事件格式化 + 开关过滤
└── utils/
    └── message.ts            # 文本截断/分段 + Block Kit 格式化
```

## 编码规范

- **模块导入**: 使用 ES Module，导入路径必须带 `.js` 扩展名（如 `from './schema.js'`）
- **类型导入**: 纯类型使用 `import type { ... }` 语法
- **异步模式**: 使用 async/await 和 Promise，不使用回调；流式场景使用 AsyncGenerator + `for await`
- **错误处理**: Command handler 用 try-catch 包裹，错误消息发送到 Slack thread
- **Slack 交互**: 所有回复必须包含 `thread_ts` 以保持线程；使用 Block Kit 富格式
- **消息限制**: 单条消息最大 3800 字符，超出使用 `splitToBlocks()` 分段发送
- **节流更新**: 流式输出场景下，`chat.update()` 最小间隔 500ms

## 环境变量

### 必填参数 (启动时验证)

| 变量 | 说明 | 格式要求 |
|------|------|---------|
| `SLACK_BOT_TOKEN` | Slack Bot Token | 必须以 `xoxb-` 开头 |
| `SLACK_APP_TOKEN` | Slack App Token | 必须以 `xapp-` 开头 |
| `GITLAB_TOKEN` | GitLab 私有 Token | 非空，不可为占位符 |
| `JENKINS_USER` | Jenkins 用户名 | 非空 |
| `JENKINS_TOKEN` | Jenkins API Token | 非空，不可为占位符 |

### 可选参数 (带默认值)

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `GITLAB_URL` | `https://gitlab.example.com` | GitLab 实例 URL (需有效 HTTP/HTTPS) |
| `GITLAB_DEFAULT_PROJECT` | `namespace/project` | 默认项目路径 (如 "group/project") |
| `JENKINS_URL` | `https://jenkins.example.com` | Jenkins 实例 URL (需有效 HTTP/HTTPS) |
| `JENKINS_JOBS` | 内置默认 | Jenkins Job 映射 JSON |
| `CLAUDE_COMMAND` | `claude` | Claude CLI 命令路径 |
| `CLAUDE_TIMEOUT_MS` | `300000` | Claude 超时 (正整数, 上限 3600000ms) |
| `ANTHROPIC_BASE_URL` | 无 | Anthropic API Base URL (若设置需有效 URL) |
| `ANTHROPIC_AUTH_TOKEN` | 无 | Anthropic Auth Token (若设置不可为占位符) |
| `CLAUDE_PROJECT_DIR` | 无 | Claude 项目目录 |
| `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS` | `false` | 跳过 Claude 权限检查 |
| `WEBHOOK_PORT` | `4567` | Webhook 监听端口 (1-65535) |
| `GITLAB_WEBHOOK_SECRET` | 空 | GitLab Webhook Secret (空则跳过验证) |
| `WEBHOOK_NOTIFY_CHANNEL` | `#dev-notifications` | Webhook 通知频道 |
| `WEBHOOK_EVENT_PUSH` | `true` | Push 事件开关 |
| `WEBHOOK_EVENT_MERGE_REQUEST` | `true` | MR 事件开关 |
| `WEBHOOK_EVENT_PIPELINE` | `true` | Pipeline 事件开关 |
| `WEBHOOK_EVENT_ISSUE` | `true` | Issue 事件开关 |
| `WEBHOOK_EVENT_NOTE` | `false` | Note 事件开关 |

### 环境变量验证机制

`loadConfig()` 执行两阶段验证：

1. **存在性检查** (`validateRequiredEnvVars`): 确认所有必填环境变量已设置
2. **有效性检查** (`validateConfig`): 验证值的格式和范围
   - URL 格式必须为有效的 HTTP/HTTPS
   - Token 不能是占位符值 (如 `your_token_here`, `xxx`, `placeholder`, `TODO`)
   - 端口号范围 1-65535
   - 超时时间正数且不超过 1 小时

验证失败时抛出 `EnvValidationError`，输出所有错误详情后 `process.exit(1)` 退出。

## 关键设计注意事项

- **配置统一使用 env**: 所有配置通过环境变量加载，不使用配置文件，通过 `getConfig()` 获取单例
- **Command 路由**: 基于正则表达式顺序匹配，匹配后 `return` 阻止继续，新增命令在 `commands/index.ts` 注册
- **Claude CLI 集成**: 通过子进程调用，使用 `--output-format stream-json` 参数，输出为 JSON Lines 格式
- **Jenkins 轮询**: 队列轮询 60 次 x 2s (2 分钟超时)，构建完成轮询 180 次 x 5s (15 分钟超时)
- **GitLab API**: 使用 native fetch，`per_page=100`，Issue 状态字段为 `opened`/`closed`
- **Webhook 与 Bolt 同进程**: Socket Mode 和 Express HTTP 在同一 Node.js 进程并行运行，共享 Slack WebClient
