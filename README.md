# GSSlackRobot

本机常驻运行的 Slack Bot 个人助手，集成本机 Claude Code CLI 和 GitLab Webhook 通知。

## 功能

- **Claude AI 对话**: `@bot` 任意文字即可透传给 Claude AI，流式输出回答
- **帮助**: `@bot help` 显示可用命令
- **Gemini AI 对话**: `@bot gemini <问题>` 使用 Gemini 模型回答问题
- **Gemini 画图**: `@bot gemini-draw <描述>` 用 Gemini 画图模型生成图像
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

### 2. GitLab 配置

#### API 访问

在 GitLab 中获取以下凭证：

1. **Personal access token**: 进入 User Settings > Access Tokens，创建 token 并勾选 `api` scope
2. **Project ID**: 项目首页右侧或 Settings > General 中查看
3. **GitLab URL**: 你的 GitLab 实例地址，如 `https://gitlab.example.com`

| 变量 | 说明 |
|------|------|
| `GITLAB_API_URL` | GitLab API 地址，如 `https://gitlab.example.com/api/v4` |
| `GITLAB_TOKEN` | Personal access token（`glpat-` 开头） |
| `GITLAB_PROJECT_ID` | 项目 ID |

三项都设置后启用 GitLab 命令（`list-milestones`、`list-issues`、`daily-report`、`create-milestone`）。

#### Webhook 通知

在 GitLab 项目 Settings > Webhooks 中添加：

1. **URL**: `http://<你的IP>:3000/gitlab`
2. **Secret token**: 自定义密钥，与 `GITLAB_WEBHOOK_SECRET` 保持一致
3. **Trigger**: 勾选 Push events / Merge request events / Pipeline events / Issues events / Comments

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `GITLAB_NOTIFY_CHANNEL` | Slack 频道 ID（设置后启用 Webhook） | — |
| `GITLAB_WEBHOOK_PORT` | 监听端口 | `3000` |
| `GITLAB_WEBHOOK_SECRET` | Secret token | — |
| `GITLAB_EVENTS_PUSH` | Push events 开关 | `true` |
| `GITLAB_EVENTS_MR` | Merge request events 开关 | `true` |
| `GITLAB_EVENTS_PIPELINE` | Pipeline events 开关 | `true` |
| `GITLAB_EVENTS_ISSUE` | Issues events 开关 | `true` |
| `GITLAB_EVENTS_NOTE` | Comments 开关 | `true` |

### 3. Gemini 配置

#### API 访问

在 Google AI Studio 中获取以下凭证：

1. **API Key**: 进入 [ai.google.dev](https://ai.google.dev)，创建或获取 API Key
2. **Model**: 默认使用 `gemini-2.0-flash` 用于对话，可通过 `GEMINI_MODEL` 自定义
3. **Image Model**: 默认使用 `gemini-3-pro-image-preview` 用于画图，可通过 `GEMINI_IMAGE_MODEL` 自定义

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `GEMINI_API_KEY` | Google AI Studio API Key | — |
| `GEMINI_MODEL` | Gemini 对话模型名 | `gemini-2.0-flash` |
| `GEMINI_IMAGE_MODEL` | Gemini 画图模型名 | `gemini-3-pro-image-preview` |

API Key 设置后启用 `gemini` 和 `gemini-draw` 命令。

### 4. Jenkins 配置

#### 获取凭证

1. **Jenkins URL**: Jenkins 服务器地址，如 `https://jenkins.example.com`
2. **Username**: Jenkins 登录用户名
3. **API Token**: 进入 User icon > Security > API Token，点击 Add new Token 生成

| 变量 | 说明 |
|------|------|
| `JENKINS_URL` | Jenkins 基础 URL |
| `JENKINS_USERNAME` | 用户名 |
| `JENKINS_API_TOKEN` | API Token |

三项都设置后启用 Jenkins 集成。

#### 定时任务

通过 `JENKINS_CRON_JOBS` 配置定时触发 Jenkins Job，格式为 `JobName HH:MM`，多个任务用逗号分隔：

| 变量 | 说明 |
|------|------|
| `JENKINS_CRON_JOBS` | 定时任务列表，如 `FetchAllStatistics 14:00,BuildReport 18:30` |

启动时自动调度：已过时间点的任务立即执行，未到的等待触发。支持多级 Pipeline（`folder/job` 格式）。

### 5. 环境变量

```bash
cp .env.example .env
```

编辑 `.env` 填入 Slack 和 Claude 配置（GitLab / Jenkins 见上方各自章节）：

```bash
# Slack 配置 (必填)
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...

# Claude 配置 (可选)
CLAUDE_COMMAND=claude
CLAUDE_TIMEOUT_MS=300000
```

### 6. 安装并运行

```bash
npm install
npm run dev      # 开发模式（热重载）
npm run build    # 编译
npm start        # 生产模式
```

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
│   ├── help.ts               # 帮助信息
│   ├── gemini.ts             # Gemini AI 对话
│   ├── gemini-draw.ts        # Gemini 画图生成
│   ├── daily-report.ts       # 每日简报
│   ├── list-milestones.ts    # 列出活跃 milestones
│   ├── list-milestone-issues.ts # 列出 milestone issues
│   └── create-milestone.ts   # 创建 milestone（含起止日期）+ 杂项 issue
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

## 技术栈

- **TypeScript** + ES Modules
- **@slack/bolt** — Socket Mode 连接 Slack
- **Express** — 接收 GitLab Webhook
- **Claude Code CLI** — AI 对话（子进程 stream-json）
