# /commands 功能实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 用户 `@bot commands` 时，扫描 `.claude/commands/` 目录列出所有自定义 slash commands。

**Architecture:** 新建 `commands.ts` 模块读取全局和项目级 `.claude/commands/` 目录下的 `.md` 文件，文件名即命令名。在路由中增加 `commands` 匹配，help 文本中增加说明。

**Tech Stack:** Node.js fs/promises, os.homedir()

---

### Task 1: 创建 commands 处理模块

**Files:**
- Create: `src/commands/commands.ts`

**Step 1: 创建 `src/commands/commands.ts`**

```typescript
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getConfig } from '../config/index.js';
import type { CommandContext } from './index.js';

async function listMdFiles(dir: string): Promise<string[]> {
  try {
    const files = await readdir(dir);
    return files
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace(/\.md$/, ''))
      .sort();
  } catch {
    return [];
  }
}

function formatSection(label: string, commands: string[]): string {
  if (commands.length === 0) return `${label}\n（无）`;
  return `${label}\n${commands.map(c => `• \`/${c}\``).join('\n')}`;
}

export async function handleCommands({ say, threadTs }: CommandContext) {
  const globalDir = join(homedir(), '.claude', 'commands');
  const globalCmds = await listMdFiles(globalDir);

  const projectDir = getConfig().claude.projectDir;
  let projectCmds: string[] = [];
  if (projectDir) {
    projectCmds = await listMdFiles(join(projectDir, '.claude', 'commands'));
  }

  const text = [
    '*Claude 自定义 Commands:*',
    '',
    formatSection('📂 全局命令 (~/.claude/commands/):', globalCmds),
    '',
    formatSection(
      `📂 项目命令 (${projectDir ? 'project' : '-'}/.claude/commands/):`,
      projectCmds,
    ),
  ].join('\n');

  await say({ text, thread_ts: threadTs });
}
```

**Step 2: 确认文件编译通过**

Run: `npx tsc --noEmit`
Expected: 无错误

---

### Task 2: 路由中增加 commands 匹配

**Files:**
- Modify: `src/commands/index.ts:3,83-86`

**Step 1: 在 index.ts 中导入 handleCommands**

在第 3 行 `import { handleHelp }` 后添加：
```typescript
import { handleCommands } from './commands.js';
```

**Step 2: 在路由 if/else 中增加 commands 分支**

将第 83-86 行：
```typescript
      if (/^help$/i.test(text)) {
        await handleHelp(ctx);
      } else {
        await handleClaude(ctx);
```

改为：
```typescript
      if (/^help$/i.test(text)) {
        await handleHelp(ctx);
      } else if (/^commands$/i.test(text)) {
        await handleCommands(ctx);
      } else {
        await handleClaude(ctx);
```

**Step 3: 确认编译通过**

Run: `npx tsc --noEmit`
Expected: 无错误

---

### Task 3: 更新 help 文本

**Files:**
- Modify: `src/commands/help.ts:3-6`

**Step 1: 在 HELP_TEXT 中增加 commands 说明**

将：
```typescript
const HELP_TEXT = `*GSSlackRobot 可用指令:*

• \`help\` — 显示此帮助信息
• \`<任意问题>\` — 直接与 Claude AI 对话`;
```

改为：
```typescript
const HELP_TEXT = `*GSSlackRobot 可用指令:*

• \`help\` — 显示此帮助信息
• \`commands\` — 列出所有 Claude 自定义 Commands
• \`<任意问题>\` — 直接与 Claude AI 对话`;
```

**Step 2: 确认编译通过**

Run: `npx tsc --noEmit`
Expected: 无错误

**Step 3: Commit**

```bash
git add src/commands/commands.ts src/commands/index.ts src/commands/help.ts
git commit -m "feat: add /commands to list Claude custom slash commands"
```
