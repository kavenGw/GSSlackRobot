# Slack 图片多模态修复实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `@bot` 带图片的消息真正通过 Claude Agent SDK 的多模态 content block 把图传给 Claude，修复"返回说没看到图片"的 bug。

**Architecture:** `askClaude` 增加 `images: ClaudeImage[]` 参数；当有图时构造 `AsyncIterable<SDKUserMessage>`，content 包含 text + base64 image blocks；无图时保持原 `string` prompt 路径不变。下载侧不再落临时文件，直接返回 base64。

**Tech Stack:** TypeScript (ES2022 Modules)、`@anthropic-ai/claude-agent-sdk`、`@slack/bolt`、`sharp`。

**Project note:** 本仓库无单元测试套件（见 `CLAUDE.md` "测试策略"）。每个任务的验证步骤 = `npm run build`（tsc 通过）。最后一个任务是 Slack 端到端手动验证。

---

### Task 1: 在 `claude.ts` 中加入 `ClaudeImage` 类型并支持多模态 prompt

**Files:**
- Modify: `src/services/claude.ts` (整个文件)

**Spec sections:** "架构改动 → src/services/claude.ts"

- [ ] **Step 1: 替换 `src/services/claude.ts` 全文**

```ts
import { query, type Options } from '@anthropic-ai/claude-agent-sdk';
import { getConfig } from '../config/index.js';
import { getClaudeSettings } from './settings.js';

const MODEL_MAP: Record<string, string> = {
  opus: 'claude-opus-4-6',
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5',
};

function resolveModel(shortName: string): string {
  return MODEL_MAP[shortName] ?? shortName;
}

export type ClaudeImageMediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

export interface ClaudeImage {
  data: string;
  mediaType: ClaudeImageMediaType;
}

async function* buildMultimodalPrompt(
  text: string,
  images: ClaudeImage[],
  sessionId: string,
): AsyncIterable<{
  type: 'user';
  parent_tool_use_id: null;
  session_id: string;
  message: {
    role: 'user';
    content: Array<
      | { type: 'text'; text: string }
      | { type: 'image'; source: { type: 'base64'; media_type: ClaudeImageMediaType; data: string } }
    >;
  };
}> {
  yield {
    type: 'user',
    parent_tool_use_id: null,
    session_id: sessionId,
    message: {
      role: 'user',
      content: [
        { type: 'text', text },
        ...images.map(img => ({
          type: 'image' as const,
          source: { type: 'base64' as const, media_type: img.mediaType, data: img.data },
        })),
      ],
    },
  };
}

export async function* askClaude(
  text: string,
  images: ClaudeImage[] = [],
  sessionId?: string,
  resume = false,
  model?: string,
  effort?: string,
): AsyncGenerator<string> {
  const cfg = getConfig().claude;
  const env: Record<string, string | undefined> = { ...process.env };
  if (cfg.anthropicBaseUrl) {
    env.ANTHROPIC_BASE_URL = cfg.anthropicBaseUrl;
  }
  if (cfg.anthropicAuthToken) {
    env.ANTHROPIC_AUTH_TOKEN = cfg.anthropicAuthToken;
  }
  if (cfg.httpProxy) {
    env.http_proxy = cfg.httpProxy;
  }
  if (cfg.httpsProxy) {
    env.https_proxy = cfg.httpsProxy;
  }

  const claudeSettings = getClaudeSettings();
  const options: Options = {
    model: resolveModel(model ?? claudeSettings.model),
    effort: (effort ?? claudeSettings.effort) as Options['effort'],
    env,
    includePartialMessages: true,
  };

  if (cfg.projectDir) {
    options.cwd = cfg.projectDir;
  }
  if (sessionId) {
    if (resume) {
      options.resume = sessionId;
    } else {
      options.sessionId = sessionId;
    }
  }
  if (cfg.dangerouslySkipPermissions) {
    options.permissionMode = 'bypassPermissions';
    options.allowDangerouslySkipPermissions = true;
  }

  const prompt =
    images.length && sessionId
      ? (buildMultimodalPrompt(text, images, sessionId) as Parameters<typeof query>[0]['prompt'])
      : text;

  const conversation = query({ prompt, options });
  let hasContent = false;

  try {
    for await (const message of conversation) {
      if (message.type === 'stream_event' && message.event.type === 'content_block_delta') {
        const delta = message.event.delta;
        if (delta.type === 'text_delta') {
          hasContent = true;
          yield delta.text;
        }
      } else if (message.type === 'result') {
        if (message.subtype === 'success') {
          if (!hasContent) {
            yield message.result;
          }
        } else {
          throw new Error(message.errors[0] ?? `Claude SDK error: ${message.subtype}`);
        }
      }
    }
  } finally {
    conversation.close();
  }
}
```

