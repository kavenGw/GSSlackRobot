# Jenkins 定时任务 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 支持通过环境变量配置 Jenkins Job 定时触发，复用 daily-report 的 setTimeout 调度模式。

**Architecture:** 新增 `JENKINS_CRON_JOBS` 环境变量，解析为 cronJobs 配置。新增 `triggerJob` 服务函数调用 Jenkins Build API。新建调度器复用 daily-report 的定时逻辑。

**Tech Stack:** TypeScript, Node.js fetch API, Jenkins REST API

---

### Task 1: 扩展配置类型

**Files:**
- Modify: `src/config/schema.ts:34-38`

**Step 1: 在 JenkinsConfig 中添加 cronJobs 字段**

```typescript
export interface JenkinsCronJob {
  jobName: string;
  hour: number;
  minute: number;
}

export interface JenkinsConfig {
  url: string;
  username: string;
  apiToken: string;
  cronJobs?: JenkinsCronJob[];
}
```

**Step 2: Commit**

```bash
git add src/config/schema.ts
git commit -m "feat: add JenkinsCronJob type to config schema"
```

---

### Task 2: 解析 JENKINS_CRON_JOBS 环境变量

**Files:**
- Modify: `src/config/index.ts:65-69`

**Step 1: 在 jenkins 配置块中解析 cronJobs**

在 `loadConfig()` 的 jenkins 配置部分，解析 `JENKINS_CRON_JOBS`：

```typescript
jenkins: process.env.JENKINS_URL && process.env.JENKINS_USERNAME && process.env.JENKINS_API_TOKEN ? {
  url: process.env.JENKINS_URL,
  username: process.env.JENKINS_USERNAME,
  apiToken: process.env.JENKINS_API_TOKEN,
  cronJobs: process.env.JENKINS_CRON_JOBS
    ? process.env.JENKINS_CRON_JOBS.split(',').map(entry => {
        const trimmed = entry.trim();
        const spaceIdx = trimmed.lastIndexOf(' ');
        const jobName = trimmed.substring(0, spaceIdx);
        const [hour, minute] = trimmed.substring(spaceIdx + 1).split(':').map(Number);
        return { jobName, hour, minute };
      })
    : undefined,
} : undefined,
```

**Step 2: Commit**

```bash
git add src/config/index.ts
git commit -m "feat: parse JENKINS_CRON_JOBS env var"
```

---

### Task 3: 添加环境变量验证

**Files:**
- Modify: `src/config/env-validator.ts:174-182`

**Step 1: 在 jenkins 验证块后添加 cronJobs 验证**

在 `validateConfig()` 中 jenkins URL 验证之后添加：

```typescript
if (config.jenkins?.cronJobs) {
  for (const job of config.jenkins.cronJobs) {
    if (!job.jobName || !job.jobName.trim()) {
      errors.push({
        param: 'JENKINS_CRON_JOBS',
        message: 'Job name cannot be empty',
      });
    }
    if (isNaN(job.hour) || job.hour < 0 || job.hour > 23 ||
        isNaN(job.minute) || job.minute < 0 || job.minute > 59) {
      errors.push({
        param: 'JENKINS_CRON_JOBS',
        message: `Invalid time for job "${job.jobName}": hour must be 0-23, minute must be 0-59`,
        value: `${job.hour}:${job.minute}`,
      });
    }
  }
}
```

**Step 2: Commit**

```bash
git add src/config/env-validator.ts
git commit -m "feat: validate JENKINS_CRON_JOBS format"
```

---

### Task 4: 添加 triggerJob 服务函数

**Files:**
- Modify: `src/services/jenkins.ts`

**Step 1: 新增 triggerJob 函数**

在文件末尾添加：

```typescript
export async function triggerJob(jobName: string): Promise<void> {
  const cfg = getConfig().jenkins;
  if (!cfg) throw new Error('Jenkins 未配置');

  const auth = Buffer.from(`${cfg.username}:${cfg.apiToken}`).toString('base64');
  const res = await fetch(`${cfg.url}/job/${encodeURIComponent(jobName)}/build`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
    },
  });

  if (!res.ok) throw new Error(`Jenkins trigger ${jobName} failed: ${res.status} ${await res.text()}`);
}
```

**Step 2: Commit**

```bash
git add src/services/jenkins.ts
git commit -m "feat: add triggerJob function for Jenkins Build API"
```

---

### Task 5: 创建 Jenkins 定时调度器

**Files:**
- Create: `src/scheduler/jenkins-cron.ts`

**Step 1: 实现调度器**

```typescript
import { getConfig } from '../config/index.js';
import { triggerJob } from '../services/jenkins.js';
import { log } from '../utils/logger.js';

export function scheduleJenkinsCronJobs() {
  const cfg = getConfig();
  if (!cfg.jenkins?.cronJobs?.length) return;

  for (const job of cfg.jenkins.cronJobs) {
    const now = new Date();
    const target = new Date(now);
    target.setHours(job.hour, job.minute, 0, 0);

    const execute = async () => {
      try {
        await triggerJob(job.jobName);
        log.info(`jenkins-cron: ${job.jobName} 已触发`);
      } catch (err) {
        log.error(`jenkins-cron: ${job.jobName} 触发失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    };

    if (now >= target) {
      execute();
    } else {
      const delay = target.getTime() - now.getTime();
      log.info(`jenkins-cron: ${job.jobName} 将在 ${Math.round(delay / 60000)} 分钟后执行`);
      setTimeout(execute, delay);
    }
  }
}
```

**Step 2: Commit**

```bash
git add src/scheduler/jenkins-cron.ts
git commit -m "feat: add Jenkins cron job scheduler"
```

---

### Task 6: 注册调度器到入口

**Files:**
- Modify: `src/app.ts:6,29`

**Step 1: 导入并调用**

添加 import：
```typescript
import { scheduleJenkinsCronJobs } from './scheduler/jenkins-cron.js';
```

在 `scheduleDailyReport(app);` 之后添加：
```typescript
scheduleJenkinsCronJobs();
```

**Step 2: 验证构建**

Run: `npm run build`
Expected: 无错误

**Step 3: Commit**

```bash
git add src/app.ts
git commit -m "feat: register Jenkins cron scheduler at startup"
```

---

### Task 7: 更新 CLAUDE.md 文档

**Files:**
- Modify: `CLAUDE.md`

**Step 1: 在环境变量可选参数表中添加 JENKINS_CRON_JOBS**

在 `JENKINS_API_TOKEN` 行后添加：

| `JENKINS_CRON_JOBS` | 无 | Jenkins 定时任务（格式：`JobName HH:MM[,...]`） |

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add JENKINS_CRON_JOBS to env var docs"
```
