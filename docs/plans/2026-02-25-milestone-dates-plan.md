# Milestone 日期功能实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 创建 milestone 时设置起止日期，列出 milestone 时显示日期。

**Architecture:** 修改 GitLab service 层传递日期参数，命令层解析可选 due_date 并计算默认值。

**Tech Stack:** TypeScript, GitLab REST API

---

### Task 1: 扩展 GitLabMilestone 接口和 createMilestone 函数

**Files:**
- Modify: `src/services/gitlab.ts`

**Step 1: 修改 GitLabMilestone 接口**

```typescript
interface GitLabMilestone {
  id: number;
  iid: number;
  title: string;
  created_at: string;
  start_date: string | null;
  due_date: string | null;
  web_url: string;
  state: string;
}
```

**Step 2: 修改 createMilestone 函数签名和实现**

```typescript
export async function createMilestone(title: string, startDate: string, dueDate: string): Promise<GitLabMilestone> {
  return gitlabFetch<GitLabMilestone>('milestones', {
    method: 'POST',
    body: JSON.stringify({ title, start_date: startDate, due_date: dueDate }),
  });
}
```

**Step 3: 验证编译**

Run: `npx tsc --noEmit`

---

### Task 2: 修改 create-milestone 命令解析日期

**Files:**
- Modify: `src/commands/create-milestone.ts`

**Step 1: 修改参数解析和日期计算**

解析逻辑：从 `create-milestone 10.32 2026-03-15` 中提取版本号和可选日期。

```typescript
const args = text.replace(/^create-milestone\s*/i, '').trim().split(/\s+/);
const version = args[0];
if (!version) {
  await say({ text: '用法: `create-milestone <版本号> [结束日期]`，例如: `create-milestone 10.32` 或 `create-milestone 10.32 2026-03-15`', thread_ts: threadTs });
  return;
}

const today = new Date();
const startDate = today.toISOString().slice(0, 10);
let dueDate: string;
if (args[1]) {
  dueDate = args[1];
} else {
  const due = new Date(today);
  due.setDate(due.getDate() + 14);
  dueDate = due.toISOString().slice(0, 10);
}

const milestone = await createMilestone(version, startDate, dueDate);
results.push(`Milestone: *${version}* (已创建, 起止: ${startDate} ~ ${dueDate})`);
```

**Step 2: 验证编译**

Run: `npx tsc --noEmit`

---

### Task 3: 修改 list-milestones 显示日期

**Files:**
- Modify: `src/commands/list-milestones.ts`

**Step 1: 修改显示格式**

```typescript
for (const m of milestones) {
  const dates = m.start_date && m.due_date
    ? `起止: ${m.start_date} ~ ${m.due_date}`
    : m.start_date
      ? `开始: ${m.start_date}`
      : `创建: ${m.created_at.slice(0, 10)}`;
  lines.push(`• *${m.title}* (iid: ${m.iid}, ${dates}) — ${m.web_url}`);
}
```

**Step 2: 验证编译并测试**

Run: `npx tsc --noEmit`
Run: `npm run dev` 手动验证

---

### Task 4: 更新文档

**Files:**
- Modify: `CLAUDE.md` — 命令路由说明中补充 create-milestone 格式变更
