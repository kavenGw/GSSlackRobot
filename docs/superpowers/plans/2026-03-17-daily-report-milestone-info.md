# 每日简报增加 Milestone 版本信息 实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每日简报展示当前 milestone 的起止日期和描述信息。

**Architecture:** 扩展 GitLab 服务层返回完整 milestone 对象，每日简报生成函数接收 milestone 对象而非 title 字符串，在标题行和描述行中展示新信息。

**Tech Stack:** TypeScript, GitLab REST API, Slack Bot

---

### Task 1: 扩展 GitLab 服务层

**Files:**
- Modify: `src/services/gitlab.ts:3-12` (GitLabMilestone 接口)
- Modify: `src/services/gitlab.ts:52-56` (getLatestActiveMilestoneTitle → getLatestActiveMilestone)

- [ ] **Step 1: `GitLabMilestone` 接口新增 `description` 字段**

```typescript
interface GitLabMilestone {
  id: number;
  iid: number;
  title: string;
  description: string | null;
  created_at: string;
  start_date: string | null;
  due_date: string | null;
  web_url: string;
  state: string;
}
```

- [ ] **Step 2: 删除 `getLatestActiveMilestoneTitle`，替换为 `getLatestActiveMilestone`**

删除原函数 `getLatestActiveMilestoneTitle`（第 52-56 行），替换为：

```typescript
export async function getLatestActiveMilestone(): Promise<GitLabMilestone> {
  const milestones = await getActiveMilestones();
  if (milestones.length === 0) throw new Error('没有活跃的 milestone');
  return milestones[0];
}
```

- [ ] **Step 3: 新增 `getMilestoneByTitle`**

在 `getLatestActiveMilestone` 下方添加：

```typescript
export async function getMilestoneByTitle(title: string): Promise<GitLabMilestone> {
  const milestones = await getActiveMilestones();
  const found = milestones.find(m => m.title === title);
  if (!found) throw new Error(`未找到活跃的 milestone: ${title}`);
  return found;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/services/gitlab.ts
git commit -m "feat: 扩展 GitLab 服务层返回完整 milestone 对象"
```

---

### Task 2: 改造每日简报生成函数

**Files:**
- Modify: `src/commands/daily-report.ts:3` (import)
- Modify: `src/commands/daily-report.ts:48-76` (generateDailyReport 签名和标题生成)

- [ ] **Step 1: 更新 import**

```typescript
import { getIssues, getLatestActiveMilestone, getMilestoneByTitle } from '../services/gitlab.js';
import type { GitLabMilestone, GitLabIssue } from '../services/gitlab.js';
```

- [ ] **Step 2: 修改 `generateDailyReport` 签名和标题生成**

函数签名改为：

```typescript
export async function generateDailyReport(milestone: GitLabMilestone): Promise<string> {
```

函数内部所有 `title` 变量引用改为 `milestone.title`（共 6 处）：

| 原代码 | 替换为 |
|--------|--------|
| `getIssues(title, 'opened')` | `getIssues(milestone.title, 'opened')` |
| `getIssues(title, 'closed')` | `getIssues(milestone.title, 'closed')` |
| `milestone: title` (DailySnapshot) | `milestone: milestone.title` |
| `snapshotPath(title, today)` (保存) | `snapshotPath(milestone.title, today)` |
| `snapshotPath(title, yesterdayStr())` | `snapshotPath(milestone.title, yesterdayStr())` |
| `snapshotPath(title, today)` (末尾输出) | `snapshotPath(milestone.title, today)` |

标题行和描述行替换为：

```typescript
  const dateRange = milestone.start_date && milestone.due_date
    ? `${milestone.start_date.slice(5)} ~ ${milestone.due_date.slice(5)}`
    : '日期: 未设置';
  const desc = milestone.description || '(未设置)';

  const lines: string[] = [
    `*每日简报 ${today} (版本 ${milestone.title} | ${dateRange})*`,
    `描述: ${desc}`,
    '',
  ];
```

- [ ] **Step 3: 修改 `handleResetDailyReport`**

```typescript
export async function handleResetDailyReport({ say, threadTs }: CommandContext) {
  const milestone = await getLatestActiveMilestone();
  const today = todayStr();
  const path = snapshotPath(milestone.title, today);

  try {
    const { unlink } = await import('node:fs/promises');
    await unlink(path);
  } catch { /* 文件不存在则忽略 */ }

  await clearRunToday('daily-report');
  await say({ text: `已清除今日快照，正在重新生成...`, thread_ts: threadTs });

  const report = await generateDailyReport(milestone);
  await say({ text: report, thread_ts: threadTs });
}
```

- [ ] **Step 4: 修改 `handleDailyReport`**

```typescript
export async function handleDailyReport({ text, say, threadTs }: CommandContext) {
  const titleArg = text.replace(/^daily-report\s*/i, '').trim();
  const milestone = titleArg
    ? await getMilestoneByTitle(titleArg)
    : await getLatestActiveMilestone();

  const report = await generateDailyReport(milestone);
  await say({ text: report, thread_ts: threadTs });
}
```

- [ ] **Step 5: Commit**

```bash
git add src/commands/daily-report.ts
git commit -m "feat: 每日简报展示 milestone 起止日期和描述"
```

---

### Task 3: 更新调度层

**Files:**
- Modify: `src/scheduler/daily-report.ts:4` (import)
- Modify: `src/scheduler/daily-report.ts:19-20` (调用)

- [ ] **Step 1: 更新 import 和调用**

```typescript
import { getLatestActiveMilestone } from '../services/gitlab.js';
```

```typescript
const milestone = await getLatestActiveMilestone();
const report = await generateDailyReport(milestone);
```

- [ ] **Step 2: Commit**

```bash
git add src/scheduler/daily-report.ts
git commit -m "refactor: 调度层适配 getLatestActiveMilestone"
```

---

### Task 4: 验证构建

- [ ] **Step 1: 运行 `npm run build` 确认编译通过**

```bash
npm run build
```

Expected: 无编译错误。
