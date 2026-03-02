# README GitHub SEO 优化设计

## 目标

更新 README.md 提升 GitHub 可发现性，让更多用户能通过搜索找到本仓库。

## 方案

采用**英文主体 README + 中文配置指南独立文档**的方案。

## 设计细节

### README.md（英文主体）

**顶部**：
- 项目名 + 英文一句话描述（包含关键词：Slack bot, Claude Code CLI, Gemini, GitLab, Jenkins, self-hosted）
- `[中文配置指南](docs/setup-guide.md)` 链接
- Badges（TypeScript, Node.js, Slack, License）

**Features**：
- Claude AI Chat（本地 CLI 透传，流式输出）
- Multi-Model Support（Opus/Sonnet/Haiku 切换，effort 调节）
- Gemini AI（对话 + 画图）
- GitLab Integration（Webhook 通知 + milestone/issue 管理）
- Jenkins Automation（定时触发）
- Daily Reports（GitLab 数据日报）
- Self-Hosted（本机运行，数据私密）

**Architecture**：
- 保留 ASCII 架构图，扩展显示 Claude CLI / Gemini / GitLab / Jenkins 分支

**Quick Start**：
- 精简 3 步（创建 Slack App → clone + configure → mention bot）
- 详细配置链接到中文文档

**Tech Stack**：
- 列出核心技术栈

**Project Structure**：
- 精简为目录级别描述

**License**：MIT

### docs/setup-guide.md（中文配置指南）

将现有 README 中的详细配置步骤整体搬入：
- Slack App 配置
- GitLab 配置（API + Webhook）
- Gemini 配置
- Jenkins 配置
- 环境变量
- 部署（Windows 本机 + Mac mini socat 转发）

### 关键词策略

确保以下搜索词在 README 中出现：
`slack bot`, `claude`, `claude code`, `ai assistant`, `self-hosted`, `gitlab webhook`, `jenkins`, `gemini`, `typescript`, `personal assistant`, `chatbot`

## 文件变更

1. `README.md` — 重写为英文
2. `docs/setup-guide.md` — 新建，中文配置指南
3. `CLAUDE.md` — 同步更新（配置变更同步规则中的 README 引用）
