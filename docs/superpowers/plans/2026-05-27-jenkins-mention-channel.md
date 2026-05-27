# Jenkins 通知频道补发 @channel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 bot 监听一个由 env 配置的 Slack 频道，频道里出现新的顶层消息时（典型场景：Jenkins App 推送构建结果），自动在同频道独立补发一条 `<!channel>` 消息触发推送提醒。

**Architecture:** 在现有 `@slack/bolt` socket-mode App 上新增一个 `message` 事件 handler 模块。启动时通过 `auth.test` 一次性查出 bot 自身 `bot_id` 缓存。每个 message 事件按 5 条短路过滤规则放行；通过的事件触发 `chat.postMessage('<!channel>')`。配置项 `JENKINS_NOTIFY_CHANNEL` 未设置时整个模块不注册（行为完全不变）。

**Tech Stack:** TypeScript (strict, ES2022 ESM)、`@slack/bolt`、Node.js。无单元测试套件 —— 每个 task 的"验证"= `npm run build`（tsc 通过）+ 必要时手动 Slack 端到端。

**Spec:** `docs/superpowers/specs/2026-05-27-jenkins-mention-channel-design.md`

---

## File Structure

| 文件 | 角色 |
|------|------|
| `src/config/schema.ts` | 类型定义层：新增 `JenkinsMentionConfig` 接口、`AppConfig.jenkinsMention` 可选字段 |
| `src/config/index.ts` | 配置加载层：从 `JENKINS_NOTIFY_CHANNEL` 环境变量构造 `jenkinsMention` |
| `src/config/env-validator.ts` | 配置校验层：若设置则校验 channel ID 格式 |
| `src/events/jenkins-mention.ts` *(新建)* | 事件处理层：单一职责 —— 注册 message 事件 handler、缓存自身 bot_id、应用过滤规则、补发 `<!channel>` |
| `src/app.ts` | 启动装配层：在 `registerCommands(app)` 后调用 `registerJenkinsMention(app)` |
| `CLAUDE.md` | 项目文档：环境变量表 + 关键设计注意事项 |
| `docs/setup-guide.md` | 中文配置指南 |
| `.env.example` | 环境变量样板 |

边界设计：事件处理逻辑全部封装在新建的 `src/events/jenkins-mention.ts` 一个文件里，外部接口只暴露 `registerJenkinsMention(app)` 一个函数。其他模块（webhooks、scheduler）完全不感知它的存在。

---

## Task 1: 配置类型 + 加载

**Files:**
- Modify: `src/config/schema.ts:54-61`
- Modify: `src/config/index.ts:35-83`

- [ ] **Step 1: 修改 `src/config/schema.ts`**

在 `JenkinsConfig` 接口块之后（第 46 行后、`GeminiConfig` 之前）插入新接口；在 `AppConfig` 接口里追加 `jenkinsMention` 字段。

在第 46 行 `}` 之后、第 48 行 `export interface GeminiConfig {` 之前插入：

```ts
export interface JenkinsMentionConfig {
  channel: string;
}

```

把 `AppConfig` 改为：

```ts
export interface AppConfig {
  slack: SlackConfig;
  claude: ClaudeConfig;
  gitlabNotify?: GitLabNotifyConfig;
  gitlab?: GitLabConfig;
  jenkins?: JenkinsConfig;
  jenkinsMention?: JenkinsMentionConfig;
  gemini?: GeminiConfig;
}
```

- [ ] **Step 2: 修改 `src/config/index.ts`**

在 `loadConfig()` 内、`gemini` 字段之前插入 `jenkinsMention` 字段。具体在第 77 行 `} : undefined,`（jenkins 块的结束）和第 78 行 `gemini:` 之间插入：

```ts
    jenkinsMention: process.env.JENKINS_NOTIFY_CHANNEL ? {
      channel: process.env.JENKINS_NOTIFY_CHANNEL,
    } : undefined,
```

- [ ] **Step 3: 验证构建**

Run: `npm run build`
Expected: tsc 通过，无错误。

- [ ] **Step 4: 提交**

```bash
git add src/config/schema.ts src/config/index.ts
git commit -m "feat(config): add JENKINS_NOTIFY_CHANNEL config plumbing

Introduces JenkinsMentionConfig interface and wires JENKINS_NOTIFY_CHANNEL
environment variable into AppConfig. No behavior change yet — config is
loaded but not consumed."
```

---

## Task 2: 环境变量校验

**Files:**
- Modify: `src/config/env-validator.ts:168-176`

- [ ] **Step 1: 修改 `src/config/env-validator.ts`**

