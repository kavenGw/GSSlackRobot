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

```
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
GITLAB_TOKEN=glpat-...
JENKINS_USER=admin
JENKINS_TOKEN=...
GITLAB_WEBHOOK_SECRET=...
```

### 3. 项目配置

编辑 `config/default.yaml` 或创建 `config/local.yaml`（会被 git 忽略）覆盖：

```yaml
gitlab:
  url: "https://your-gitlab.com"
  defaultProjectId: 42

jenkins:
  url: "https://your-jenkins.com"
  jobs:
    Patch: "MyProject/Patch_Build"
    Release: "MyProject/Release_Build"

webhook:
  port: 4567
  notifyChannel: "#dev-notifications"
  events:
    push: true
    merge_request: true
    pipeline: true
    issue: true
    note: false
```

配置优先级：环境变量 > `config/local.yaml` > `config/default.yaml`

### 4. 安装并运行

```bash
npm install
npm run dev      # 开发模式（热重载）
npm run build    # 编译
npm start        # 生产模式
```

### 5. GitLab Webhook

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
│   └── index.ts              # YAML 加载 + 环境变量覆盖
├── commands/
│   ├── index.ts              # app_mention 事件 → 正则路由
│   ├── help.ts               # 帮助信息
│   ├── issue.ts              # GitLab 创建 issue
│   ├── brainstorm.ts         # Claude 流式输出 + 消息更新
│   ├── version-status.ts     # Milestone issue 分组展示
│   └── jenkins.ts            # 触发 Jenkins 构建
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

## 频道级配置

可在配置中为特定频道覆盖 GitLab / Jenkins 参数：

```yaml
channels:
  C01ABCDEF:
    gitlab:
      defaultProjectId: 99
    jenkins:
      jobs:
        Patch: "OtherProject/Patch_Build"
```

## 技术栈

- **TypeScript** + ES Modules
- **@slack/bolt** — Socket Mode 连接 Slack
- **Express** — 接收 GitLab Webhook
- **Claude Code CLI** — AI 头脑风暴（子进程 stream-json）
- **js-yaml** + **lodash.merge** — 分层配置
