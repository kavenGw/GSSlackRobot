# 安全消息发送封装 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 封装 `safePost` / `safeUpdate`，统一所有 handler 的消息分段发送逻辑，消除 `msg_too_long` 风险。

**Architecture:** 在 `src/utils/message.ts` 新增两个封装函数，各 handler 替换手动分段逻辑为统一调用。handleClaude 流式场景使用 `safeUpdate` 的 `lastSegment` 追踪机制。

**Tech Stack:** TypeScript, @slack/web-api WebClient

**Spec:** `docs/superpowers/specs/2026-03-23-safe-message-send-design.md`

---

## 文件变更总览

| 操作 | 文件 | 职责 |
|------|------|------|
| 修改 | `src/utils/message.ts` | 新增 `safePost`、`safeUpdate` |
| 修改 | `src/commands/index.ts` | handleClaude flush + catch 改用封装函数 |
| 修改 | `src/commands/daily-report.ts` | handleDailyReport / handleResetDailyReport 改用 `safePost` |
| 修改 | `src/commands/gemini.ts` | handleGemini 改用 `safeUpdate` |
| 修改 | `src/commands/list-milestones.ts` | 改用 `safePost` |
| 修改 | `src/commands/list-milestone-issues.ts` | 改用 `safePost` |
| 修改 | `src/scheduler/daily-report.ts` | 改用 `safePost` |

---

### Task 1: 在 message.ts 中实现 safePost 和 safeUpdate

**Files:**
- Modify: `src/utils/message.ts:97-114`

- [ ] **Step 1: 添加 WebClient 类型导入和实现 safePost**

在文件第 1 行添加 import：
```typescript
import type { WebClient } from '@slack/web-api';
```

在 `splitToBlocks` 函数之后添加 `safePost`：

```typescript
export async function safePost(
  client: WebClient,
  channel: string,
  text: string,
  threadTs?: string,
): Promise<void> {
  if (!text) return;
  const chunks = splitToBlocks(text);
  for (const chunk of chunks) {
    await client.chat.postMessage({ channel, text: chunk, thread_ts: threadTs });
  }
}
```

- [ ] **Step 2: 实现 safeUpdate**

紧接 `safePost` 之后添加：

```typescript
export async function safeUpdate(
  client: WebClient,
  channel: string,
  ts: string,
  text: string,
  threadTs?: string,
  lastSegment = 0,
): Promise<number> {
  if (!text) {
    await client.chat.update({ channel, ts, text: '' });
    return lastSegment;
  }
  const chunks = splitToBlocks(text);
  await client.chat.update({ channel, ts, text: chunks[0] });
  for (let i = lastSegment + 1; i < chunks.length; i++) {
    await client.chat.postMessage({ channel, text: chunks[i], thread_ts: threadTs });
  }
  return Math.max(lastSegment, chunks.length - 1);
}
```

- [ ] **Step 3: 构建验证**

Run: `npm run build`
Expected: 编译成功，无错误

- [ ] **Step 4: Commit**

```bash
git add src/utils/message.ts
git commit -m "feat: add safePost and safeUpdate message helpers"
```

---

### Task 2: 改造 handleClaude（flush + error handler）

**Files:**
- Modify: `src/commands/index.ts:17,73,116-174`

- [ ] **Step 1: 更新 import**

将第 17 行：
```typescript
import { splitToBlocks, markdownToSlack } from '../utils/message.js';
```
改为：
```typescript
import { markdownToSlack, safePost, safeUpdate } from '../utils/message.js';
```

- [ ] **Step 2: 删除 MAX_MSG_LEN 常量**

删除第 73 行 `const MAX_MSG_LEN = 3800;`（不再需要）。

- [ ] **Step 3: 替换 flush 函数和 segmentIndex**

将 116-149 行（`let content = ''` 到 flush 函数 `};`）替换为：

```typescript
  let content = '';
  let lastUpdate = 0;
  let lastSegment = 0;

  const flush = async (final = false) => {
    const now = Date.now();
    if (!final && now - lastUpdate < THROTTLE_MS) return;
    lastUpdate = now;
    const text = final ? markdownToSlack(content) : content;
    lastSegment = await safeUpdate(client, channel, msgTs, text || '思考中...', threadTs, lastSegment);
  };
```

- [ ] **Step 4: 更新日志中的 segments 计算**

将：
```typescript
    const segments = content.length <= MAX_MSG_LEN ? 1 : splitToBlocks(content).length;
```
改为：
```typescript
    const segments = lastSegment + 1;
```

- [ ] **Step 5: 替换 error handler**

将 catch 块替换为：

```typescript
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (!content) {
      await client.chat.update({ channel, ts: msgTs, text: `出错: ${errMsg}` });
    } else {
      await safePost(client, channel, `_（出错: ${errMsg}）_`, threadTs);
    }
  } finally {
```

- [ ] **Step 6: 构建验证**

Run: `npm run build`
Expected: 编译成功，无错误

- [ ] **Step 7: Commit**

```bash
git add src/commands/index.ts
git commit -m "refactor: handleClaude use safeUpdate/safePost"
```

---

### Task 3: 改造 handleGemini

**Files:**
- Modify: `src/commands/gemini.ts:3,22-36`

- [ ] **Step 1: 更新 import**

将第 3 行：
```typescript
import { splitToBlocks, markdownToSlack } from '../utils/message.js';
```
改为：
```typescript
import { markdownToSlack, safeUpdate } from '../utils/message.js';
```

- [ ] **Step 2: 替换手动分段逻辑**

将 try 块内的 reply 处理（24-36 行）替换为：