在 `validateConfig()` 函数内、Jenkins URL 校验块（第 168-176 行）之后、Jenkins cronJobs 校验块（第 178 行开始）之前插入 `jenkinsMention` 的校验逻辑。

在第 176 行 `}`（Jenkins URL 校验块的结束花括号）后、第 178 行 `if (config.jenkins?.cronJobs) {` 之前插入：

```ts

  if (config.jenkinsMention) {
    const ch = config.jenkinsMention.channel;
    const placeholders = ['your-channel-id', 'your_channel_id', 'C0000000000', 'xxx', 'placeholder'];
    if (!ch.trim()) {
      errors.push({
        param: 'JENKINS_NOTIFY_CHANNEL',
        message: 'JENKINS_NOTIFY_CHANNEL cannot be empty',
      });
    } else if (placeholders.includes(ch.trim().toLowerCase()) || placeholders.includes(ch.trim())) {
      errors.push({
        param: 'JENKINS_NOTIFY_CHANNEL',
        message: 'JENKINS_NOTIFY_CHANNEL cannot be a placeholder value',
        value: ch,
      });
    } else if (!/^[CG][A-Z0-9]{8,}$/.test(ch.trim())) {
      errors.push({
        param: 'JENKINS_NOTIFY_CHANNEL',
        message: 'JENKINS_NOTIFY_CHANNEL must be a Slack channel ID starting with "C" (public) or "G" (private), length ≥ 9',
        value: ch,
      });
    }
  }
```

- [ ] **Step 2: 验证构建**

Run: `npm run build`
Expected: tsc 通过。

- [ ] **Step 3: 手动验证错误路径（可选）**

临时在 shell 设 `JENKINS_NOTIFY_CHANNEL=xxx` 后跑 `npm run dev`，应触发 `EnvValidationError` 并退出 1，错误消息提示 placeholder。验证后清除该 env。

```bash
# PowerShell
$env:JENKINS_NOTIFY_CHANNEL='xxx'; npm run dev
# Expected: 启动失败，输出 ENVIRONMENT VALIDATION FAILED + placeholder 提示
Remove-Item Env:\JENKINS_NOTIFY_CHANNEL
```

- [ ] **Step 4: 提交**

```bash
git add src/config/env-validator.ts
git commit -m "feat(config): validate JENKINS_NOTIFY_CHANNEL format

Reject empty, placeholder, or malformed channel IDs (must start with
C/G and be ≥9 chars). Aligned with existing validation patterns."
```

---

## Task 3: 事件处理模块（核心逻辑）

**Files:**
- Create: `src/events/jenkins-mention.ts`

- [ ] **Step 1: 创建 `src/events/jenkins-mention.ts`**

完整文件内容：