- [ ] **Step 2: 验证 tsc 编译通过**

Run: `npm run build`
Expected: 0 errors, 输出 `dist/services/claude.js`

- [ ] **Step 3: Commit**

```bash
git add src/services/claude.ts
git commit -m "feat(claude): support multimodal prompt with image content blocks"
```

---

### Task 2: `commands/index.ts` 改写 `downloadSlackImages` 返回 base64

**Files:**
- Modify: `src/commands/index.ts:103-125` (`downloadSlackImages` 函数)
- Modify: `src/commands/index.ts:1-22` (imports)

**Spec sections:** "调用侧 handleClaude 改造 → downloadSlackImages 重写"、"删除项"

- [ ] **Step 1: 修改 import 段，移除 `unlink`、`tmpdir`、`join`，新增 `ClaudeImage` 导入**

修改 `src/commands/index.ts` 顶部：

```ts
import type { App, SayFn } from '@slack/bolt';
import type { WebClient } from '@slack/web-api';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { v5 as uuidv5 } from 'uuid';
import { handleHelp } from './help.js';
import { handleCommands } from './commands.js';
import { handleListMilestones } from './list-milestones.js';
import { handleListMilestoneIssues } from './list-milestone-issues.js';
import { handleCreateMilestone } from './create-milestone.js';
import { handleDailyReport, handleResetDailyReport } from './daily-report.js';
import { handleGemini } from './gemini.js';
import { handleGeminiDraw } from './gemini-draw.js';
import { handleModel, handleEffort } from './model.js';
import { askClaude, type ClaudeImage } from '../services/claude.js';
import { isValidModel, isValidEffort, getClaudeSettings } from '../services/settings.js';
import type { ClaudeModel, EffortLevel } from '../services/settings.js';
import { markdownToSlack, safePost, safeUpdate, createTracker } from '../utils/message.js';
import { log, saveConversationLog } from '../utils/logger.js';
import { getConfig } from '../config/index.js';
```

- [ ] **Step 2: 替换 `downloadSlackImages` 函数（原 line 103-125）**

```ts
async function downloadSlackImages(files: SlackFile[], token: string): Promise<ClaudeImage[]> {
  const results: ClaudeImage[] = [];
  for (const file of files) {
    if (!file.url_private_download || !file.mimetype?.startsWith('image/')) continue;
    try {
      const resp = await fetch(file.url_private_download, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) continue;
      const raw = Buffer.from(await resp.arrayBuffer());
      const buf = await sharp(raw)
        .resize(1568, 1568, { fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();
      results.push({ data: buf.toString('base64'), mediaType: 'image/png' });
    } catch {
      // 单张失败跳过
    }
  }
  return results;
}
```

- [ ] **Step 3: 验证 tsc 编译通过（此时 handleClaude 还用旧字符串拼接，但 imagePaths 类型与拼接不匹配会报错——这是预期的，下一任务修复）**

Run: `npm run build`
Expected: 报错 `imagePaths.join is not on ClaudeImage[]` 类似的类型错误。**不要 commit**，直接进入 Task 3。

---

### Task 3: 改造 `handleClaude` 使用多模态 API 并删除临时文件清理

**Files:**
- Modify: `src/commands/index.ts:127-226` (`handleClaude` 函数)

**Spec sections:** "调用侧 handleClaude 改造 → handleClaude 内的拼装"、"删除项"、"日志"

- [ ] **Step 1: 替换整个 `handleClaude` 函数**

