# Claude 需用户回复时 @ 发送者 — 设计文档

- 日期：2026-05-23
- 适用范围：`handleClaude` 透传链路（不含 Gemini、help、GitLab、Jenkins 等其他命令）

## 1. 背景与目标

当前 `src/commands/index.ts` 的 `handleClaude` 通过 `chat.update` 流式更新一条消息。Claude 回复结束后，没有任何主动提示通知发送者；当 Claude 的回复实际上需要用户继续提供信息时，用户可能错过该 Slack 线程。

目标：在 Claude 自行判断「需要用户继续回复」时，于同一 thread 中 `@` 发送者，触发 Slack 推送通知，提示用户回到线程继续对话。

非目标：
- 不为所有完成场景 @ 发送者（避免噪音）
- 不改造 Gemini / 其他命令
- 不引入新的环境变量开关

## 2. 触发判定

采用「让 Claude 自己标记」方案：

- 通过 `appendSystemPrompt` 向 Claude Agent SDK 注入一段中文规则，要求 Claude 在「需要用户继续回复」时在整段回复末尾另起一行输出特定标记 `[NEED_REPLY]`。
- Bot 在流式收集完整回复后，检测末尾是否出现该标记。
- 命中即触发 @ 流程；未命中则维持现状。

不采用末尾标点（`?` / `？`）或关键词匹配，因为：
- 标点法漏掉「请告诉我…」类隐含提问
- 关键词法误报率高

## 3. 系统提示词

```
当你的回复需要用户继续提供信息（提问、请求确认、等待用户决定）时，
请在整段回复的最末尾另起一行，单独输出标记：[NEED_REPLY]
若不需要用户回复（任务已完成、纯陈述性回答），则不要输出该标记。
该标记会被系统识别并隐藏，不要在回复正文中提及它。
```

通过 `appendSystemPrompt` 追加，保留 SDK 默认 system prompt 不变。

## 4. @ 发送方式

- 在同一 thread 中 **新发一条独立消息**：`<@${userId}> 需要您回复 👋`
- 不采用「在最后一段 `chat.update` 中拼接 @」的方式，因为 Slack 通常不会为 `chat.update` 触发手机推送，独立 `postMessage` 才能可靠通知用户。
- 通过既有 `safeChat` 包装，复用错误兜底；无需经过 `splitToBlocks`（消息很短）。

## 5. 标记剥离

- 调用 `stripNeedReplyMarker(content): { text, needsReply }`：
  - 用 `/\s*\[NEED_REPLY\]\s*/g` 全局移除所有标记位置（容忍 Claude 把标记放在中间或多次出现）
  - 末尾再 `trimEnd()`
  - `needsReply` 为是否至少匹配一次
- 剥离后的文本用于最终 `flush(true)`，保证用户在 Slack 中看不到原始标记。

## 6. 代码改动点

| 文件 | 改动 |
|---|---|
| `src/services/claude.ts` | `askClaude` 在 `options` 上注入 `appendSystemPrompt`（规则文本作为模块顶层常量） |
| `src/utils/message.ts` | 新增工具：`NEED_REPLY_MARKER` 常量 + `stripNeedReplyMarker(text)` 函数 |
| `src/commands/index.ts` | `CommandContext` 新增 `userId?: string`；`registerCommands` 注入 `event.user`；`handleClaude` 在流式结束后调用 `stripNeedReplyMarker`，若命中则用净化文本做最终 `flush(true)`，并 `postMessage` 发送 `<@userId> 需要您回复 👋` |

不做：
- 不在流式 chunk 内实时检测/剥离（最终 flush 一次性处理即可）
- 不暴露环境变量开关
- 不改动 `handleGemini`、`safeUpdate`、`postBlocks`、`splitToBlocks`

## 7. 边界处理

- `event.user` 为空：跳过 @，仅做剥离
- Claude 未输出标记（但实际是问句）：不 @；这是「Claude 自标记」方案的固有取舍，可接受
- 标记位置异常（在中间 / 多次出现）：全局正则移除，至少出现一次即 @
- `catch` 异常分支：不发 @，避免出错时仍骚扰用户
- 空 content + 标记：仍 @（罕见，且 `safeUpdate` 已能处理空文本）
- 多段消息：标记只会在最后一段末尾，剥离后该段可能变空 → `safeUpdate` 中 `safeText = text || ' '` 已处理

## 8. CLAUDE.md 同步项

需在「关键设计注意事项」追加一条，说明 Claude 透传链路注入了 `[NEED_REPLY]` 标记规则，并在命中时 @ 发送者；标记不会展示给用户。

## 9. 验证

- `npm run build` 通过
- Slack 端到端手动测试：
  - 普通陈述性提问 → Claude 不输出标记 → 无 @
  - 显式要求 Claude 反问（如「先问我三个澄清问题再回答」）→ Claude 输出标记 → 收到独立 `<@USER> 需要您回复 👋` 消息且原文中无标记残留
  - 错误路径（构造一次 SDK 错误）→ 不发 @
