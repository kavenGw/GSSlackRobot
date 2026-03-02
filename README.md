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
