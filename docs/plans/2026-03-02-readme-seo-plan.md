# README GitHub SEO 优化 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite README.md in English for GitHub discoverability, move Chinese setup details to `docs/setup-guide.md`.

**Architecture:** Pure documentation change — no code modifications. English README as the primary landing page with SEO keywords; Chinese setup guide as a linked reference document.

**Tech Stack:** Markdown

---

### Task 1: Create `docs/setup-guide.md` (Chinese setup guide)

**Files:**
- Create: `docs/setup-guide.md`

**Step 1: Create the Chinese setup guide**

Create `docs/setup-guide.md` with all detailed configuration content extracted from the current `README.md`. The file should contain:

```markdown
# 配置指南

[English README](../README.md)

## Slack App 配置

在 [api.slack.com/apps](https://api.slack.com/apps) 创建 App：

- **Bot Token Scopes**: `app_mentions:read`, `chat:write`, `channels:history`
- **App-Level Token**: 勾选 `connections:write`
- **Event Subscriptions**: 订阅 `app_mention`
- 开启 **Socket Mode**

## GitLab 配置

### API 访问

在 GitLab 中获取以下凭证：

1. **Personal access token**: 进入 User Settings > Access Tokens，创建 token 并勾选 `api` scope
2. **Project ID**: 项目首页右侧或 Settings > General 中查看
3. **GitLab URL**: 你的 GitLab 实例地址，如 `https://gitlab.example.com`

| 变量 | 说明 |
|------|------|
| `GITLAB_API_URL` | GitLab API 地址，如 `https://gitlab.example.com/api/v4` |
| `GITLAB_TOKEN` | Personal access token（`glpat-` 开头） |
| `GITLAB_PROJECT_ID` | 项目 ID |

三项都设置后启用 GitLab 命令（`list-milestones`、`list-issues`、`daily-report`、`reset-daily-report`、`create-milestone`）。

### Webhook 通知

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

## Gemini 配置

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

## Jenkins 配置

### 获取凭证

1. **Jenkins URL**: Jenkins 服务器地址，如 `https://jenkins.example.com`
2. **Username**: Jenkins 登录用户名
3. **API Token**: 进入 User icon > Security > API Token，点击 Add new Token 生成

| 变量 | 说明 |
|------|------|
| `JENKINS_URL` | Jenkins 基础 URL |
| `JENKINS_USERNAME` | 用户名 |
| `JENKINS_API_TOKEN` | API Token |

三项都设置后启用 Jenkins 集成。

### 定时任务

通过 `JENKINS_CRON_JOBS` 配置定时触发 Jenkins Job，格式为 `JobName HH:MM`，多个任务用逗号分隔：

| 变量 | 说明 |
|------|------|
| `JENKINS_CRON_JOBS` | 定时任务列表，如 `FetchAllStatistics 14:00,BuildReport 18:30` |

启动时自动调度：已过时间点的任务立即执行，未到的等待触发。支持多级 Pipeline（`folder/job` 格式）。

## 环境变量

```bash
cp .env.example .env
```

编辑 `.env` 填入 Slack 和 Claude 配置（GitLab / Jenkins / Gemini 见上方各自章节）：

```bash
# Slack 配置 (必填)
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...

# Claude 配置 (可选)
CLAUDE_COMMAND=claude
```

## 部署

### Windows 本机

使用 `dev.bat`（开发模式）或 `start.bat`（生产模式）启动：

```bash
dev.bat      # npm run dev（tsx watch 热重载）
start.bat    # npm run build && npm start
```

建议配置：
- 设备管理器 → 网络适配器 → 属性 → 电源管理 → 取消"允许计算机关闭此设备以节约电源"
- Windows 防火墙放行入站 TCP 3000 端口（GitLab Webhook）

### GitLab Webhook 端口转发（Mac mini）

当 GitLab 部署在 Mac mini（Docker）而 GSSlackRobot 运行在 Windows 时，需要在 Mac mini 上转发 Webhook 请求：

```
GitLab (Docker) → Mac mini socat :3001 → Windows :3000 (GSSlackRobot)
```

#### 安装 socat

```bash
brew install socat
```

#### 配置 launchd 守护进程

创建 `~/Library/LaunchAgents/com.user.socat-forward.plist`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.user.socat-forward</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/socat</string>
        <string>TCP-LISTEN:3001,reuseaddr,fork</string>
        <string>TCP:192.168.50.43:3000</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/socat-forward.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/socat-forward.err</string>
