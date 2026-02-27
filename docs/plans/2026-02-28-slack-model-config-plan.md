# Slack Claude 模型配置 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 支持在 Slack 中动态切换 Claude 模型（opus/sonnet/haiku）和 effort 级别（max/high/medium/low），持久化到文件。

**Architecture:** 新增 `src/services/settings.ts` 负责设置的读写和持久化（JSON 文件），新增 `src/commands/model.ts` 处理 model/effort 命令。修改 `src/services/claude.ts` 传递 `--model`/`--effort` 参数，修改 `src/commands/index.ts` 增加命令路由和前缀解析。

**Tech Stack:** TypeScript, Node.js fs/promises, JSON 文件存储

---

### Task 1: 创建 settings 服务

**Files:**
- Create: `src/services/settings.ts`

**Step 1: 创建 settings.ts**

定义类型和常量：

```typescript
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { log } from '../utils/logger.js';

export const CLAUDE_MODELS = ['opus', 'sonnet', 'haiku'] as const;
export const EFFORT_LEVELS = ['max', 'high', 'medium', 'low'] as const;

export type ClaudeModel = typeof CLAUDE_MODELS[number];
export type EffortLevel = typeof EFFORT_LEVELS[number];

export interface ClaudeSettings {
  model: ClaudeModel;
  effort: EffortLevel;
}

interface Settings {
  claude: ClaudeSettings;
}

const SETTINGS_PATH = 'data/settings.json';
const DEFAULTS: Settings = { claude: { model: 'sonnet', effort: 'high' } };

let settings: Settings = structuredClone(DEFAULTS);

export async function loadSettings(): Promise<void> {
  try {
    const raw = await readFile(SETTINGS_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Settings;
    if (parsed.claude) {
      if (CLAUDE_MODELS.includes(parsed.claude.model)) settings.claude.model = parsed.claude.model;
      if (EFFORT_LEVELS.includes(parsed.claude.effort)) settings.claude.effort = parsed.claude.effort;
    }
    log.info(`Settings loaded: model=${settings.claude.model}, effort=${settings.claude.effort}`);
  } catch {
    log.info('No settings file found, using defaults');
  }
}

async function save(): Promise<void> {
  await mkdir(dirname(SETTINGS_PATH), { recursive: true });
  await writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

export function getClaudeSettings(): ClaudeSettings {
  return settings.claude;
}

export async function updateClaudeModel(model: ClaudeModel, effort?: EffortLevel): Promise<void> {
  settings.claude.model = model;
  if (effort) settings.claude.effort = effort;
  await save();
}

export async function updateClaudeEffort(effort: EffortLevel): Promise<void> {
  settings.claude.effort = effort;
  await save();
}

export function isValidModel(value: string): value is ClaudeModel {
  return CLAUDE_MODELS.includes(value as ClaudeModel);
}

export function isValidEffort(value: string): value is EffortLevel {
  return EFFORT_LEVELS.includes(value as EffortLevel);
}
```

**Step 2: 验证编译**

Run: `npx tsc --noEmit`
Expected: 无错误

**Step 3: Commit**

```bash
git add src/services/settings.ts
git commit -m "feat: add settings service for Claude model/effort persistence"
```

---

### Task 2: 修改 claude.ts 支持 --model 和 --effort 参数

**Files:**
- Modify: `src/services/claude.ts:5` (函数签名)
- Modify: `src/services/claude.ts:15-27` (参数构建)

**Step 1: 修改 askClaude 函数签名和参数构建**

在 `src/services/claude.ts` 中：

1. 新增 import：
```typescript
import { getClaudeSettings } from './settings.js';
```

2. 修改函数签名（第 5 行）：
```typescript
export async function* askClaude(
  prompt: string,
  sessionId?: string,
  resume = false,
  model?: string,
  effort?: string,
): AsyncGenerator<string> {
```

