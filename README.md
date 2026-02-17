# GSSlackRobot

本机常驻运行的 Slack Bot 个人助手，集成自建 GitLab、Jenkins 和本机 Claude Code CLI。

## 功能

| 指令 | 说明 |
|------|------|
| `help` | 显示可用命令列表 |
| `创建一个单子：<标题>` | 在 GitLab 创建 issue |
| `头脑风暴 <问题>` | 调用 Claude AI 流式输出回答 |
| `当前版本状态：<里程碑>` | 查看 milestone 下 issue 完成情况 |
| `jenkins <job别名>` | 触发 Jenkins 构建 |
| `每日简报` | 生成每日简报（Jenkins 数据 + GitLab 状态 + Claude 分析） |
| `每日简报：<里程碑>` | 生成指定里程碑的每日简报 |

所有指令通过 `@bot` mention 触发，回复在 thread 中。

另外，GitLab Webhook 事件（push / MR / pipeline / issue / note）会自动推送到指定 Slack 频道。

## 架构

```
Slack (Socket Mode)          GitLab (Webhook HTTP)
       │                            │
       ▼                            ▼
┌─────────────┐             ┌──────────────┐
│  Bolt App   │             │ Express :4567│
│ app_mention │             │ POST /gitlab │
└──────┬──────┘             └──────┬───────┘
       │                           │
       ▼                           ▼
┌─────────────┐             ┌──────────────┐
│ Command     │             │ GitLab Event │
│ Router      │             │ Handler      │
│ (regex)     │             │ (format+send)│
└──┬──┬──┬──┬─┘             └──────────────┘
   │  │  │  │
   ▼  ▼  ▼  ▼
 ┌──────────────────────────────┐
 │         Services             │
 ├──────────┬─────────┬─────────┤
 │ GitLab   │ Jenkins │ Claude  │
 │ REST API │ REST API│ CLI子进程│
 └──────────┴─────────┴─────────┘
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

编辑 `.env` 填入真实 token：

```bash
# Slack 配置 (必填)
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...

# GitLab 配置
GITLAB_URL=https://your-gitlab.com
GITLAB_TOKEN=glpat-...
GITLAB_DEFAULT_PROJECT_ID=42

# Jenkins 配置
JENKINS_URL=https://your-jenkins.com
JENKINS_USER=admin
JENKINS_TOKEN=...
JENKINS_JOBS='{"Patch":"MyProject/Patch_Build","Release":"MyProject/Release_Build","GetPlayfabData":"MyProject/GetPlayfabData"}'

# Claude 配置 (可选)
CLAUDE_COMMAND=claude
CLAUDE_TIMEOUT_MS=300000

# Webhook 配置 (可选)
WEBHOOK_PORT=4567
GITLAB_WEBHOOK_SECRET=...
WEBHOOK_NOTIFY_CHANNEL=#dev-notifications

# Webhook 事件开关 (可选)
WEBHOOK_EVENT_PUSH=true
WEBHOOK_EVENT_MR=true
WEBHOOK_EVENT_PIPELINE=true
WEBHOOK_EVENT_ISSUE=true
WEBHOOK_EVENT_NOTE=false
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

- **URL**: `http://<你的IP>:4567/gitlab`
- **Secret Token**: 与 `GITLAB_WEBHOOK_SECRET` 一致
- **Triggers**: Push / Merge Request / Pipeline / Issues / Comments

## 项目结构

```
src/
├── app.ts                    # 入口：加载配置 → 启动 Bolt + Webhook
├── config/
│   ├── schema.ts             # 配置类型定义
│   └── index.ts              # 环境变量加载
├── commands/
│   ├── index.ts              # app_mention 事件 → 正则路由
│   ├── help.ts               # 帮助信息
│   ├── issue.ts              # GitLab 创建 issue
│   ├── brainstorm.ts         # Claude 流式输出 + 消息更新
│   ├── version-status.ts     # Milestone issue 分组展示
│   ├── jenkins.ts            # 触发 Jenkins 构建
│   └── daily-report.ts       # 每日简报 (Jenkins + GitLab + Claude)
├── services/
│   ├── gitlab.ts             # GitLab REST API v4
│   ├── jenkins.ts            # Jenkins Remote API
│   └── claude.ts             # Claude CLI 子进程 (stream-json)
├── webhooks/
│   ├── server.ts             # Express HTTP 服务
│   └── gitlab.ts             # 5 种事件格式化 + 开关过滤
└── utils/
    └── message.ts            # 文本截断/分段 + Block Kit 格式化
```

## 每日简报功能

每日简报命令通过三步流水线整合多源数据：

1. **获取运营数据**: 触发 Jenkins `GetPlayfabData` 任务并等待完成
2. **获取版本状态**: 查询 GitLab 活跃里程碑的 Issue 完成情况
3. **AI 分析**: 将数据发送给 Claude 进行综合分析

```
@bot 每日简报              # 使用当前活跃里程碑
@bot 每日简报：v1.2.0      # 指定里程碑
```

## 技术栈

- **TypeScript** + ES Modules
- **@slack/bolt** — Socket Mode 连接 Slack
- **Express** — 接收 GitLab Webhook
- **Claude Code CLI** — AI 头脑风暴（子进程 stream-json）

## 文档

- [流程图](./docs/flowchart.md) — 系统流程图和时序图
- [Claude 集成文档](./docs/claude-integration.md) — Claude Code CLI 集成详解
- [技术参考文档](./docs/technical-reference.md) — 完整技术参考
