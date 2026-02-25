# Gemini Draw 画图命令 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 新增 `gemini-draw` 命令，通过 Gemini 3 Pro Image 模型生成图片并发送到 Slack。

**Architecture:** 独立 command handler + service 函数，复用现有 GeminiConfig 并扩展 imageModel 字段。图片通过 Slack files.uploadV2 上传。

**Tech Stack:** TypeScript, @google/generative-ai SDK, @slack/bolt

---

### Task 1: 扩展 GeminiConfig 配置

**Files:**
- Modify: `src/config/schema.ts:47-50`
- Modify: `src/config/index.ts:77-80`

**Step 1: 在 GeminiConfig 添加 imageModel 字段**

在 `src/config/schema.ts` 的 `GeminiConfig` 接口中添加：

```typescript
export interface GeminiConfig {
  apiKey: string;
  model: string;
  imageModel: string;
}
```

**Step 2: 在 loadConfig 中加载 GEMINI_IMAGE_MODEL**

在 `src/config/index.ts` 第 77-80 行，gemini 配置块中添加 imageModel：

```typescript
gemini: process.env.GEMINI_API_KEY ? {
  apiKey: process.env.GEMINI_API_KEY,
  model: optional('GEMINI_MODEL', 'gemini-2.0-flash'),
  imageModel: optional('GEMINI_IMAGE_MODEL', 'gemini-3-pro-image-preview'),
} : undefined,
```

**Step 3: Commit**

```bash
git add src/config/schema.ts src/config/index.ts
git commit -m "feat: add GEMINI_IMAGE_MODEL config for gemini-draw"
```

---

### Task 2: 实现 drawGemini service 函数

**Files:**
- Modify: `src/services/gemini.ts`

**Step 1: 添加 DrawResult 接口和 drawGemini 函数**

在 `src/services/gemini.ts` 文件末尾添加：

```typescript
export interface DrawResult {
  text?: string;
  imageBuffer?: Buffer;
}

export async function drawGemini(prompt: string): Promise<DrawResult> {
  const cfg = getConfig().gemini!;
  const genAI = new GoogleGenerativeAI(cfg.apiKey);
  const model = genAI.getGenerativeModel({
    model: cfg.imageModel,
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } as any,
  });

  const result = await model.generateContent(prompt);
  const parts = result.response.candidates?.[0]?.content?.parts ?? [];

  const draw: DrawResult = {};
  for (const part of parts) {
    if (part.text) {
      draw.text = (draw.text ?? '') + part.text;
    }
    if ((part as any).inlineData) {
      const { data } = (part as any).inlineData;
      draw.imageBuffer = Buffer.from(data, 'base64');
    }
  }

  log.info(`Gemini Draw [${cfg.imageModel}] completed: text=${draw.text?.length ?? 0} chars, image=${draw.imageBuffer ? 'yes' : 'no'}`);
  return draw;
}
```

> 注意：`responseModalities` 和 `inlineData` 可能未在当前 SDK 类型中定义，用 `as any` 绕过。

**Step 2: Commit**

```bash
git add src/services/gemini.ts
git commit -m "feat: add drawGemini service function"
```

---

### Task 3: 实现 gemini-draw command handler

**Files:**
- Create: `src/commands/gemini-draw.ts`

**Step 1: 创建 gemini-draw.ts**

```typescript
import type { CommandContext } from './index.js';
import { drawGemini } from '../services/gemini.js';

export async function handleGeminiDraw({ text, channel, threadTs, client }: CommandContext) {
  const prompt = text.replace(/^gemini-draw\s+/i, '').trim();
  if (!prompt) {
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: '请在 gemini-draw 后输入描述，例如: `gemini-draw 一只猫`',
    });
    return;
  }

  const initial = await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: '🎨 绘图中...',
  });

  try {
    const result = await drawGemini(prompt);

    if (result.imageBuffer) {
      await client.filesUploadV2({
        channel_id: channel,
        thread_ts: threadTs,
        file: result.imageBuffer,
        filename: 'gemini-draw.png',
        title: prompt,
      });
    }

    const updateText = result.text ?? (result.imageBuffer ? '图片已生成' : '未能生成图片');
    await client.chat.update({
      channel,
      ts: initial.ts!,
      text: updateText,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await client.chat.update({
      channel,
      ts: initial.ts!,
      text: `Gemini Draw 出错: ${errMsg}`,
    });
  }
}
```

**Step 2: Commit**

```bash
git add src/commands/gemini-draw.ts
git commit -m "feat: add gemini-draw command handler"
```

---

### Task 4: 注册路由和别名

**Files:**
- Modify: `src/commands/index.ts`
- Modify: `src/commands/help.ts`

**Step 1: 在 index.ts 添加 import**

在文件顶部 import 区域添加：

```typescript
import { handleGeminiDraw } from './gemini-draw.js';
```

**Step 2: 在 COMMAND_ALIASES 添加别名**

```typescript
const COMMAND_ALIASES: Record<string, string> = {
  h: 'help',
  command: 'commands',
  milestones: 'list-milestones',
  issues: 'list-issues',
  report: 'daily-report',
  create: 'create-milestone',
  gem: 'gemini',
  draw: 'gemini-draw',
};
```

**Step 3: 在 registerCommands 的路由中添加 gemini-draw 分支**

在 `} else if (/^gemini\b/i.test(text)) {` 之前添加：

```typescript
      } else if (/^gemini-draw\b/i.test(text)) {
        if (!getConfig().gemini) {
          await say({ text: 'Gemini 未配置，请设置 GEMINI_API_KEY 环境变量', thread_ts: threadTs });
        } else {
          await handleGeminiDraw(ctx);
        }
```

> **重要**：`gemini-draw` 路由必须在 `gemini` 之前，否则会被 `gemini` 匹配。

**Step 4: 更新 help.ts 帮助文本**

在 gemini 行后添加：

```
• \`gemini-draw <描述>\` (\`draw\`) — 用 Gemini 生成图片
```

**Step 5: Commit**

```bash
git add src/commands/index.ts src/commands/help.ts
git commit -m "feat: register gemini-draw route and alias"
```

---

### Task 5: 更新文档

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`（如存在）
- Modify: `.env.example`（如存在）

**Step 1: 在 CLAUDE.md 命令路由说明中添加 gemini-draw**

在命令路由描述中添加 `gemini-draw <描述>` 命令说明。

在环境变量表格中添加 `GEMINI_IMAGE_MODEL`。

**Step 2: 更新 .env.example 和 README.md（如存在）**

添加 `GEMINI_IMAGE_MODEL` 环境变量。

**Step 3: Commit**

```bash
git add CLAUDE.md README.md .env.example
git commit -m "docs: add gemini-draw command documentation"
```

---

### Task 6: 编译验证

**Step 1: 运行 TypeScript 编译**

Run: `npm run build`
Expected: 编译成功，无错误。

**Step 2: 如有编译错误则修复**

根据错误信息调整代码（主要可能是 SDK 类型问题，用 as any 绕过）。
