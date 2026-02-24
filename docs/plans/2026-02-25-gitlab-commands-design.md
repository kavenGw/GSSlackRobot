# GitLab 命令迁移 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 GSTetris 的 4 个 GitLab 相关 Claude Code slash commands 迁移为 SlackBot 内置功能，直接调用 GitLab/Jenkins REST API，并添加 daily-report 定时调度。

**Architecture:** 新增 gitlab.ts / jenkins.ts 服务层封装 REST API，4 个命令文件各自调用服务层，命令路由在 commands/index.ts 扩展。daily-report 通过 scheduler 模块在启动时按条件调度。

**Tech Stack:** TypeScript, Node.js fetch API, Express (已有), Slack Bolt

---

### Task 1: 配置层 — schema + loadConfig + 验证

**Files:**
- Modify: `src/config/schema.ts`
- Modify: `src/config/index.ts`
- Modify: `src/config/env-validator.ts`

**Step 1: 扩展 schema.ts 类型定义**

在 `AppConfig` 中新增 `gitlab?` 和 `jenkins?` 配置块：

```typescript
export interface GitLabConfig {
  apiUrl: string;
  token: string;
  projectId: string;
}

export interface JenkinsConfig {
  url: string;
  username: string;
  apiToken: string;
}

export interface AppConfig {
  slack: SlackConfig;
  claude: ClaudeConfig;
  gitlabNotify?: GitLabNotifyConfig;
  gitlab?: GitLabConfig;
  jenkins?: JenkinsConfig;
}
```

**Step 2: 扩展 loadConfig()**

在 `src/config/index.ts` 的 `loadConfig()` 中，gitlabNotify 之后添加：

```typescript
gitlab: process.env.GITLAB_API_URL && process.env.GITLAB_TOKEN && process.env.GITLAB_PROJECT_ID ? {
  apiUrl: process.env.GITLAB_API_URL,
  token: process.env.GITLAB_TOKEN,
  projectId: process.env.GITLAB_PROJECT_ID,
} : undefined,

jenkins: process.env.JENKINS_URL && process.env.JENKINS_USERNAME && process.env.JENKINS_API_TOKEN ? {
  url: process.env.JENKINS_URL,
  username: process.env.JENKINS_USERNAME,
  apiToken: process.env.JENKINS_API_TOKEN,
} : undefined,
```

**Step 3: 添加验证规则**

在 `env-validator.ts` 的 `validateConfig()` 中添加：

```typescript
if (config.gitlab) {
  if (!isValidUrl(config.gitlab.apiUrl)) {
    errors.push({
      param: 'GITLAB_API_URL',
      message: 'GitLab API URL must be a valid HTTP/HTTPS URL',
      value: config.gitlab.apiUrl,
    });
  }
  if (!isValidToken(config.gitlab.token)) {
    errors.push({
      param: 'GITLAB_TOKEN',
      message: 'GitLab Token cannot be a placeholder value',
    });
  }
}

if (config.jenkins) {
  if (!isValidUrl(config.jenkins.url)) {
    errors.push({
      param: 'JENKINS_URL',
      message: 'Jenkins URL must be a valid HTTP/HTTPS URL',
      value: config.jenkins.url,
    });
  }
}
```

**Step 4: 更新 .env.example**

添加新环境变量示例。

**Step 5: 验证编译通过**

Run: `npm run build`
Expected: 编译成功，无报错

**Step 6: Commit**

```
feat: 添加 GitLab/Jenkins 配置支持
```

---

### Task 2: GitLab 服务层

**Files:**
- Create: `src/services/gitlab.ts`

**Step 1: 实现 gitlab.ts**

```typescript
import { getConfig } from '../config/index.js';

interface GitLabMilestone {
  id: number;
  iid: number;
  title: string;
  created_at: string;
  web_url: string;
  state: string;
}

interface GitLabIssue {
  id: number;
  iid: number;
  title: string;
  state: string;
  labels: string[];
  assignee: { username: string } | null;
}

function getGitLab() {
  const cfg = getConfig().gitlab;
  if (!cfg) throw new Error('GitLab 未配置');
  return cfg;
}

async function gitlabFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const cfg = getGitLab();
  const url = `${cfg.apiUrl}/projects/${encodeURIComponent(cfg.projectId)}/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'PRIVATE-TOKEN': cfg.token,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitLab API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function getActiveMilestones(): Promise<GitLabMilestone[]> {
  const data = await gitlabFetch<GitLabMilestone[]>('milestones?state=active');
  return data.sort((a, b) => b.title.localeCompare(a.title));
}

export async function getLatestActiveMilestoneTitle(): Promise<string> {
  const milestones = await getActiveMilestones();
  if (milestones.length === 0) throw new Error('没有活跃的 milestone');
  return milestones[0].title;
}