3. 在 args 构建后（第 17 行之后），添加 --model 和 --effort：
```typescript
const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose'];

// 模型和 effort：优先使用传入参数，否则用全局设置
const claudeSettings = getClaudeSettings();
const activeModel = model ?? claudeSettings.model;
const activeEffort = effort ?? claudeSettings.effort;
args.push('--model', activeModel);
args.push('--effort', activeEffort);
```

**Step 2: 验证编译**

Run: `npx tsc --noEmit`
Expected: 无错误

**Step 3: Commit**

```bash
git add src/services/claude.ts
git commit -m "feat: pass --model and --effort to Claude CLI"
```

---

### Task 3: 创建 model 命令 handler

**Files:**
- Create: `src/commands/model.ts`

**Step 1: 创建 model.ts**

```typescript
import type { CommandContext } from './index.js';
import {
  getClaudeSettings, updateClaudeModel, updateClaudeEffort,
  isValidModel, isValidEffort,
  CLAUDE_MODELS, EFFORT_LEVELS,
  type ClaudeModel, type EffortLevel,
} from '../services/settings.js';

function validateMaxEffort(model: ClaudeModel, effort: EffortLevel): string | null {
  if (effort === 'max' && model !== 'opus') {
    return '`max` effort 仅 opus 模型可用';
  }
  return null;
}

export async function handleModel({ text, say, threadTs }: CommandContext) {
  const parts = text.replace(/^model\s*/i, '').trim().toLowerCase().split(/\s+/);

  // `model` — 查看当前设置
  if (!parts[0]) {
    const s = getClaudeSettings();
    await say({ text: `当前模型: *${s.model}* | effort: *${s.effort}*`, thread_ts: threadTs });
    return;
  }

  const modelArg = parts[0];
  const effortArg = parts[1];

  if (!isValidModel(modelArg)) {
    await say({ text: `无效模型 \`${modelArg}\`，可选: ${CLAUDE_MODELS.join(', ')}`, thread_ts: threadTs });
    return;
  }

  if (effortArg && !isValidEffort(effortArg)) {
    await say({ text: `无效 effort \`${effortArg}\`，可选: ${EFFORT_LEVELS.join(', ')}`, thread_ts: threadTs });
    return;
  }

  const effort = effortArg as EffortLevel | undefined;
  const errMsg = validateMaxEffort(modelArg, effort ?? getClaudeSettings().effort);
  if (errMsg) {
    await say({ text: errMsg, thread_ts: threadTs });
    return;
  }

  await updateClaudeModel(modelArg, effort);
  const s = getClaudeSettings();
  await say({ text: `已切换 → 模型: *${s.model}* | effort: *${s.effort}*`, thread_ts: threadTs });
}