```typescript
    const reply = await askGemini(prompt, threadTs);
    await safeUpdate(client, channel, initial.ts!, markdownToSlack(reply), threadTs);
```

- [ ] **Step 3: 构建验证**

Run: `npm run build`
Expected: 编译成功，无错误

- [ ] **Step 4: Commit**

```bash
git add src/commands/gemini.ts
git commit -m "refactor: gemini use safeUpdate"
```

---

### Task 4: 改造 daily-report（命令 + 调度器）

**Files:**
- Modify: `src/commands/daily-report.ts:6,216-247`
- Modify: `src/scheduler/daily-report.ts:6,21-25`

- [ ] **Step 1: 更新 `commands/daily-report.ts` import**

将第 6 行：
```typescript
import { splitToBlocks } from '../utils/message.js';
```
改为：
```typescript
import { safePost } from '../utils/message.js';
```

- [ ] **Step 2: 改造 handleResetDailyReport**

函数签名从 `{ say, threadTs }` 改为 `{ client, channel, threadTs }`。

将 `say()` 调用改为 `client.chat.postMessage()`，将手动分段改为 `safePost`：

```typescript
export async function handleResetDailyReport({ client, channel, threadTs }: CommandContext) {
  const milestone = await getLatestActiveMilestone();
  const today = todayStr();
  const path = snapshotPath(milestone.title, today);

  try {
    const { unlink } = await import('node:fs/promises');
    await unlink(path);
  } catch { /* 文件不存在则忽略 */ }

  await clearRunToday('daily-report');
  await client.chat.postMessage({ channel, text: '已清除今日快照，正在重新生成...', thread_ts: threadTs });

  const report = await generateDailyReport(milestone);
  await safePost(client, channel, report, threadTs);
}
```

- [ ] **Step 3: 改造 handleDailyReport**

函数签名从 `{ text, say, threadTs }` 改为 `{ text, client, channel, threadTs }`。

```typescript
export async function handleDailyReport({ text, client, channel, threadTs }: CommandContext) {
  const titleArg = text.replace(/^daily-report\s*/i, '').trim();
  const milestone = titleArg
    ? await getMilestoneByTitle(titleArg)
    : await getLatestActiveMilestone();

  const report = await generateDailyReport(milestone);
  await safePost(client, channel, report, threadTs);
}
```

- [ ] **Step 4: 改造 `scheduler/daily-report.ts`**

将第 6 行 import 从 `splitToBlocks` 改为 `safePost`。

将 21-25 行替换为：
```typescript
      const report = await generateDailyReport(milestone);
      await safePost(slackApp.client, channel, report);
```

- [ ] **Step 5: 构建验证**

Run: `npm run build`
Expected: 编译成功，无错误

- [ ] **Step 6: Commit**

```bash
git add src/commands/daily-report.ts src/scheduler/daily-report.ts
git commit -m "refactor: daily-report use safePost"
```

---

### Task 5: 改造 list-milestones 和 list-milestone-issues

**Files:**
- Modify: `src/commands/list-milestones.ts:1-22`
- Modify: `src/commands/list-milestone-issues.ts:1-49`

- [ ] **Step 1: 改造 list-milestones.ts**

添加 import 并替换 `say()` 调用：

```typescript
import { getActiveMilestones } from '../services/gitlab.js';
import { safePost } from '../utils/message.js';
import type { CommandContext } from './index.js';

export async function handleListMilestones({ client, channel, threadTs }: CommandContext) {
  const milestones = await getActiveMilestones();
  if (milestones.length === 0) {
    await client.chat.postMessage({ channel, text: '当前没有活跃的 milestone', thread_ts: threadTs });
    return;
  }

  const lines = ['*活跃 Milestones:*', ''];
  for (const m of milestones) {
    const dateInfo = m.start_date && m.due_date
      ? `起止: ${m.start_date} ~ ${m.due_date}`
      : m.start_date
        ? `开始: ${m.start_date}`
        : `创建: ${m.created_at.slice(0, 10)}`;
    lines.push(`• *${m.title}* (iid: ${m.iid}, ${dateInfo}) — ${m.web_url}`);
  }

  await safePost(client, channel, lines.join('\n'), threadTs);
}
```

- [ ] **Step 2: 改造 list-milestone-issues.ts**

添加 import，函数签名改为 `{ text, client, channel, threadTs }`，替换两处 `say()` 调用：

```typescript
import { getIssues } from '../services/gitlab.js';
import { safePost } from '../utils/message.js';
import type { CommandContext } from './index.js';
```

第 9 行用法提示改为：
```typescript
    await client.chat.postMessage({ channel, text: '用法: `list-issues <milestone标题>`，例如: `list-issues 10.32`', thread_ts: threadTs });
```

第 48 行结果改为：
```typescript
  await safePost(client, channel, lines.join('\n'), threadTs);
```

- [ ] **Step 3: 构建验证**

Run: `npm run build`
Expected: 编译成功，无错误

- [ ] **Step 4: Commit**

```bash
git add src/commands/list-milestones.ts src/commands/list-milestone-issues.ts
git commit -m "refactor: list commands use safePost"
```

---

### Task 6: 最终清理 + 验证

- [ ] **Step 1: 检查 splitToBlocks 是否仍有外部导入**

搜索所有文件中 `splitToBlocks` 的 import。如果已无外部消费者，将其从 `export` 改为内部函数。

- [ ] **Step 2: 完整构建**

Run: `npm run build`
Expected: 编译成功，无错误

- [ ] **Step 3: Commit（如有清理变更）**

```bash
git add src/utils/message.ts
git commit -m "refactor: unexport splitToBlocks (now internal)"
```