export async function getIssues(milestone: string, state: 'opened' | 'closed'): Promise<GitLabIssue[]> {
  return gitlabFetch<GitLabIssue[]>(
    `issues?milestone=${encodeURIComponent(milestone)}&state=${state}&per_page=100`
  );
}

export async function createMilestone(title: string): Promise<GitLabMilestone> {
  return gitlabFetch<GitLabMilestone>('milestones', {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
}

export async function createIssue(
  title: string,
  description: string,
  milestoneId: number,
): Promise<GitLabIssue> {
  return gitlabFetch<GitLabIssue>('issues', {
    method: 'POST',
    body: JSON.stringify({ title, description, milestone_id: milestoneId }),
  });
}

export type { GitLabMilestone, GitLabIssue };
```

**Step 2: 验证编译**

Run: `npm run build`

**Step 3: Commit**

```
feat: 添加 GitLab REST API 服务层
```

---

### Task 3: Jenkins 服务层

**Files:**
- Create: `src/services/jenkins.ts`

**Step 1: 实现 jenkins.ts**

```typescript
import { getConfig } from '../config/index.js';

export async function updateCommitMsg(value: string): Promise<string> {
  const cfg = getConfig().jenkins;
  if (!cfg) throw new Error('Jenkins 未配置');

  const script = `
import jenkins.model.*
import hudson.slaves.EnvironmentVariablesNodeProperty

def instance = Jenkins.getInstance()
def globalNodeProperties = instance.getGlobalNodeProperties()
def envVars = globalNodeProperties.getAll(EnvironmentVariablesNodeProperty.class)

def newValue = "${value.replace(/"/g, '\\"')}"

if (envVars.size() > 0) {
    envVars.get(0).getEnvVars().put('COMMIT_MSG', newValue)
} else {
    globalNodeProperties.add(new EnvironmentVariablesNodeProperty(
        new EnvironmentVariablesNodeProperty.Entry('COMMIT_MSG', newValue)
    ))
}
instance.save()
println('COMMIT_MSG updated to: ' + newValue)
`.trim();

  const auth = Buffer.from(`${cfg.username}:${cfg.apiToken}`).toString('base64');
  const res = await fetch(`${cfg.url}/scriptText`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `script=${encodeURIComponent(script)}`,
  });

  if (!res.ok) throw new Error(`Jenkins API ${res.status}: ${await res.text()}`);
  const result = await res.text();
  if (!result.includes('COMMIT_MSG updated to')) {
    throw new Error(`Jenkins 返回异常: ${result}`);
  }
  return result.trim();
}
```

**Step 2: 验证编译**

Run: `npm run build`

**Step 3: Commit**

```
feat: 添加 Jenkins Script Console 服务层
```

---

### Task 4: list-milestones 命令

**Files:**
- Create: `src/commands/list-milestones.ts`
- Modify: `src/commands/index.ts`

**Step 1: 实现 list-milestones.ts**

```typescript
import { getActiveMilestones } from '../services/gitlab.js';
import type { CommandContext } from './index.js';

export async function handleListMilestones({ say, threadTs }: CommandContext) {
  const milestones = await getActiveMilestones();
  if (milestones.length === 0) {
    await say({ text: '当前没有活跃的 milestone', thread_ts: threadTs });
    return;
  }

  const lines = ['*活跃 Milestones:*', ''];
  for (const m of milestones) {
    lines.push(`• *${m.title}* (iid: ${m.iid}, 创建: ${m.created_at.slice(0, 10)}) — ${m.web_url}`);
  }

  await say({ text: lines.join('\n'), thread_ts: threadTs });
}
```

**Step 2: 在 index.ts 中添加路由**

在 `registerCommands` 的 try 块中，`commands` 分支后添加：

```typescript
} else if (/^list-milestones$/i.test(text)) {
  await handleListMilestones(ctx);
```

**Step 3: 验证编译**

Run: `npm run build`

**Step 4: Commit**

```
feat: 添加 list-milestones 命令
```

---

### Task 5: list-issues 命令

**Files:**
- Create: `src/commands/list-milestone-issues.ts`
- Modify: `src/commands/index.ts`

**Step 1: 实现 list-milestone-issues.ts**

核心逻辑：获取 opened + closed issues，opened 中按 labels 区分「待测试」和「未完成」，按 assignee 分组输出。

```typescript
import { getIssues } from '../services/gitlab.js';
import type { CommandContext } from './index.js';

const TESTING_LABELS = new Set(['待审核', '待审核未打包']);

export async function handleListMilestoneIssues({ text, say, threadTs }: CommandContext) {
  const title = text.replace(/^list-issues\s*/i, '').trim();
  if (!title) {
    await say({ text: '用法: `list-issues <milestone标题>`，例如: `list-issues 10.32`', thread_ts: threadTs });
    return;
  }

  const [opened, closed] = await Promise.all([
    getIssues(title, 'opened'),
    getIssues(title, 'closed'),
  ]);

  const incomplete = opened.filter(i => !i.labels.some(l => TESTING_LABELS.has(l)));
  const testing = opened.filter(i => i.labels.some(l => TESTING_LABELS.has(l)));

  const lines = [`*版本 ${title} 状态报告*`, ''];

  if (incomplete.length > 0) {
    const byAssignee = new Map<string, typeof incomplete>();
    for (const i of incomplete) {
      const name = i.assignee?.username ?? '未分配';
      if (!byAssignee.has(name)) byAssignee.set(name, []);
      byAssignee.get(name)!.push(i);
    }

    lines.push(`*== 未完成 (${incomplete.length}) ==*`, '');
    const sorted = [...byAssignee.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
    for (const [assignee, issues] of sorted) {
      lines.push(`*${assignee}* (${issues.length}):`);
      for (const i of issues) {
        const labels = i.labels.length > 0 ? ` | ${i.labels.join(',')}` : '';
        lines.push(`  #${i.iid} ${i.title}${labels}`);
      }
      lines.push('');
    }
  }

  lines.push(`*== 统计 ==*`);
  lines.push(`未完成: ${incomplete.length} | 待测试: ${testing.length} | 已完成: ${closed.length}`);

  await say({ text: lines.join('\n'), thread_ts: threadTs });
}
```

**Step 2: 添加路由**

```typescript
} else if (/^list-issues\b/i.test(text)) {
  await handleListMilestoneIssues(ctx);
```

**Step 3: 验证编译 + Commit**

```
feat: 添加 list-issues 命令
```

---

### Task 6: create-milestone 命令

**Files:**
- Create: `src/commands/create-milestone.ts`
- Modify: `src/commands/index.ts`

**Step 1: 实现 create-milestone.ts**

```typescript
import { createMilestone, createIssue } from '../services/gitlab.js';
import { updateCommitMsg } from '../services/jenkins.js';
import { getConfig } from '../config/index.js';
import type { CommandContext } from './index.js';

const MISC_ISSUE_DESCRIPTION = `# 正式包

 1. 版本号（playersetting、jenkins）
 2. Android Bundle Version Code
 3. 充值测试
 4. 广告测试
 5. 对战测试
 6. GM开关
 7. 新手引导
 8. symbol.zip
 9. Gitlab备份
10. 翻译表&字体 繁体、英文、阿拉伯语验证
11. traiversion确认
12. Jenkins patch、打包提交的单号
13. 安装包大小: AAB(88822) APK(97104)

# SteamDemo包

1. 关卡解锁
2. steam id
3. 主界面愿望单按钮`;

export async function handleCreateMilestone({ text, say, threadTs }: CommandContext) {
  const version = text.replace(/^create-milestone\s*/i, '').trim();
  if (!version) {
    await say({ text: '用法: `create-milestone <版本号>`，例如: `create-milestone 10.32`', thread_ts: threadTs });
    return;
  }

  const results: string[] = [];

  const milestone = await createMilestone(version);
  results.push(`Milestone: *${version}* (已创建)`);

  const issueTitle = `${version}杂项`;
  const issue = await createIssue(issueTitle, MISC_ISSUE_DESCRIPTION, milestone.id);
  results.push(`Issue: *#${issue.iid} ${issueTitle}* (已创建)`);

  if (getConfig().jenkins) {
    const commitMsg = `ref #${issue.iid} ${issueTitle}`;
    await updateCommitMsg(commitMsg);
    results.push(`Jenkins COMMIT_MSG: \`${commitMsg}\` (已修改)`);
  } else {
    results.push('Jenkins 未配置，跳过 COMMIT_MSG 修改');
  }

  await say({ text: results.join('\n'), thread_ts: threadTs });
}
```

**Step 2: 添加路由**

```typescript
} else if (/^create-milestone\b/i.test(text)) {
  await handleCreateMilestone(ctx);
```

**Step 3: 验证编译 + Commit**

```
feat: 添加 create-milestone 命令
```

---

### Task 7: daily-report 命令 + 格式化

**Files:**
- Create: `src/commands/daily-report.ts`
- Modify: `src/commands/index.ts`

**Step 1: 实现 daily-report.ts**

核心逻辑：获取 issues 数据 → 读取昨日快照对比 → 保存今日快照 → 格式化输出。

快照文件位置: `data/milestone-daily/<title>-<YYYY-MM-DD>.json`

导出两个函数：
- `handleDailyReport(ctx)` — Slack 命令触发，输出到 thread
- `generateDailyReport(title?)` — 返回 `{ text: string, snapshotSaved: boolean }`，供调度器和命令共用

```typescript
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { getIssues, getLatestActiveMilestoneTitle } from '../services/gitlab.js';
import type { CommandContext } from './index.js';

const TESTING_LABELS = new Set(['待审核', '待审核未打包']);
const DATA_DIR = join(process.cwd(), 'data', 'milestone-daily');

function today() { return new Date().toISOString().slice(0, 10); }
function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function snapshotPath(title: string, date: string) {
  return join(DATA_DIR, `${title}-${date}.json`);
}

export async function hasTodaySnapshot(title: string): Promise<boolean> {
  try { await access(snapshotPath(title, today())); return true; } catch { return false; }
}

// ... (完整的 generateDailyReport 和 handleDailyReport 实现)
// generateDailyReport 逻辑与源 daily-report.md 的 python 脚本等价
// 包含：分类 issues、保存快照、读取昨日快照对比、格式化文本
```

实现中 `generateDailyReport` 返回格式化文本，与源 python 脚本逻辑一致：
- 今日进度（新完成、新增待测试、新增 issue）
- 当前状态（未完成/待测试/已完成 + 昨日对比）
- 未完成详情（按 assignee 分组）
- 昨日变更（新完成、新增）

**Step 2: 添加路由**

```typescript
} else if (/^daily-report\b/i.test(text) || /^daily-report$/i.test(text)) {
  await handleDailyReport(ctx);
```

**Step 3: 验证编译 + Commit**

```
feat: 添加 daily-report 命令
```

---

### Task 8: 定时调度器

**Files:**
- Create: `src/scheduler/daily-report.ts`
- Modify: `src/app.ts`

**Step 1: 实现调度器**

```typescript
import type { App } from '@slack/bolt';
import { getConfig } from '../config/index.js';
import { generateDailyReport, hasTodaySnapshot } from '../commands/daily-report.js';
import { getLatestActiveMilestoneTitle } from '../services/gitlab.js';
import { log } from '../utils/logger.js';

export function scheduleDailyReport(slackApp: App) {
  const cfg = getConfig();
  if (!cfg.gitlab || !cfg.gitlabNotify) return;
  const channel = cfg.gitlabNotify.channel;

  async function execute() {
    try {
      const title = await getLatestActiveMilestoneTitle();
      if (await hasTodaySnapshot(title)) {
        log.info('daily-report 今天已执行，跳过');
        return;
      }
      const report = await generateDailyReport(title);
      await slackApp.client.chat.postMessage({ channel, text: report.text });
      log.info('daily-report 已发送');
    } catch (err) {
      log.error(`daily-report 调度失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const now = new Date();
  const nine = new Date(now);
  nine.setHours(9, 0, 0, 0);

  if (now >= nine) {
    execute();
  } else {
    const delay = nine.getTime() - now.getTime();
    log.info(`daily-report 将在 ${Math.round(delay / 60000)} 分钟后执行`);
    setTimeout(execute, delay);
  }
}
```

**Step 2: 在 app.ts 中调用**

在 `startWebhookServer(app)` 之后添加：

```typescript
import { scheduleDailyReport } from './scheduler/daily-report.js';
// ...
scheduleDailyReport(app);
```

**Step 3: 给 logger 添加 info 方法**

```typescript
info(msg: string) {
  console.log(`${ts()} ${chalk.blue('ℹ')} ${msg}`);
},
```

**Step 4: 验证编译 + Commit**

```
feat: 添加 daily-report 定时调度
```

---

### Task 9: 更新 help + GitLab 未配置保护 + 收尾

**Files:**
- Modify: `src/commands/help.ts`
- Modify: `src/commands/index.ts`
- Modify: `.env.example`
- Modify: `CLAUDE.md`

**Step 1: 更新 help 文本**

添加新命令说明：
```
• `list-milestones` — 列出活跃 GitLab milestones
• `list-issues <版本>` — 查看版本 issue 状态
• `daily-report [版本]` — 生成每日简报
• `create-milestone <版本>` — 创建 milestone + 杂项 issue
```

**Step 2: GitLab 未配置保护**

在 index.ts 中，GitLab 相关命令匹配前检查 `getConfig().gitlab`，未配置时回复提示。

**Step 3: 更新 .env.example 和 CLAUDE.md**

添加新环境变量文档。

**Step 4: 完整编译验证**

Run: `npm run build`

**Step 5: Commit**

```
feat: 更新 help 和文档，完成 GitLab 命令迁移
```
