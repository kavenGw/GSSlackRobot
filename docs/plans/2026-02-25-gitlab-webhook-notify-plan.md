# GitLab Webhook 通知功能实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 还原 GitLab Webhook 通知功能，接收 GitLab 推送的 5 种事件并发送到 Slack 频道。

**Architecture:** Express HTTP 服务器监听 `/gitlab` 端点，验证 Secret Token，根据事件类型格式化消息后通过 Slack Web API 发送到指定频道。与现有 Socket Mode Bot 并行运行。

**Tech Stack:** Express, @slack/web-api (已有 via bolt), TypeScript

---

### Task 1: 安装 Express 依赖

**Step 1: 安装 express 和类型定义**

```bash
npm install express
npm install -D @types/express
```

**Step 2: 确认 package.json 更新**

```bash
git diff package.json
```

Expected: 看到 express 和 @types/express 被添加到 dependencies/devDependencies

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: 添加 express 依赖"
```

---

### Task 2: 扩展配置层 — schema + loader + validator

**Files:**
- Modify: `src/config/schema.ts`
- Modify: `src/config/index.ts`
- Modify: `src/config/env-validator.ts`

**Step 1: 在 `src/config/schema.ts` 添加 GitLabNotifyConfig**

在 `ClaudeConfig` 后面、`AppConfig` 前面添加：

```typescript
export interface GitLabNotifyConfig {
  port: number;
  secret: string;
  channel: string;
  events: {
    push: boolean;
    mr: boolean;
    pipeline: boolean;
    issue: boolean;
    note: boolean;
  };
}
```

在 `AppConfig` 中添加可选字段：

```typescript
export interface AppConfig {
  slack: SlackConfig;
  claude: ClaudeConfig;
  gitlabNotify?: GitLabNotifyConfig;
}
```

**Step 2: 在 `src/config/index.ts` 的 `loadConfig()` 中加载 GitLab 环境变量**

在 `claude: { ... }` 块后面添加：

```typescript
gitlabNotify: process.env.GITLAB_NOTIFY_CHANNEL ? {
  port: optionalInt('GITLAB_WEBHOOK_PORT', 3000),
  secret: optional('GITLAB_WEBHOOK_SECRET', ''),
  channel: required('GITLAB_NOTIFY_CHANNEL'),
  events: {
    push: optionalBool('GITLAB_EVENTS_PUSH', true),
    mr: optionalBool('GITLAB_EVENTS_MR', true),
    pipeline: optionalBool('GITLAB_EVENTS_PIPELINE', true),
    issue: optionalBool('GITLAB_EVENTS_ISSUE', true),
    note: optionalBool('GITLAB_EVENTS_NOTE', true),
  },
} : undefined,
```

注意：`GITLAB_NOTIFY_CHANNEL` 存在时才加载整个 gitlabNotify 配置块，不存在则为 undefined，不启动 webhook server。

**Step 3: 在 `src/config/env-validator.ts` 的 `validateConfig()` 末尾、`if (errors.length > 0)` 之前添加验证**

```typescript
if (config.gitlabNotify) {
  if (config.gitlabNotify.port < 1 || config.gitlabNotify.port > 65535) {
    errors.push({
      param: 'GITLAB_WEBHOOK_PORT',
      message: 'Webhook port must be between 1 and 65535',
      value: String(config.gitlabNotify.port),
    });
  }
  if (!config.gitlabNotify.channel.trim()) {
    errors.push({
      param: 'GITLAB_NOTIFY_CHANNEL',
      message: 'GitLab notify channel cannot be empty',
    });
  }
}
```

**Step 4: 编译验证**

```bash
npm run build
```

Expected: 编译成功，无错误

**Step 5: Commit**

```bash
git add src/config/schema.ts src/config/index.ts src/config/env-validator.ts
git commit -m "feat: 添加 GitLab Webhook 通知配置"
```

---

### Task 3: 创建 GitLab 事件格式化模块

**Files:**
- Create: `src/webhooks/gitlab.ts`

**Step 1: 创建 `src/webhooks/gitlab.ts`**

```typescript
import type { WebClient } from '@slack/web-api';
import { getConfig } from '../config/index.js';
import { log } from '../utils/logger.js';

type EventHandler = (payload: Record<string, any>) => string | null;

function formatPush(payload: Record<string, any>): string | null {
  const branch = payload.ref?.replace('refs/heads/', '');
  const name = payload.user_name;
  const commits = payload.commits ?? [];
  if (commits.length === 0) return null;
  const commitLines = commits
    .slice(0, 5)
    .map((c: any) => `• <${c.url}|\`${c.id.slice(0, 8)}\`> ${c.title}`)
    .join('\n');
  const extra = commits.length > 5 ? `\n_...及其他 ${commits.length - 5} 个 commit_` : '';
  return `*${name}* pushed ${commits.length} commit(s) to \`${branch}\`\n${commitLines}${extra}`;
}

function formatMergeRequest(payload: Record<string, any>): string | null {
  const mr = payload.object_attributes;
  const action = mr.action;
  const author = payload.user?.name ?? mr.author_id;
  return `*${author}* ${action} MR <${mr.url}|!${mr.iid}> ${mr.title}\n\`${mr.source_branch}\` → \`${mr.target_branch}\``;
}

function formatPipeline(payload: Record<string, any>): string | null {
  const pipeline = payload.object_attributes;
  const status = pipeline.status;
  if (status === 'running') return null;
  const icon = status === 'success' ? '✅' : status === 'failed' ? '❌' : '⚠️';
  const branch = pipeline.ref;
  return `${icon} Pipeline #${pipeline.id} on \`${branch}\`: *${status}*`;
}