```ts
import type { App } from '@slack/bolt';
import { getConfig } from '../config/index.js';
import { log } from '../utils/logger.js';

const SUBTYPE_BLOCKLIST = new Set(['message_changed', 'message_deleted']);

export async function registerJenkinsMention(app: App): Promise<void> {
  const cfg = getConfig().jenkinsMention;
  if (!cfg) return;

  let selfBotId: string | undefined;
  try {
    const auth = await app.client.auth.test();
    selfBotId = auth.bot_id as string | undefined;
  } catch (err) {
    log.error(`jenkins-mention: auth.test 失败，跳过注册: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  app.event('message', async ({ event, client }) => {
    try {
      const ev = event as any;

      if (ev.channel !== cfg.channel) return;
      if (selfBotId && ev.bot_id === selfBotId) return;
      if (ev.subtype && SUBTYPE_BLOCKLIST.has(ev.subtype)) return;
      if (ev.thread_ts && ev.thread_ts !== ev.ts) return;

      const text = typeof ev.text === 'string' ? ev.text.trim() : '';
      if (text === '<!channel>') return;

      await client.chat.postMessage({
        channel: cfg.channel,
        text: '<!channel>',
        link_names: 1,
      });
    } catch (err) {
      log.warn(`jenkins-mention: 处理失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  log.info(`jenkins-mention: 已启用，监听频道 ${cfg.channel}`);
}
```

**注释意图**（不写进代码里，仅供本任务读者理解）：
- `SUBTYPE_BLOCKLIST`：屏蔽 Jenkins App 编辑消息（In Progress → Success）触发的 `message_changed` / `message_deleted`，避免重复 @。（Slack 并不存在 `message_replied` 这个 subtype；thread 回复由下一条 `thread_ts` 过滤处理。）
- `selfBotId` 检查：防 bot 自己补发的 `<!channel>` 又被自己收到造成无限循环
- `thread_ts !== ts`：只对频道顶层新消息触发，避免有人在 Jenkins 消息下回复也被 @
- `text === '<!channel>'`：双重防循环（应对 `auth.test` 失败时的兜底；正常路径已被 selfBotId 拦截）
- `(event as any)` 与项目现有风格一致（参见 `src/commands/index.ts` 处理 `(event as any).files` 的做法）

- [ ] **Step 2: 验证构建**

Run: `npm run build`
Expected: tsc 通过，无 TS 错误（特别确认 `auth.test` 返回类型、`app.event` 签名都能编过）。

- [ ] **Step 3: 提交**

```bash
git add src/events/jenkins-mention.ts
git commit -m "feat(events): add jenkins-mention channel watcher

Adds registerJenkinsMention() that subscribes to Slack message events,
filters to the configured Jenkins notification channel, and replies
with <!channel> to amplify build-result pushes. Idle if
JENKINS_NOTIFY_CHANNEL is not set."
```

---

## Task 4: 在 app.ts 装配

**Files:**
- Modify: `src/app.ts:7-9`
- Modify: `src/app.ts:33-39`

- [ ] **Step 1: 修改 `src/app.ts`**

在 `import { scheduleJenkinsCronJobs } from './scheduler/jenkins-cron.js';`（第 7 行）下面新增 import：

```ts
import { registerJenkinsMention } from './events/jenkins-mention.js';
```

然后在 `registerCommands(app);`（第 33 行）之后、`await app.start();`（第 35 行）之前插入注册调用。最终该段应变为：

```ts
registerCommands(app);
await registerJenkinsMention(app);

await app.start();
startWebhookServer(app);
scheduleDailyReport(app);
await scheduleJenkinsCronJobs();
log.startup();
```

注意：`registerJenkinsMention` 内部包含 `auth.test` 异步调用，需要 `await`。它放在 `app.start()` 之前是因为只是注册 handler，不需要 socket 已连接。`auth.test` 通过 HTTP 直接调用 Slack Web API，与 socket 状态无关。

- [ ] **Step 2: 验证构建**

Run: `npm run build`
Expected: tsc 通过。

- [ ] **Step 3: 启动验证（不配置 env 路径）**

确认 **`JENKINS_NOTIFY_CHANNEL` 未设置时行为完全不变**：

Run: `npm run dev`（不设置该 env）
Expected: 启动正常，日志**不出现** `jenkins-mention:` 字样，所有其他功能（GitLab webhook、定时任务、命令）行为不变。
Ctrl+C 退出。

- [ ] **Step 4: 提交**

```bash
git add src/app.ts
git commit -m "feat(app): wire registerJenkinsMention into startup

Hook the new message-event handler into the boot sequence after
registerCommands and before app.start(). No-op when
JENKINS_NOTIFY_CHANNEL is unset."
```

---

## Task 5: 文档同步

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/setup-guide.md`
- Modify: `.env.example`

- [ ] **Step 1: 修改 `CLAUDE.md` 环境变量表**

在 `CLAUDE.md` 的"可选参数 (带默认值)"表里、`JENKINS_CRON_JOBS` 行之后插入：

```markdown
| `JENKINS_NOTIFY_CHANNEL` | 无 | Jenkins 通知 Slack 频道 ID（设置后启用 bot 自动 @channel 补发功能） |
```

- [ ] **Step 2: 修改 `CLAUDE.md` 关键设计注意事项**

在"## 关键设计注意事项"列表里，在现有 `**GitLab Webhook**` 那条之后插入一条：

```markdown
- **Jenkins @channel 补发**: 设置 `JENKINS_NOTIFY_CHANNEL` 后，bot 注册 Slack `message` 事件 handler 监听该频道。频道里出现新的顶层消息（且非 bot 自己发的、非 message_changed/deleted/replied、非 thread 回复）时，自动在同频道独立发一条 `<!channel>` 触发推送提醒。频道纯净度（只用于 Jenkins App 推送）是运维约定，不在代码层校验。需要 Slack App 订阅 `message.channels`（或 `message.groups`）event，并加 `channels:history`（或 `groups:history`）scope，bot 也需 invite 进该频道。
```

- [ ] **Step 3: 修改 `docs/setup-guide.md`**

在 `## Jenkins 配置` 章节末尾（即 `### 定时任务` 块的最后一段之后、`## 环境变量` 之前，约第 100 行后）插入新小节：

```markdown
### Jenkins 通知 @ 提醒

Jenkins 自带 Slack App 推送构建结果时不会 @channel，容易被错过。设置 `JENKINS_NOTIFY_CHANNEL` 为 Jenkins 通知所在的 Slack 频道 ID 后，bot 会监听该频道并在每条新消息后自动补发一条 `<!channel>` 触发推送提醒。

| 变量 | 说明 |
|------|------|
| `JENKINS_NOTIFY_CHANNEL` | Jenkins 通知 Slack 频道 ID（如 `C0123456789`） |

启用要求：

- Slack App 后台 **Event Subscriptions** 订阅 `message.channels`（公开频道）或 `message.groups`（私有频道）
- **Bot Token Scopes** 增加 `channels:history`（公开）或 `groups:history`（私有）
- Bot 被 invite 进该频道
- 该频道**只用于 Jenkins 通知**（运维约定）：bot 不区分发送方，频道里出现的任何新顶层消息都会触发 @channel

未设置 `JENKINS_NOTIFY_CHANNEL` 时该功能关闭，bot 行为完全不变。
```

- [ ] **Step 4: 修改 `.env.example`**

在 `.env.example` 的 Jenkins 块末尾（`# JENKINS_CRON_JOBS=...` 行之后、`# Gemini` 之前），插入：

```
# Jenkins 通知 @ 提醒（设置后，bot 在该频道每条新消息后补发 <!channel>）
# JENKINS_NOTIFY_CHANNEL=C0000000000
```

- [ ] **Step 5: 提交**

```bash
git add CLAUDE.md docs/setup-guide.md .env.example
git commit -m "docs(jenkins-mention): document JENKINS_NOTIFY_CHANNEL setup

Adds env var to CLAUDE.md tables, a setup-guide.md section describing
the required Slack scopes / event subscription / channel invitation,
and an .env.example placeholder."
```

---

## Task 6: 端到端手动验证（用户执行 + 可选提交）

**Files:** 无代码改动；纯运维验证。这步**不能由 agent 单独完成**，需用户在自己的 Slack workspace 操作。

- [ ] **Step 1: 在测试 Slack workspace 准备**

  - 创建一个测试频道（或选用现成频道，但确保非生产）
  - 拿到该频道 ID（频道名右键 → View channel details → 底部 Channel ID）
  - 把 bot invite 到该频道（频道内 `/invite @<bot>`）

- [ ] **Step 2: 配置 Slack App scope + events**

  打开 Slack App 后台：

  - Bot Token Scopes 加 `channels:history`（如果测试频道是私有的，改加 `groups:history`）
  - Event Subscriptions 订阅 `message.channels`（私有则 `message.groups`）
  - 重新安装 App 让 scope 生效

- [ ] **Step 3: 配置 env 并启动**

  在 `.env` 加：
  ```
  JENKINS_NOTIFY_CHANNEL=<测试频道 ID>
  ```

  Run: `npm run dev`
  Expected: 启动日志包含 `jenkins-mention: 已启用，监听频道 C...`。

- [ ] **Step 4: 触发并观察**

  在测试频道里手动发任意一条消息（或触发一个 Jenkins build）。
  Expected:
  - bot 立即在同频道发一条 `<!channel>`（Slack 显示为 `@channel`）
  - 所有频道成员收到推送提醒
  - bot **不会**对自己补发的 `<!channel>` 再次触发（频道不应被 @ 刷屏）
  - 在 Jenkins 消息下 thread 回复一条，**不会**触发新的 @channel
  - 编辑频道里之前的某条消息（`message_changed`），**不会**触发新的 @channel

- [ ] **Step 5: 回归验证**

  Ctrl+C 停止 bot，注释掉 `.env` 里的 `JENKINS_NOTIFY_CHANNEL`，再次 `npm run dev`。
  Expected: 启动日志**不出现** `jenkins-mention:` 字样；测试频道里发消息**不会**收到 bot 的 @channel；GitLab webhook / 命令 / 定时任务等其他功能全部正常。

- [ ] **Step 6（如有问题）: 修复回归**

  如端到端发现问题（如某个 subtype 未被正确过滤、Slack scope 配错时启动行为不友好等），回到对应 Task 修复并新增 commit。问题分类：
  - 过滤规则有遗漏 → 改 `src/events/jenkins-mention.ts`，新增对应 subtype 到 `SUBTYPE_BLOCKLIST` 或加新过滤条件
  - 启动日志噪音 / 不友好 → 改 `log.info` / `log.error` 信息
  - 配置歧义 → 改文档

---

## 完成标准

- [ ] 所有 Task 1-5 的 `npm run build` 步骤通过
- [ ] Task 4 Step 3 验证：未设置 env 时启动行为完全不变
- [ ] Task 6 端到端验证全部通过（用户负责执行）
- [ ] 5 次 commit 全部入库，spec → 各实现层 → docs 顺序清晰
