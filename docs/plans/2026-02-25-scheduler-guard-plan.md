# Scheduler Guard 实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为所有调度任务提供通用的"今日已执行"幂等检查，防止重启后重复执行。

**Architecture:** 新建 `scheduler-guard.ts` 工具模块，通过 `data/scheduler-state.json` 文件持久化每个任务的最后执行日期。两个调度器（jenkins-cron、daily-report）统一使用该机制。

**Tech Stack:** Node.js fs/promises, JSON 文件存储

---

### Task 1: 创建 scheduler-guard 工具模块

**Files:**
- Create: `src/utils/scheduler-guard.ts`

**Step 1: 创建 scheduler-guard.ts**

```typescript
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const STATE_FILE = join(process.cwd(), 'data', 'scheduler-state.json');

async function loadState(): Promise<Record<string, string>> {
  try {
    return JSON.parse(await readFile(STATE_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

export async function hasRunToday(taskKey: string): Promise<boolean> {
  const state = await loadState();
  return state[taskKey] === new Date().toISOString().slice(0, 10);
}

export async function markRunToday(taskKey: string): Promise<void> {
  const state = await loadState();
  state[taskKey] = new Date().toISOString().slice(0, 10);
  await mkdir(join(process.cwd(), 'data'), { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}
```

**Step 2: Commit**

```bash
git add src/utils/scheduler-guard.ts
git commit -m "feat: add scheduler-guard for idempotent daily task execution"
```

---

### Task 2: 集成到 jenkins-cron

**Files:**
- Modify: `src/scheduler/jenkins-cron.ts`

**Step 1: 修改 jenkins-cron.ts**

添加 import：
```typescript
import { hasRunToday, markRunToday } from '../utils/scheduler-guard.js';
```

修改 `now >= target` 分支，将立即执行改为先检查：

```typescript
    if (now >= target) {
      log.info(`jenkins-cron: ${job.jobName} 已过 ${job.hour}:${String(job.minute).padStart(2, '0')}，检查执行状态`);
      if (await hasRunToday(job.jobName)) {
        log.info(`jenkins-cron: ${job.jobName} 今天已执行，跳过`);
      } else {
        await execute();
        await markRunToday(job.jobName);
      }
    } else {
```

同时修改定时执行路径，在 setTimeout 回调中也加入 guard：

```typescript
      setTimeout(async () => {
        await execute();
        await markRunToday(job.jobName);
      }, delay);
```

注意：`scheduleJenkinsCronJobs` 函数需要改为 `async`，因为 `now >= target` 分支现在有 await。

**Step 2: Commit**

```bash
git add src/scheduler/jenkins-cron.ts
git commit -m "feat: jenkins-cron uses scheduler-guard to prevent duplicate execution"
```

---

### Task 3: 迁移 daily-report 调度器

**Files:**
- Modify: `src/scheduler/daily-report.ts`

**Step 1: 修改 daily-report.ts**

替换 import，移除 `hasTodaySnapshot`，添加 scheduler-guard：

```typescript
import type { App } from '@slack/bolt';
import { getConfig } from '../config/index.js';
import { generateDailyReport } from '../commands/daily-report.js';
import { getLatestActiveMilestoneTitle } from '../services/gitlab.js';
import { hasRunToday, markRunToday } from '../utils/scheduler-guard.js';
import { log } from '../utils/logger.js';
```

修改 execute 函数，用 scheduler-guard 替代 hasTodaySnapshot：

```typescript
  async function execute() {
    try {
      if (await hasRunToday('daily-report')) {
        log.info('daily-report 今天已执行，跳过');
        return;
      }
      const title = await getLatestActiveMilestoneTitle();
      const report = await generateDailyReport(title);
      await slackApp.client.chat.postMessage({ channel, text: report });
      await markRunToday('daily-report');
      log.info('daily-report 已发送');
    } catch (err) {
      log.error(`daily-report 调度失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
```

**Step 2: Commit**

```bash
git add src/scheduler/daily-report.ts
git commit -m "feat: daily-report uses scheduler-guard instead of hasTodaySnapshot"
```

---

### Task 4: 删除 hasTodaySnapshot

**Files:**
- Modify: `src/commands/daily-report.ts`

**Step 1: 删除 hasTodaySnapshot 函数（第 38-45 行）**

删除整个函数：
```typescript
// DELETE lines 38-45:
export async function hasTodaySnapshot(title: string): Promise<boolean> {
  try {
    await access(snapshotPath(title, todayStr()));
    return true;
  } catch {
    return false;
  }
}
```

同时检查 `access` import 是否仍被使用。`snapshotPath` 和 `todayStr` 仍被 `generateDailyReport` 使用所以保留。`access` 只被 `hasTodaySnapshot` 使用，删除 import 中的 `access`：

```typescript
import { readFile, writeFile, mkdir } from 'node:fs/promises';
```

**Step 2: Commit**

```bash
git add src/commands/daily-report.ts
git commit -m "refactor: remove unused hasTodaySnapshot"
```

---

### Task 5: 验证构建

**Step 1: 运行 build**

```bash
npm run build
```

Expected: 编译成功，无错误。

**Step 2: Commit（如有修正）**
