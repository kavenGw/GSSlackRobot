# Slack 图片透传 Claude 多模态修复设计

- 日期：2026-05-23
- 主题：修复 `@bot 带图片` 时 Claude 返回"没看到图片"的 bug
- 范围：`src/commands/index.ts`、`src/services/claude.ts`

## 背景与 Bug 根因

当前 `handleClaude` 处理 Slack 图片附件的方式：

1. 通过 bot token 下载图片到 `os.tmpdir()`
2. 用 `sharp` 归一化为 PNG（≤1568px）
3. 把临时文件**路径**作为字符串拼到 prompt 末尾：
   ```
   [用户发送了N张图片: /tmp/slack-xxx.png, ...]
   ```
4. prompt 整体作为 `string` 传给 `@anthropic-ai/claude-agent-sdk` 的 `query({ prompt, options })`

问题：
- Claude **没有**收到图片二进制内容，只看到一串文本路径
- 临时文件位于 `tmpdir()`，不在 `cfg.projectDir` 的 cwd 下，Read 工具未必能访问
- 即使能访问，Claude 还要"主动决定调用 Read 工具"才能拿到图，行为不可控
- `finally` 里 `unlink(p)` 在 SDK 流结束后立即删除文件，如果 SDK 异步处理可能竞态

结果：Claude 经常回复"我没有看到图片"。

## 目标

让 Claude 真正"看到"用户在 Slack 中发送的图片，行为可预期，无需依赖 Read 工具调用。

## 方案：多模态消息块

利用 `@anthropic-ai/claude-agent-sdk` 已支持的多模态 prompt 形式，把图片以 base64 image content block 直接发给 Claude。

### SDK 能力确认

`sdk.d.ts:1594` 的签名：

```ts
prompt: string | AsyncIterable<SDKUserMessage>;
```

`SDKUserMessage`（`sdk.d.ts:2387`）：

```ts
{
  type: 'user';
  message: MessageParam;          // 来自 @anthropic-ai/sdk
  parent_tool_use_id: string | null;
  session_id: string;
  // ...
}
```

`MessageParam.content` 支持 `string | Array<ContentBlockParam>`，其中 `ContentBlockParam` 包含 `{type:'image', source:{type:'base64', media_type, data}}`。

→ 方案可行。

## 架构改动

### `src/services/claude.ts`

新增导出类型：

```ts
export interface ClaudeImage {
  data: string;          // base64
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
}
```

`askClaude` 签名扩展为：

```ts
export async function* askClaude(
  text: string,
  images: ClaudeImage[] = [],
  sessionId?: string,
  resume = false,
  model?: string,
  effort?: string,
): AsyncGenerator<string>
```

内部根据 `images.length` 分支：

- **无图（向后兼容）**：保持原 `string` prompt，零开销零行为变化
- **有图**：构造 `AsyncIterable<SDKUserMessage>`，单条 user message，`content = [{type:'text', text}, ...imageBlocks]`

多模态 prompt 构造：

```ts
async function* buildMultimodalPrompt(
  text: string,
  images: ClaudeImage[],
  sessionId: string,
): AsyncIterable<SDKUserMessage> {
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
```

约束：多模态分支要求 `sessionId` 非空（消息体里的 `session_id` 必填）。caller 始终基于 thread 计算 uuid，已满足。

`options`（model/effort/env/cwd/permissionMode/sessionId|resume/includePartialMessages）与 prompt 形式无关，全部保留。输出协议 `AsyncGenerator<string>` 不变。

### `src/commands/index.ts`

`downloadSlackImages` 返回值由 `string[]` 改为 `ClaudeImage[]`，**不再写临时文件**：

```ts
async function downloadSlackImages(
  files: SlackFile[],
  token: string,
): Promise<ClaudeImage[]> {
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

`handleClaude` 改造：

```ts
let images: ClaudeImage[] = [];
if (files?.length) {
  images = await downloadSlackImages(files, getConfig().slack.botToken);
}
const finalText = images.length && !prompt.trim() ? '请查看图片' : prompt;
// ...
for await (const chunk of askClaude(finalText, images, sessionId, resume, model, effort)) { ... }
```

### 数据流

```
Slack files → fetch(bot token) → sharp normalize(PNG, ≤1568px)
            → Buffer.toString('base64') → ClaudeImage[]
            → askClaude(text, images, sessionId, ...)
            → AsyncIterable<SDKUserMessage> with image content blocks
            → Claude 真正"看到"图片
```

### 删除项

- `import { unlink } from 'node:fs/promises'`（如未在他处用到）
- `import { tmpdir } from 'node:os'`
- `import { join } from 'node:path'`
- `finally` 里 `for (const p of imagePaths) unlink(p).catch(...)`
- `finalPrompt` 拼接 `[用户发送了X张图片: ...]` 的整段逻辑
- 局部变量 `imagePaths`

## 内存 vs 磁盘的权衡

去掉临时文件的好处：
- 无 `tmpdir()` 路径权限问题
- 无 finally 清理（异常路径更安全）
- 无等待 SDK 异步去读文件的竞态
- base64 直接消费

代价：base64 数据在内存。Slack 图片经 sharp resize 到 1568px PNG 后通常 < 2MB，base64 约 2.7MB，单次请求可接受。

## 错误处理

| 场景 | 行为 |
|------|------|
| 单张图下载/编码失败 | 跳过该图，其他图继续（沿用现有 try/catch） |
| 全部图失败但有文本 | 退化为纯文本 prompt，按 `images.length === 0` 路径走 |
| 文本和图都为空 | 不应发生（Slack mention 至少有 bot 标签后的空字符串），保险起见走 string prompt |
| SDK 多模态调用本身失败 | 沿用 `handleClaude` 现有 try/catch，不引入新错误路径 |

## 日志

- 新增：`log.info(\`Sending ${images.length} image(s) to Claude (multimodal)\`)`（仅当 `images.length > 0`）
- `log.claudeStart(finalText.length)` 只统计文本长度，与现有一致
- `saveConversationLog` 的 `prompt` 字段保存纯文本，**不持久化 base64**（避免日志膨胀）；新增 `imageCount?: number` 字段记录图片数

## 测试方式

无单元测试套件 → 验证 = `npm run build` (tsc 通过) + Slack 端到端：

1. `@bot` 不带图片，发普通问题 → 行为与改造前一致
2. `@bot` 带 1 张图片 + 文字 "这是什么" → Claude 描述图片内容（非"没看到图片"）
3. `@bot` 带 1 张图片不带文字 → 走默认 prompt "请查看图片"，Claude 描述图片
4. `@bot` 带多张图片 → Claude 能区分并描述

## 兼容性

- `askClaude` 新签名只追加 `images` 参数（带默认值 `[]`），其他位置参数顺序不变
- 现有所有 caller（`commands/gemini.ts` 等不涉及，仅 `handleClaude` 调用 `askClaude`）零改动
- session resume 协议不变

## 不在本次范围

- 视频、PDF、音频等其他 Slack 附件类型
- Gemini 命令路径的图片支持（独立链路，已有 `gemini-draw`）
- 图片缓存复用（多轮 thread 内的同一张图重复发送）
