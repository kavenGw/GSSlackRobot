# 移除 Claude 模型/effort 切换（跟随本机默认）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除整套 Claude 模型/effort 切换机制，让 `askClaude` 不再显式设置 model/effort，由 Claude Agent SDK 回退到本机默认。

**Architecture:** 单进程 Slack Bolt 应用。改动集中在 Claude 透传链路（`services/claude.ts` + `commands/index.ts`）、启动入口（`app.ts`）、帮助文案（`commands/help.ts`），并删除自包含的切换子系统（`services/settings.ts`、`commands/model.ts`、`data/settings.json`），最后同步 `CLAUDE.md`。

**Tech Stack:** TypeScript (strict, ES2022 Modules) · Node.js · @slack/bolt · @anthropic-ai/claude-agent-sdk

**验证策略说明:** 本项目无单元测试套件，验证 = `rtk npm run build`（tsc 通过）。因删除会造成跨文件引用断裂，Task 1 内所有源码编辑作为一个整体，编辑完成后一次性 build 才会绿。请按步骤顺序完成 Task 1 全部编辑再 build。

**文件结构（改动后）:**
- `src/services/claude.ts` — 仅负责 SDK 流式调用；不再含模型映射或 model/effort 入参。
- `src/commands/index.ts` — 事件路由 + Claude 透传；不再含 model/effort 路由、前缀解析、settings 依赖。
- `src/app.ts` — 启动入口；不再加载 settings。
- `src/commands/help.ts` — 帮助文案；不再含 model/effort 条目。
- 删除：`src/services/settings.ts`、`src/commands/model.ts`、`data/settings.json`。

---

### Task 1: 移除 model/effort 切换（源码）

**Files:**
- Modify: `src/services/claude.ts`
- Modify: `src/commands/index.ts`
- Modify: `src/app.ts`
- Modify: `src/commands/help.ts`
- Delete: `src/services/settings.ts`
- Delete: `src/commands/model.ts`
- Delete: `data/settings.json`

- [ ] **Step 1: `claude.ts` — 删除 settings import**

把文件顶部：

```ts
import { query, type Options, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { getConfig } from '../config/index.js';
import { getClaudeSettings } from './settings.js';
```

改为：

```ts
import { query, type Options, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { getConfig } from '../config/index.js';
```

- [ ] **Step 2: `claude.ts` — 删除 MODEL_MAP 与 resolveModel**

删除这一整块（连同其后空行）：

```ts
const MODEL_MAP: Record<string, string> = {
  opus: 'claude-opus-4-6',
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5',
};

function resolveModel(shortName: string): string {
  return MODEL_MAP[shortName] ?? shortName;
}

```

- [ ] **Step 3: `claude.ts` — `askClaude` 去掉 model/effort 参数**

把：

```ts
export async function* askClaude(
  text: string,
  images: ClaudeImage[] = [],
  sessionId?: string,
  resume = false,
  model?: string,
  effort?: string,
): AsyncGenerator<string> {
```

改为：

```ts
export async function* askClaude(
  text: string,
  images: ClaudeImage[] = [],
  sessionId?: string,
  resume = false,
): AsyncGenerator<string> {
```

- [ ] **Step 4: `claude.ts` — options 不再设置 model/effort**

把：

```ts
  const claudeSettings = getClaudeSettings();
  const options: Options = {
    model: resolveModel(model ?? claudeSettings.model),
    effort: (effort ?? claudeSettings.effort) as Options['effort'],
    env,
    includePartialMessages: true,
  };
```

改为：

```ts
  const options: Options = {
    env,
    includePartialMessages: true,
  };
```

- [ ] **Step 5: `index.ts` — 精简 import**

把：

```ts
import { handleModel, handleEffort } from './model.js';
import { askClaude, type ClaudeImage } from '../services/claude.js';
import { isValidModel, isValidEffort, getClaudeSettings } from '../services/settings.js';
import type { ClaudeModel, EffortLevel } from '../services/settings.js';
```

改为：

```ts
import { askClaude, type ClaudeImage } from '../services/claude.js';
```

- [ ] **Step 6: `index.ts` — `COMMAND_ALIASES` 移除 `m`**

把：

```ts
  m: 'model',
  draw: 'gemini-draw',
```

改为：

```ts
  draw: 'gemini-draw',
```

- [ ] **Step 7: `index.ts` — 删除 `parseModelPrefix`**

删除这一整块（连同其后空行）：

