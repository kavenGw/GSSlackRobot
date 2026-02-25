# Gemini Command Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 新增 `gemini <问题>` 命令，通过 Google AI Studio API 调用 Gemini 模型，支持同一 Slack thread 内多轮对话。

**Architecture:** 使用 `@google/generative-ai` 官方 SDK。新增 `services/gemini.ts` 封装 SDK 调用和对话历史管理，`commands/gemini.ts` 作为命令处理器。修改配置层和路由层接入。

**Tech Stack:** TypeScript, @google/generative-ai SDK, ES Modules

---

### Task 1: 安装依赖

**Step 1: 安装 @google/generative-ai**

```bash
npm install @google/generative-ai
```

**Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @google/generative-ai dependency"
```

---

### Task 2: 配置层 — 添加 Gemini 配置类型和加载

**Files:**
- Modify: `src/config/schema.ts:47-53`
- Modify: `src/config/index.ts:60-77`

**Step 1: 在 schema.ts 添加 GeminiConfig 接口和 AppConfig 字段**

在 `JenkinsConfig` 接口后、`AppConfig` 接口前添加：

```typescript
export interface GeminiConfig {
  apiKey: string;
  model: string;
}
```

在 `AppConfig` 中添加字段：

```typescript
export interface AppConfig {
  slack: SlackConfig;
  claude: ClaudeConfig;
  gitlabNotify?: GitLabNotifyConfig;
  gitlab?: GitLabConfig;
  jenkins?: JenkinsConfig;
  gemini?: GeminiConfig;
}
```

**Step 2: 在 index.ts loadConfig() 中加载 Gemini 环境变量**

在 `jenkins` 配置块之后、分号之前添加：

```typescript
    gemini: process.env.GEMINI_API_KEY ? {
      apiKey: process.env.GEMINI_API_KEY,
      model: optional('GEMINI_MODEL', 'gemini-2.0-flash'),
    } : undefined,
```

**Step 3: Commit**

```bash
git add src/config/schema.ts src/config/index.ts
git commit -m "feat: add Gemini config schema and env loading"
```

---

### Task 3: 创建 Gemini 服务

**Files:**
- Create: `src/services/gemini.ts`

**Step 1: 创建 services/gemini.ts**

```typescript
import { GoogleGenerativeAI, type Content } from '@google/generative-ai';
import { getConfig } from '../config/index.js';
import { log } from '../utils/logger.js';

const chatHistories = new Map<string, Content[]>();

export async function askGemini(prompt: string, threadTs: string): Promise<string> {
  const cfg = getConfig().gemini!;
  const genAI = new GoogleGenerativeAI(cfg.apiKey);
  const model = genAI.getGenerativeModel({ model: cfg.model });

  const history = chatHistories.get(threadTs) ?? [];
  const chat = model.startChat({ history });

  const result = await chat.sendMessage(prompt);
  const text = result.response.text();

  chatHistories.set(threadTs, chat.params?.history ?? [
    ...history,
    { role: 'user', parts: [{ text: prompt }] },
    { role: 'model', parts: [{ text }] },
  ]);

  log.info(`Gemini [${cfg.model}] replied ${text.length} chars`);
  return text;
}
```

> 注意：`chat.sendMessage` 后 SDK 内部会自动更新历史，但 `startChat` 每次是新实例，所以需要手动维护 history。直接追加 user/model 对即可。

**Step 2: Commit**

```bash
git add src/services/gemini.ts
git commit -m "feat: add Gemini service with multi-turn chat support"
```

---

### Task 4: 创建 Gemini 命令处理器

**Files:**
- Create: `src/commands/gemini.ts`

**Step 1: 创建 commands/gemini.ts**

```typescript
import type { CommandContext } from './index.js';
import { askGemini } from '../services/gemini.js';
import { splitToBlocks } from '../utils/message.js';

export async function handleGemini({ text, channel, threadTs, client }: CommandContext) {
  const prompt = text.replace(/^gemini\s+/i, '').trim();
  if (!prompt) {
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: '请在 gemini 后输入你的问题，例如: `gemini 你好`',
    });
    return;
  }

  await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: '思考中...',
  });

  const reply = await askGemini(prompt, threadTs);
  const blocks = splitToBlocks(reply);
  for (const block of blocks) {
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: block,
    });
  }
}
```

**Step 2: Commit**

```bash
git add src/commands/gemini.ts
git commit -m "feat: add gemini command handler"
```

---

### Task 5: 接入路由和帮助信息

**Files:**
- Modify: `src/commands/index.ts:1-146`
- Modify: `src/commands/help.ts:1-15`

**Step 1: 在 commands/index.ts 中添加路由**

顶部添加导入：

```typescript
import { handleGemini } from './gemini.js';
```

在 `registerCommands` 的路由中，GitLab 命令块之后、`else`（Claude 透传）之前添加：

```typescript
      } else if (/^gemini\b/i.test(text)) {
        if (!getConfig().gemini) {
          await say({ text: 'Gemini 未配置，请设置 GEMINI_API_KEY 环境变量', thread_ts: threadTs });
        } else {
          await handleGemini(ctx);
        }
```

**Step 2: 在 help.ts 添加 gemini 说明**

在 `create-milestone` 行后添加：

```
• \`gemini <问题>\` — 与 Google Gemini AI 对话
```

**Step 3: Commit**

```bash
git add src/commands/index.ts src/commands/help.ts
git commit -m "feat: wire gemini command into router and help"
```

---

### Task 6: 更新文档

**Files:**
- Modify: `CLAUDE.md`
- Modify: `.env.example`（如果存在）

**Step 1: 在 CLAUDE.md 环境变量表中添加 Gemini 相关变量**

可选参数表中添加：

| `GEMINI_API_KEY` | 无 | Google AI Studio API Key（设置后启用 gemini 命令） |
| `GEMINI_MODEL` | `gemini-2.0-flash` | Gemini 模型名 |

命令路由说明中添加 `gemini <问题>` 为 Gemini 命令。

**Step 2: 更新 .env.example（如存在）**

添加：
```
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.0-flash
```

**Step 3: Commit**

```bash
git add CLAUDE.md .env.example
git commit -m "docs: add Gemini config to CLAUDE.md and .env.example"
```

---

### Task 7: 验证构建

**Step 1: 运行构建**

```bash
npm run build
```

Expected: 编译成功，无错误。

**Step 2: 检查 dist 输出中包含 gemini 相关文件**

```bash
ls dist/services/gemini.js dist/commands/gemini.js
```