function formatIssue(payload: Record<string, any>): string | null {
  const issue = payload.object_attributes;
  const action = issue.action;
  const author = payload.user?.name;
  return `*${author}* ${action} issue <${issue.url}|#${issue.iid}> ${issue.title}`;
}

function formatNote(payload: Record<string, any>): string | null {
  const note = payload.object_attributes;
  const author = payload.user?.name;
  const target = note.noteable_type;
  return `*${author}* commented on ${target} <${note.url}|${note.noteable_id}>:\n>${note.note?.slice(0, 200)}`;
}

const eventMap: Record<string, { key: string; format: EventHandler }> = {
  'Push Hook': { key: 'push', format: formatPush },
  'Merge Request Hook': { key: 'mr', format: formatMergeRequest },
  'Pipeline Hook': { key: 'pipeline', format: formatPipeline },
  'Issue Hook': { key: 'issue', format: formatIssue },
  'Note Hook': { key: 'note', format: formatNote },
};

export function handleGitLabEvent(
  eventType: string,
  payload: Record<string, any>,
  client: WebClient
) {
  const cfg = getConfig().gitlabNotify;
  if (!cfg) return;

  const entry = eventMap[eventType];
  if (!entry) return;

  const enabled = cfg.events[entry.key as keyof typeof cfg.events];
  if (!enabled) return;

  const text = entry.format(payload);
  if (!text) return;

  log.webhook(eventType, text.length);

  client.chat.postMessage({
    channel: cfg.channel,
    text,
  }).catch(err => log.error(`Webhook 通知发送失败: ${err}`));
}
```

**Step 2: 在 `src/utils/logger.ts` 添加 webhook 日志方法**

在 `log` 对象中添加：

```typescript
webhook(event: string, chars: number) {
  console.log(`${ts()} ${chalk.magenta('⚡')} GitLab ${event} (${chars} chars) → Slack`);
},

webhookServer(port: number) {
  console.log(`${ts()} ${chalk.blue('🔗')} Webhook server listening on port ${port}`);
},
```

**Step 3: 编译验证**

```bash
npm run build
```

Expected: 编译成功

**Step 4: Commit**

```bash
git add src/webhooks/gitlab.ts src/utils/logger.ts
git commit -m "feat: 添加 GitLab 事件格式化与分发"
```

---

### Task 4: 创建 Webhook Server

**Files:**
- Create: `src/webhooks/server.ts`

**Step 1: 创建 `src/webhooks/server.ts`**

```typescript
import express from 'express';
import type { App } from '@slack/bolt';
import { getConfig } from '../config/index.js';
import { handleGitLabEvent } from './gitlab.js';
import { log } from '../utils/logger.js';

export function startWebhookServer(slackApp: App) {
  const cfg = getConfig().gitlabNotify;
  if (!cfg) return;

  const server = express();
  server.use(express.json());

  server.post('/gitlab', (req, res) => {
    const token = req.headers['x-gitlab-token'];
    if (cfg.secret && token !== cfg.secret) {
      res.status(401).send('Unauthorized');
      return;
    }

    const eventType = req.headers['x-gitlab-event'] as string;
    handleGitLabEvent(eventType, req.body, slackApp.client);
    res.status(200).send('OK');
  });

  server.listen(cfg.port, () => {
    log.webhookServer(cfg.port);
  });
}
```

**Step 2: 编译验证**

```bash
npm run build
```

Expected: 编译成功

**Step 3: Commit**

```bash
git add src/webhooks/server.ts
git commit -m "feat: 添加 Webhook Express 服务器"
```

---

### Task 5: 集成到 app.ts 启动流程

**Files:**
- Modify: `src/app.ts`

**Step 1: 在 `src/app.ts` 中导入并启动 webhook server**

在 `import { log }` 后添加导入：

```typescript
import { startWebhookServer } from './webhooks/server.js';
```

在 `await app.start();` 之后、`log.startup();` 之前添加：

```typescript
startWebhookServer(app);
```

**Step 2: 编译验证**

```bash
npm run build
```

Expected: 编译成功

**Step 3: Commit**

```bash
git add src/app.ts
git commit -m "feat: 启动时集成 Webhook 服务器"
```

---

### Task 6: 更新文档

**Files:**
- Modify: `CLAUDE.md`

**Step 1: 更新 CLAUDE.md 项目结构**

在项目结构部分添加 webhooks 目录：

```
src/
├── ...
├── webhooks/
│   ├── server.ts             # Express Webhook 服务器 (GitLab → Slack)
│   └── gitlab.ts             # GitLab 事件格式化 (Push/MR/Pipeline/Issue/Note)
└── utils/
    ├── logger.ts             # 彩色控制台日志
    └── message.ts            # 文本截断/分段
```

**Step 2: 在环境变量章节添加 GitLab Webhook 参数**

在可选参数表格中添加：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `GITLAB_NOTIFY_CHANNEL` | 无 | GitLab 通知 Slack 频道 ID（设置后启用 Webhook） |
| `GITLAB_WEBHOOK_PORT` | `3000` | Webhook 监听端口 |
| `GITLAB_WEBHOOK_SECRET` | 无 | GitLab Webhook Secret Token |
| `GITLAB_EVENTS_PUSH` | `true` | Push 事件通知开关 |
| `GITLAB_EVENTS_MR` | `true` | MR 事件通知开关 |
| `GITLAB_EVENTS_PIPELINE` | `true` | Pipeline 事件通知开关 |
| `GITLAB_EVENTS_ISSUE` | `true` | Issue 事件通知开关 |
| `GITLAB_EVENTS_NOTE` | `true` | Note 事件通知开关 |

**Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: 更新 CLAUDE.md 添加 GitLab Webhook 文档"
```