```ts
async function handleClaude({ text, channel, threadTs, client, files, userId }: CommandContext) {
  const { prompt: parsedPrompt, model, effort } = parseModelPrefix(text);
  const prompt = parsedPrompt.startsWith('/') ? ` ${parsedPrompt}` : parsedPrompt;

  let images: ClaudeImage[] = [];
  if (files?.length) {
    images = await downloadSlackImages(files, getConfig().slack.botToken);
  }
  const finalText = images.length && !prompt.trim() ? '请查看图片' : prompt;

  const startTime = Date.now();
  log.claudeStart(finalText.length);
  if (images.length) {
    log.info(`Sending ${images.length} image(s) to Claude (multimodal)`);
  }
  const sessionId = threadToSessionId(threadTs);

  if (activeSessions.has(sessionId)) {
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: '上一条消息还在处理中，请稍后再试。',
    });
    return;
  }

  activeSessions.add(sessionId);
  const initial = await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: '思考中...',
  });
  const msgTs = initial.ts!;

  let content = '';
  let lastUpdate = 0;
  const maxBlockText = getConfig().slack.maxBlockText;
  const tracker = createTracker(msgTs, '思考中...');

  const flush = async (final = false) => {
    const now = Date.now();
    if (!final && now - lastUpdate < THROTTLE_MS) return;
    lastUpdate = now;
    const text = final ? markdownToSlack(content) : content;
    await safeUpdate(client, channel, text || '思考中...', threadTs, tracker, maxBlockText);
  };

  try {
    const resume = knownSessions.has(sessionId);
    for await (const chunk of askClaude(finalText, images, sessionId, resume, model, effort)) {
      content += chunk;
      await flush();
    }
    await flush(true);
    if (!content) {
      await client.chat.update({ channel, ts: msgTs, text: 'Claude 未返回内容，请重试。' });
    }
    const durationMs = Date.now() - startTime;
    log.claudeDone(durationMs, content.length);
    const segments = tracker.segments.length;
    log.reply(segments);
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
    if (userId) {
      try {
        await client.chat.postMessage({
          channel,
          thread_ts: threadTs,
          text: `<@${userId}> ✅`,
        });
      } catch (notifyErr) {
        log.warn(`mention sender (success) failed: ${notifyErr instanceof Error ? notifyErr.message : String(notifyErr)}`);
      }
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (!content) {
      await client.chat.update({ channel, ts: msgTs, text: `出错: ${errMsg}` });
    } else {
      await safePost(client, channel, `_（出错: ${errMsg}）_`, threadTs, getConfig().slack.maxBlockText);
    }
    if (userId) {
      try {
        await client.chat.postMessage({
          channel,
          thread_ts: threadTs,
          text: `<@${userId}> ❌`,
        });
      } catch (notifyErr) {
        log.warn(`mention sender (error) failed: ${notifyErr instanceof Error ? notifyErr.message : String(notifyErr)}`);
      }
    }
  } finally {
    if (!knownSessions.has(sessionId)) {
      knownSessions.add(sessionId);
      saveKnownSessions().catch(err => log.error(`saveKnownSessions failed: ${err}`));
    }
    activeSessions.delete(sessionId);
  }
}
```

变更要点：
- `imagePaths: string[]` → `images: ClaudeImage[]`
- 删除 `finalPrompt` 拼接 `[用户发送了X张图片: ...]` 的整段逻辑
- `askClaude(finalPrompt, sessionId, resume, model, effort)` → `askClaude(finalText, images, sessionId, resume, model, effort)`
- `saveConversationLog` 入参新增 `imageCount: images.length`（Task 4 会同步扩展类型）
- 新增 `log.info` 输出图片数（仅当有图）
- finally 块去掉 `for (const p of imagePaths) unlink(p).catch(() => {})`

- [ ] **Step 2: 验证 tsc 编译（此时 saveConversationLog 的 imageCount 字段尚未在 logger 类型里，会报错——预期的，下一任务修复）**

Run: `npm run build`
Expected: 报错 `Object literal may only specify known properties, and 'imageCount' does not exist in type 'ConversationLogParams'`。不要 commit，进入 Task 4。

---

### Task 4: `logger.ts` 给 `ConversationLogParams` 加 `imageCount` 字段并落到日志

**Files:**
- Modify: `src/utils/logger.ts:13-22` (`ConversationLogParams` 接口)
- Modify: `src/utils/logger.ts:41-55` (日志正文模板)

**Spec sections:** "日志"

- [ ] **Step 1: 在 `ConversationLogParams` 接口末尾新增 `imageCount`**

修改 `src/utils/logger.ts:13-22`：

```ts
interface ConversationLogParams {
  prompt: string;
  reply: string;
  durationMs: number;
  sessionId: string;
  resume: boolean;
  segments: number;
  model?: string;
  effort?: string;
  imageCount?: number;
}
```

- [ ] **Step 2: 在日志正文 header 里加一行（紧跟"回复段数"之后，model 之前）**

修改 `src/utils/logger.ts` 第 41-55 行的 `content` 模板，把：

```ts
- 回复段数: ${params.segments}
${params.model ? `- 模型: ${params.model}\n` : ''}${params.effort ? `- effort: ${params.effort}\n` : ''}
```

改为：

```ts
- 回复段数: ${params.segments}
${params.imageCount ? `- 图片数: ${params.imageCount}\n` : ''}${params.model ? `- 模型: ${params.model}\n` : ''}${params.effort ? `- effort: ${params.effort}\n` : ''}
```

- [ ] **Step 3: 验证 tsc 编译通过**

Run: `npm run build`
Expected: 0 errors

- [ ] **Step 4: Commit Task 2-4 的合并变更**

