# GSSlackRobot

本机常驻运行的 Slack Bot 个人助手，集成本机 Claude Code CLI 和 GitLab Webhook 通知。

## 功能

- **Claude AI 对话**: `@bot` 任意文字即可透传给 Claude AI，流式输出回答
- **帮助**: `@bot help` 显示可用命令
- **GitLab Webhook 通知**: 接收 GitLab 事件推送（Push / MR / Pipeline / Issue / Note），自动发送到指定 Slack 频道

## 架构

```
Slack (Socket Mode)          GitLab (Webhook HTTP)
       │                            │
       ▼                            ▼
┌─────────────┐             ┌──────────────┐
│  Bolt App   │             │ Express :3000│
│ app_mention │             │ POST /gitlab │
└──────┬──────┘             └──────┬───────┘
       │                           │
       ▼                           ▼
┌─────────────┐             ┌──────────────┐
│ Command     │             │ GitLab Event │
│ Router      │             │ Handler      │
│ help/claude │             │ (format+send)│
└──────┬──────┘             └──────────────┘
       │
       ▼
┌──────────────┐
│ Claude CLI   │
│ 子进程        │
└──────────────┘
```

Socket Mode（Bolt）和 Webhook HTTP（Express）在同一进程并行运行，共享 Slack WebClient。

## 快速开始

### 1. Slack App 配置

在 [api.slack.com/apps](https://api.slack.com/apps) 创建 App：

- **Bot Token Scopes**: `app_mentions:read`, `chat:write`, `channels:history`
- **App-Level Token**: 勾选 `connections:write`
- **Event Subscriptions**: 订阅 `app_mention`
- 开启 **Socket Mode**

### 2. 环境变量

```bash
cp .env.example .env
```

编辑 `.env` 填入真实值：

```bash
# Slack 配置 (必填)
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...

# Claude 配置 (可选)
CLAUDE_COMMAND=claude
CLAUDE_TIMEOUT_MS=300000

# GitLab Webhook (可选，设置 GITLAB_NOTIFY_CHANNEL 后启用)
GITLAB_NOTIFY_CHANNEL=C0123456789
GITLAB_WEBHOOK_PORT=3000
GITLAB_WEBHOOK_SECRET=your-secret
GITLAB_EVENTS_PUSH=true
GITLAB_EVENTS_MR=true
GITLAB_EVENTS_PIPELINE=true
GITLAB_EVENTS_ISSUE=true
GITLAB_EVENTS_NOTE=true
```

### 3. 安装并运行

```bash
npm install
npm run dev      # 开发模式（热重载）
npm run build    # 编译
npm start        # 生产模式
```

### 4. GitLab Webhook

在 GitLab 项目 Settings > Webhooks 中添加：

- **URL**: `http://<你的IP>:3000/gitlab`
- **Secret Token**: 与 `GITLAB_WEBHOOK_SECRET` 一致
- **Triggers**: Push / Merge Request / Pipeline / Issues / Comments

## 项目结构

```
src/
├── app.ts                    # 入口：加载配置 → 启动 Bolt + Webhook
├── config/
│   ├── schema.ts             # 配置类型定义 (AppConfig 接口)
│   ├── index.ts              # loadConfig() 环境变量加载 + 验证
│   └── env-validator.ts      # 环境变量有效性验证
├── commands/
│   ├── index.ts              # app_mention 事件 → help 或 Claude 透传
│   └── help.ts               # 帮助信息
├── services/
│   └── claude.ts             # Claude CLI 子进程 (AsyncGenerator + stream-json)
├── webhooks/
│   ├── server.ts             # Express Webhook 服务器 (GitLab → Slack)
│   └── gitlab.ts             # GitLab 事件格式化 (Push/MR/Pipeline/Issue/Note)
└── utils/
    ├── logger.ts             # 彩色控制台日志
    └── message.ts            # 文本截断/分段
```

## 技术栈

- **TypeScript** + ES Modules
- **@slack/bolt** — Socket Mode 连接 Slack
- **Express** — 接收 GitLab Webhook
- **Claude Code CLI** — AI 对话（子进程 stream-json）
