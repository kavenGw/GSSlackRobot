# 安全消息发送封装设计

## 问题

Claude 对话回复过长时，Slack API 返回 `msg_too_long` 错误。根本原因：

1. `handleClaude` 的 error handler 用未分段的完整 `content + errMsg` 调用 `chat.update`
2. `handleListMilestoneIssues`、`handleListMilestones` 等 handler 未做分段保护
3. 各 handler 手动调用 `splitToBlocks` + 循环发送，逻辑分散重复

## 方案

在 `message.ts` 新增 `safePost` 和 `safeUpdate` 封装函数，所有 handler 统一调用。

## API 设计

### safePost

```typescript
export async function safePost(
  client: WebClient,
  channel: string,
  text: string,       // 要发送的完整文本
  threadTs?: string   // 线程时间戳，发到哪个 thread
): Promise<void>
```

- `splitToBlocks(text)` 分段，逐段 `client.chat.postMessage`
- 文本短于阈值时退化为单次调用
- **空文本处理**：text 为空时不发送任何消息（静默跳过）

### safeUpdate

```typescript
export async function safeUpdate(
  client: WebClient,
  channel: string,
  ts: string,            // 要更新的消息时间戳
  text: string,          // 要更新的完整文本
  threadTs?: string,     // 线程时间戳，溢出段 postMessage 到此 thread
  lastSegment = 0        // 上次已追发到的段索引（0 = 仅首条消息）
): Promise<number>       // 返回新的 lastSegment 值
```

- `splitToBlocks(text)` 分段
- `chat.update` 更新首条消息为 chunks[0]
- 从 `lastSegment + 1` 开始，逐个 `postMessage` 新增段
- 返回 `max(lastSegment, chunks.length - 1)`
- **空文本处理**：text 为空时 update 为空字符串，不追发新段
- **单段场景**：只调用 `chat.update`，返回 `lastSegment` 本身

## 调用方改造

| 文件 | 当前方式 | 改为 |
|---|---|---|
| `commands/index.ts` handleClaude flush | 手动 splitToBlocks + segmentIndex | `safeUpdate()` + lastSegment 追踪 |
| `commands/index.ts` handleClaude catch | `content + errMsg` 未分段 | `safePost()` 只发错误信息 |
| `commands/daily-report.ts` | 手动 splitToBlocks 循环 | `safePost()` |
| `commands/gemini.ts` | 手动 splitToBlocks + update/post | `safeUpdate()` |
| `commands/list-milestones.ts` | 无分段 `say()` | `safePost()` |
| `commands/list-milestone-issues.ts` | 无分段 `say()` | `safePost()` |
| `scheduler/daily-report.ts` | 手动 splitToBlocks 循环 | `safePost()` |

### 已评估排除的路径

| 文件 | 原因 |
|---|---|
| `commands/help.ts` | 固定短文本，不可能超限 |
| `commands/model.ts` | 固定短文本 |
| `commands/create-milestone.ts` | 固定短文本 |
| `commands/gemini-draw.ts` | `result.text` 通常为短描述（"图片已生成"等），风险极低 |
| `commands/index.ts` 外层 catch | 错误消息固定短文本 |
| `webhooks/gitlab.ts` | commit 截取 5 条、note 截取 200 字符，已有内容控制 |

## handleClaude 流式场景

```typescript
let lastSegment = 0;

const flush = async (final = false) => {
  const now = Date.now();
  if (!final && now - lastUpdate < THROTTLE_MS) return;
  lastUpdate = now;
  const text = final ? markdownToSlack(content) : content;
  lastSegment = await safeUpdate(client, channel, msgTs, text || '思考中...', threadTs, lastSegment);
};
```

error handler：
```typescript
catch (err) {
  const errMsg = err instanceof Error ? err.message : String(err);
  if (!content) {
    // Claude 未返回内容就报错，更新首条 "思考中..." 消息
    await client.chat.update({ channel, ts: msgTs, text: `出错: ${errMsg}` });
  } else {
    // 部分内容已通过流式展示，追发错误提示
    await safePost(client, channel, `_（出错: ${errMsg}）_`, threadTs);
  }
}
```

## 已知限制

- **流式段内容不一致**：流式过程中 `splitToBlocks` 的分割边界随 content 增长而移动，已 post 的中间段不会被更新。这是继承自现有代码的已知折中——流式中间态不完美，但 final flush 时首段会被 update 为正确内容。完善此行为需要消息 ID 追踪 + 批量 update，复杂度高，当前不值得。
- **Slack API 速率限制**：多段快速连续 `postMessage` 可能触发 Slack 限流（约 1 条/秒/频道）。当前保持与现有代码一致的行为，后续如需优化可在 `safePost` 中加入延迟。