```bash
git add src/commands/index.ts src/utils/logger.ts src/services/claude.ts
git commit -m "fix(commands): send Slack images as multimodal blocks to Claude"
```

（Task 1 的 `claude.ts` 如果已单独 commit，这里只会包含 commands 和 logger 两个文件——如果 Task 1 与本任务合并提交也没问题。）

---

### Task 5: 更新 `CLAUDE.md` 关于图片处理的描述

**Files:**
- Modify: `CLAUDE.md` (关键设计注意事项段落)

**Spec sections:** "数据流"

- [ ] **Step 1: 用 Grep 定位 CLAUDE.md 中 "Slack 图片附件" 和 "Slack 图片预处理" 两条**

Run: `grep -n "Slack 图片" CLAUDE.md`
Expected: 命中两行。

- [ ] **Step 2: 替换这两条**

把：

```
- **Slack 图片附件**: `app_mention` 事件的 `files` 字段未在 Bolt 类型中定义，需用 `(event as any).files` 访问；图片通过 bot token + `url_private_download` 下载
- **Slack 图片预处理**: 下载图片后使用 `sharp` 归一化（限制最大 1568px、转为 PNG），确保 CLI 读取后传递给 API 的图片格式兼容
```

改为：

```
- **Slack 图片附件**: `app_mention` 事件的 `files` 字段未在 Bolt 类型中定义，需用 `(event as any).files` 访问；图片通过 bot token + `url_private_download` 下载到内存，**不落临时文件**
- **Slack 图片预处理与多模态透传**: 下载图片后用 `sharp` 归一化（最大 1568px、转 PNG），转 base64 后通过 `askClaude(text, images, ...)` 以 Claude Agent SDK 的多模态 `content block`（`{type:'image', source:{type:'base64', ...}}`）发给 Claude，让模型真正"看到"图片，不依赖 Read 工具
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude.md): describe multimodal image transport"
```

---

### Task 6: Slack 端到端手动验证

**Files:** 无代码变更，仅运行时验证

**Spec sections:** "测试方式"

- [ ] **Step 1: 启动 dev 服务器**

Run: `npm run dev`
Expected: 控制台输出 `startup` 日志，无 `EnvValidationError`，Bolt socket 连接成功。

- [ ] **Step 2: 场景 1 —— 无图回归**

操作：在 Slack `@bot 你好`
Expected: Bot 正常回复，控制台**无** `Sending N image(s)` 日志。

- [ ] **Step 3: 场景 2 —— 带 1 张图 + 文字 "这是什么"**

操作：在 Slack `@bot 这是什么` 并附 1 张图（任意，如截图）
Expected:
- 控制台输出 `Sending 1 image(s) to Claude (multimodal)`
- Bot 回复**描述图片内容**（不是"我没看到图片"之类）
- `logs/` 目录新文件含 `- 图片数: 1`

- [ ] **Step 4: 场景 3 —— 仅图无文字**

操作：在 Slack `@bot` 仅附 1 张图
Expected: Bot 走默认 `请查看图片` prompt 并描述图片。

- [ ] **Step 5: 场景 4 —— 多图**

操作：在 Slack `@bot 这两张图有什么不同` 附 2 张图
Expected: Bot 同时识别两张图并对比；控制台输出 `Sending 2 image(s)`。

- [ ] **Step 6: 验收后不需要 commit**（无代码变更）。若任何场景失败，回退到对应 Task 重新排查。

---

## Self-Review

**Spec coverage：**
- 架构改动 → src/services/claude.ts ✓ Task 1
- 架构改动 → src/commands/index.ts (downloadSlackImages 重写) ✓ Task 2
- 架构改动 → src/commands/index.ts (handleClaude 改造、删除项) ✓ Task 3
- 数据流 ✓ Task 1+2+3 综合实现，Task 5 写进文档
- 错误处理 ✓ 沿用现有 try/catch，未引入新分支；spec 中"全部图失败但有文本"通过 `images.length` 自然降级
- 日志（log.info / imageCount） ✓ Task 3+4
- 测试方式 ✓ Task 6
- 兼容性（askClaude 默认参数 `[]`） ✓ Task 1 签名带 `= []`
- 不在本次范围 — 无需任务

**Placeholder scan：** 无 TBD/TODO/"实现细节"占位；每一步都给了具体代码或具体命令。

**Type consistency：**
- `ClaudeImage` 接口字段 `data: string; mediaType: ClaudeImageMediaType` 在 Task 1 定义，Task 2 use 一致
- `askClaude(text, images, sessionId, resume, model, effort)` 参数顺序在 Task 1 定义、Task 3 调用一致
- `ConversationLogParams.imageCount` 在 Task 4 加，Task 3 使用一致

无问题。