export async function handleEffort({ text, say, threadTs }: CommandContext) {
  const effortArg = text.replace(/^effort\s*/i, '').trim().toLowerCase();

  if (!effortArg) {
    const s = getClaudeSettings();
    await say({ text: `当前 effort: *${s.effort}*`, thread_ts: threadTs });
    return;
  }

  if (!isValidEffort(effortArg)) {
    await say({ text: `无效 effort \`${effortArg}\`，可选: ${EFFORT_LEVELS.join(', ')}`, thread_ts: threadTs });
    return;
  }

  const errMsg = validateMaxEffort(getClaudeSettings().model, effortArg);
  if (errMsg) {
    await say({ text: errMsg, thread_ts: threadTs });
    return;
  }

  await updateClaudeEffort(effortArg);
  await say({ text: `已切换 effort → *${effortArg}*`, thread_ts: threadTs });
}
```

**Step 2: 验证编译**

Run: `npx tsc --noEmit`
Expected: 无错误

**Step 3: Commit**

```bash
git add src/commands/model.ts
git commit -m "feat: add model/effort command handlers"
```

---

### Task 4: 修改命令路由和前缀解析

**Files:**
- Modify: `src/commands/index.ts`

**Step 1: 添加 import**

在 import 区域添加：
```typescript
import { handleModel, handleEffort } from './model.js';
import { isValidModel, isValidEffort, type ClaudeModel, type EffortLevel } from '../services/settings.js';
```

**Step 2: 添加命令别名**

在 `COMMAND_ALIASES` 中添加：
```typescript
m: 'model',
```

**Step 3: 添加前缀解析函数**

在 `handleClaude` 函数之前添加：
```typescript
function parseModelPrefix(text: string): { prompt: string; model?: ClaudeModel; effort?: EffortLevel } {
  const words = text.split(/\s+/);
  if (words.length < 2) return { prompt: text };

  const first = words[0].toLowerCase();
  if (!isValidModel(first)) return { prompt: text };

  const second = words[1].toLowerCase();
  if (isValidEffort(second)) {
    return { prompt: words.slice(2).join(' '), model: first as ClaudeModel, effort: second as EffortLevel };
  }
  return { prompt: words.slice(1).join(' '), model: first as ClaudeModel };
}
```

**Step 4: 修改 handleClaude 使用前缀解析**

修改 `handleClaude` 函数，在开头解析前缀，并将 model/effort 传给 `askClaude`：

1. 在函数开头（第 56 行后）添加前缀解析：
```typescript
async function handleClaude({ text, channel, threadTs, client }: CommandContext) {
  const { prompt, model, effort } = parseModelPrefix(text);
  const startTime = Date.now();
  log.claudeStart(prompt.length);
```

2. 修改 `askClaude` 调用（原第 112 行），传入 model 和 effort：
```typescript
for await (const chunk of askClaude(prompt, sessionId, resume, model, effort)) {
```

3. 修改日志记录中的 prompt 引用（原第 124 行）：
```typescript
await saveConversationLog({ prompt, reply: content, durationMs, sessionId, resume, segments });
```

**Step 5: 添加 model/effort 命令路由**

在 `registerCommands` 中的路由区域（help 之后、gitlab 命令之前），添加：
```typescript
} else if (/^model\b/i.test(text)) {
  await handleModel(ctx);
} else if (/^effort\b/i.test(text)) {
  await handleEffort(ctx);
}
```

**Step 6: 验证编译**

Run: `npx tsc --noEmit`
Expected: 无错误

**Step 7: Commit**

```bash
git add src/commands/index.ts
git commit -m "feat: add model/effort routing and per-message model prefix"
```

---

### Task 5: 启动时加载 settings

**Files:**
- Modify: `src/app.ts:1-14`

**Step 1: 在 app.ts 中加载 settings**

在 `loadConfig()` 之后、`new App()` 之前，添加：

```typescript
import { loadSettings } from './services/settings.js';
```

在 config 加载后添加：
```typescript
await loadSettings();
```

**Step 2: 验证编译**

Run: `npx tsc --noEmit`
Expected: 无错误

**Step 3: Commit**

```bash
git add src/app.ts
git commit -m "feat: load settings on startup"
```

---

### Task 6: 更新帮助文本

**Files:**
- Modify: `src/commands/help.ts`

**Step 1: 在 HELP_TEXT 中添加 model/effort 命令**

在 gemini-draw 行之后、"任意问题"行之前添加：
```
• \`model\` (\`m\`) — 查看当前 Claude 模型和 effort
• \`model <opus|sonnet|haiku> [effort]\` — 切换默认模型
• \`effort <max|high|medium|low>\` — 切换 effort 级别
• \`@bot opus <问题>\` — 单次指定模型（可选加 effort）
```

**Step 2: Commit**

```bash
git add src/commands/help.ts
git commit -m "feat: add model/effort to help text"
```

---

### Task 7: 更新文档

**Files:**
- Modify: `CLAUDE.md` — 命令路由说明新增 model/effort
- Modify: `README.md` — 命令列表新增 model/effort

**Step 1: 更新 CLAUDE.md 命令路由说明**

在"命令路由"部分，添加 `model`/`effort`/`m` 为模型配置命令，对话文本支持模型前缀。

**Step 2: 更新 README.md**

在命令列表中添加 model/effort 命令说明。

**Step 3: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: add model/effort commands to documentation"
```