</dict>
</plist>
```

> socat 路径可能是 `/opt/homebrew/bin/socat`（Apple Silicon）或 `/usr/local/bin/socat`（Intel），用 `which socat` 确认。

#### 管理命令

```bash
launchctl load ~/Library/LaunchAgents/com.user.socat-forward.plist      # 启动
launchctl unload ~/Library/LaunchAgents/com.user.socat-forward.plist    # 停止
launchctl list | grep socat                                             # 状态
tail -f /tmp/socat-forward.log /tmp/socat-forward.err                   # 日志
```

#### 断线恢复

socat `fork` 模式每个 Webhook 请求独立处理。Windows 不可达时单次请求失败，Windows 恢复后新请求自动成功，无需手动干预。
```

**Step 2: Verify the file renders correctly**

Open `docs/setup-guide.md` and confirm all sections, tables, and code blocks are present and well-formatted.

---

### Task 2: Rewrite `README.md` in English

**Files:**
- Modify: `README.md` (full rewrite)

**Step 1: Replace README.md with English content**

Overwrite `README.md` with the following complete content:

```markdown
# GSSlackRobot

> A self-hosted Slack bot for personal productivity — integrates Claude Code CLI, Google Gemini, GitLab webhooks, and Jenkins automation in one lightweight assistant.

[中文配置指南 (Chinese Setup Guide)](docs/setup-guide.md)

![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)
![Node.js](https://img.shields.io/badge/Node.js-ES2022-green)
![Slack](https://img.shields.io/badge/Slack-Bot-purple)
![License](https://img.shields.io/badge/License-MIT-yellow)

## Features

- **Claude AI Chat** — Mention the bot with any text to chat with Claude AI via local Claude Code CLI, with streaming output
- **Multi-Model Support** — Switch between Claude Opus/Sonnet/Haiku models and adjust thinking effort on the fly
- **Gemini AI** — Chat with Google Gemini and generate images via `gemini` / `gemini-draw` commands
- **GitLab Integration** — Receive webhook notifications (Push, MR, Pipeline, Issue, Note) and manage milestones/issues from Slack
- **Jenkins Automation** — Trigger Jenkins jobs on schedule, supports multi-level pipeline paths
- **Daily Reports** — Auto-generate daily project summaries from GitLab data
- **Self-Hosted** — Runs locally on your machine, your data stays private

## Architecture

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
└──────┬──────┘             └──────────────┘
       │
       ├──► Claude Code CLI (subprocess, stream-json)
       ├──► Gemini API
       └──► GitLab / Jenkins API
```

Socket Mode (Bolt) and Webhook HTTP (Express) run in the same process, sharing the Slack WebClient.

## Quick Start

1. Create a Slack App at [api.slack.com/apps](https://api.slack.com/apps) with Socket Mode enabled
2. Clone and configure:

```bash
git clone https://github.com/kavenGw/GSSlackRobot.git
cd GSSlackRobot
cp .env.example .env    # Fill in SLACK_BOT_TOKEN and SLACK_APP_TOKEN
npm install
npm run dev             # Development mode with hot reload
```

3. Mention the bot in Slack: `@bot hello` — it forwards to Claude AI

> For detailed setup (GitLab, Jenkins, Gemini, deployment), see the [Setup Guide (中文)](docs/setup-guide.md).

## Tech Stack

- **TypeScript** + ES Modules (strict mode)
- **@slack/bolt** — Slack Socket Mode connection
- **Express** — GitLab webhook receiver
- **Claude Code CLI** — AI chat via subprocess (stream-json)
- **Google Generative AI** — Gemini chat and image generation

## Project Structure

```
src/
├── app.ts              # Entry: load config → start Bolt + Webhook
├── config/             # Environment config loading & validation
├── commands/           # Slack command handlers (Claude, Gemini, GitLab, etc.)
├── services/           # External integrations (Claude CLI, GitLab, Jenkins, Gemini)
├── scheduler/          # Cron-like scheduling (daily reports, Jenkins jobs)
├── webhooks/           # GitLab webhook HTTP server & event formatting
└── utils/              # Logging, message splitting
```

## License

MIT
```

**Step 2: Verify the file renders correctly**

Review `README.md` to confirm all sections, badges, architecture diagram, and links are correct.

---

### Task 3: Update `CLAUDE.md` sync rules

**Files:**
- Modify: `CLAUDE.md:125` (配置变更同步 rule)
- Modify: `CLAUDE.md:130` (命令变更同步 rule)

**Step 1: Update the config sync rule**

In `CLAUDE.md` line 125, change:

```
- **配置变更同步**: 新增/修改环境变量配置时，需同步更新 `CLAUDE.md`、`README.md`、`.env.example` 三处
```

to:

```
- **配置变更同步**: 新增/修改环境变量配置时，需同步更新 `CLAUDE.md`、`docs/setup-guide.md`、`.env.example` 三处
```

**Step 2: Update the command sync rule**

In `CLAUDE.md` line 130, change:

```
  4. `README.md` — GitLab 命令列表
```

to:

```
  4. `docs/setup-guide.md` — 中文配置指南中的命令列表
```