```ts
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

- [ ] **Step 8: `index.ts` — `handleClaude` 直接用原始 text**

把：

```ts
async function handleClaude({ text, channel, threadTs, client, files, userId }: CommandContext) {
  const { prompt: parsedPrompt, model, effort } = parseModelPrefix(text);
  const prompt = parsedPrompt.startsWith('/') ? ` ${parsedPrompt}` : parsedPrompt;
```

改为：

```ts
async function handleClaude({ text, channel, threadTs, client, files, userId }: CommandContext) {
  const prompt = text.startsWith('/') ? ` ${text}` : text;
```

- [ ] **Step 9: `index.ts` — `askClaude` 调用去掉 model/effort 实参**

把：

```ts
    for await (const chunk of askClaude(finalText, images, sessionId, resume, model, effort)) {
```

改为：

```ts
    for await (const chunk of askClaude(finalText, images, sessionId, resume)) {
```

- [ ] **Step 10: `index.ts` — `saveConversationLog` 去掉 model/effort 字段**

把：

```ts
    const settings = getClaudeSettings();
    await saveConversationLog({
      prompt: finalText,
      reply: content,
      durationMs,
      sessionId,
      resume,
      segments,
      model: model ?? settings.model,
      effort: effort ?? settings.effort,
      imageCount: images.length,
    });
```

改为：

```ts
    await saveConversationLog({
      prompt: finalText,
      reply: content,
      durationMs,
      sessionId,
      resume,
      segments,
      imageCount: images.length,
    });
```

- [ ] **Step 11: `index.ts` — 删除 model/effort 路由分支**

把：

```ts
      } else if (/^commands$/i.test(text)) {
        await handleCommands(ctx);
      } else if (/^model\b/i.test(text)) {
        await handleModel(ctx);
      } else if (/^effort\b/i.test(text)) {
        await handleEffort(ctx);
      } else if (/^(list-milestones|list-issues|daily-report|reset-daily-report|create-milestone)\b/i.test(text)) {
```

改为：

```ts
      } else if (/^commands$/i.test(text)) {
        await handleCommands(ctx);
      } else if (/^(list-milestones|list-issues|daily-report|reset-daily-report|create-milestone)\b/i.test(text)) {
```

- [ ] **Step 12: `app.ts` — 移除 loadSettings import 与调用**

把：

```ts
import { ensureSingleInstance } from './utils/singleton.js';
import { loadSettings } from './services/settings.js';
```

改为：

```ts
import { ensureSingleInstance } from './utils/singleton.js';
```

并把：

```ts
await loadSettings();
await loadKnownSessions();
```

改为：

```ts
await loadKnownSessions();
```

- [ ] **Step 13: `help.ts` — 删除 model/effort/前缀 帮助行**

删除 `HELP_TEXT` 模板里这 4 行：

```
• \`model\` (\`m\`) — 查看/切换 Claude 模型和 effort
• \`model <opus|sonnet|haiku> [max|high|medium|low]\` — 切换默认模型
• \`effort <max|high|medium|low>\` — 切换 effort 级别
• 对话前缀 \`opus <问题>\` — 单次指定模型（可选加 effort）
```

删除后该区段应为（上下文）：

```
• \`gemini <问题>\` (\`gem\`) — 与 Google Gemini AI 对话
• \`gemini-draw <描述>\` (\`draw\`) — 用 Gemini 生成图片
• \`/superpowers:brainstorming <任意问题>\` — 与 Claude 开始头脑风暴
• \`<任意问题>\` — 直接与 Claude AI 对话
```

- [ ] **Step 14: 删除三个文件**

```bash
rtk git rm src/services/settings.ts src/commands/model.ts data/settings.json
```

Expected: `rm 'src/services/settings.ts'` 等三行确认。

- [ ] **Step 15: 构建验证**

Run: `rtk npm run build`
Expected: tsc 无报错退出，`dist/` 更新。若报 `Cannot find module './settings.js'` 或 `'model.js'`、或 `ClaudeModel`/`EffortLevel`/`MODEL_MAP`/`resolveModel` 未定义/未使用，回到对应 Step 检查是否有残留引用。

- [ ] **Step 16: 残留引用扫描**

Run: `rtk grep -n "settings\.js|model\.js|MODEL_MAP|resolveModel|parseModelPrefix|isValidModel|isValidEffort|getClaudeSettings|ClaudeModel|EffortLevel" src`
Expected: 无输出（src 下零残留）。若有命中，按命中处清理后重跑 Step 15。

- [ ] **Step 17: 提交**

```bash
rtk git add -A src data/settings.json
rtk git commit -m "refactor(claude): remove model/effort switching, follow local default

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 文档同步（CLAUDE.md）

**Files:**
- Modify: `CLAUDE.md`

说明：`docs/setup-guide.md` 与 `.env.example` 经 grep 确认无 model/effort 命令或相关 env（仅 Gemini 模型名），无需改动；Step 4 会复核。

- [ ] **Step 1: 删除项目结构树中的 model.ts / settings.ts 行**

删除第 39 行：

```
│   └── model.ts              # 模型/effort 切换命令
```

删除第 45 行：

```
│   ├── settings.ts           # 运行时设置持久化 (model/effort → data/settings.json)
```

注意：删除 `model.ts` 行后，其上一行 `gemini-draw.ts` 在 `commands/` 树中应成为最后一项，把它的 `├──` 改为 `└──`（树形末项）。即把：

```
│   ├── gemini-draw.ts        # Gemini 画图生成
│   └── model.ts              # 模型/effort 切换命令
```

改为：

```
│   └── gemini-draw.ts        # Gemini 画图生成
```

- [ ] **Step 2: 改写「命令路由」条目**

把第 126 行：

```
- **命令路由**: `help` 显示帮助，`commands` 列出 Claude Commands，`model [模型] [effort]`/`effort [级别]` 切换 Claude 模型和 effort（持久化到 `data/settings.json`），`list-milestones`/`list-issues`/`daily-report`/`reset-daily-report`/`create-milestone <版本号> [结束日期]` 为 GitLab 命令（需配置），`gemini <问题>` 和 `gemini-draw <描述>` 为 Gemini 命令（需配置），其余输入透传 Claude CLI（支持 `opus/sonnet/haiku` 前缀单次指定模型）
```

改为：

```
- **命令路由**: `help` 显示帮助，`commands` 列出 Claude Commands，`list-milestones`/`list-issues`/`daily-report`/`reset-daily-report`/`create-milestone <版本号> [结束日期]` 为 GitLab 命令（需配置），`gemini <问题>` 和 `gemini-draw <描述>` 为 Gemini 命令（需配置），其余输入透传 Claude
```

- [ ] **Step 3: 改写「Claude 集成」与删除「运行时设置」条目**

把第 127 行：

```
- **Claude CLI 集成**: 通过子进程调用，使用 `--output-format stream-json` 参数，输出为 JSON Lines 格式。支持 `--model`（opus/sonnet/haiku）和 `--effort`（max/high/medium/low）参数
```

改为：

```
- **Claude SDK 集成**: 通过 Claude Agent SDK 的 `query()` 流式调用，`includePartialMessages` 增量输出；不显式指定 model/effort，跟随本机 Claude Code 默认配置
```

并删除第 130 行整行：

```
- **运行时设置**: `data/settings.json` 存储 Claude 模型和 effort 偏好，启动时加载，通过 Slack 命令动态修改
```

- [ ] **Step 4: 复核 setup-guide / .env.example 无遗留**

Run: `rtk grep -ni "\\bmodel\\b|\\beffort\\b|opus|sonnet|haiku|settings.json" docs/setup-guide.md .env.example`
Expected: 仅 Gemini 模型名相关命中（`GEMINI_MODEL` / `gemini-2.0-flash` 等），无 Claude model/effort 命令或 `settings.json` 命中。若出现 Claude 相关命中，按上文同样思路删除对应描述。

- [ ] **Step 5: 提交**

```bash
rtk git add CLAUDE.md
rtk git commit -m "docs(claude.md): drop model/effort switching references

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage（逐节核对）:**
- 设计§1 claude.ts（去参数 / 不设 model/effort / 删 MODEL_MAP+resolveModel）→ Task 1 Step 1-4 ✅
- 设计§2 删除切换机制（settings.ts / model.ts / settings.json / app.ts loadSettings）→ Task 1 Step 12, 14 ✅
- 设计§3 index.ts（imports / parseModelPrefix / 路由 / m 别名 / askClaude 调用 / saveConversationLog）→ Task 1 Step 5-11 ✅
- 设计§4 help.ts 4 行 → Task 1 Step 13 ✅
- 设计§5 文档同步（CLAUDE.md / setup-guide / .env.example）→ Task 2 Step 1-4 ✅
- 设计「验证」→ Task 1 Step 15-16，Task 2 Step 4 ✅

**2. Placeholder scan:** 无 TBD/TODO/“适当处理”等；所有代码步骤均给出完整 old/new 块。✅

**3. Type consistency:** `askClaude` 新签名 `(text, images?, sessionId?, resume?)` 在 claude.ts 定义（Step 3）与 index.ts 调用（Step 9）一致；`saveConversationLog` 字段为 logger 既有可选项（`model?: string` / `effort?: string`，位于 `src/utils/logger.ts:20-21`），省略合法。✅
