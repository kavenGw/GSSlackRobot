# GitLab Webhook 通知功能设计

## 目标

还原 GitLab Webhook 通知功能，接收 GitLab 事件推送并发送到 Slack 指定频道。

## 架构

```
GitLab → HTTP POST /gitlab → Express Server → 格式化事件 → Slack API → #gitlab 频道
```

在现有 Socket Mode Bot 基础上额外启动 Express HTTP 服务器。

## 支持的事件

| 事件 | GitLab Hook | 格式 |
|------|------------|------|
| Push | Push Hook | `*用户* pushed N commit(s) to \`branch\`` + commit 列表 |
| MR | Merge Request Hook | `*用户* action MR <url\|!iid> title` + 分支 |
| Pipeline | Pipeline Hook | `✅/❌ Pipeline #id on \`branch\`: *status*`（跳过 running） |
| Issue | Issue Hook | `*用户* action issue <url\|#iid> title` |
| Note | Note Hook | `*用户* commented on Type` + 评论摘要(200字) |

## 新增/修改文件

| 文件 | 说明 |
|------|------|
| `src/webhooks/server.ts` | Express 服务器，`/gitlab` 端点，token 验证 |
| `src/webhooks/gitlab.ts` | 5 种事件格式化 + 分发 |
| `src/config/schema.ts` | 加回 `GitLabNotifyConfig` |
| `src/config/index.ts` | 加载 Webhook 环境变量 |
| `src/config/env-validator.ts` | Webhook 配置验证 |
| `src/app.ts` | 启动时调用 `startWebhookServer()` |
| `package.json` | 引入 express 依赖 |

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `GITLAB_WEBHOOK_PORT` | `3000` | 监听端口 |
| `GITLAB_WEBHOOK_SECRET` | 无 | Secret Token |
| `GITLAB_NOTIFY_CHANNEL` | 必填 | Slack 频道 ID |
| `GITLAB_EVENTS_PUSH` | `true` | Push 通知开关 |
| `GITLAB_EVENTS_MR` | `true` | MR 通知开关 |
| `GITLAB_EVENTS_PIPELINE` | `true` | Pipeline 通知开关 |
| `GITLAB_EVENTS_ISSUE` | `true` | Issue 通知开关 |
| `GITLAB_EVENTS_NOTE` | `true` | Note 通知开关 |

## 方案选择

选择 Express 方案（而非原生 http），复用旧版已验证的代码。
