# Claude 完成后 @ 发送者 — 设计文档

- 日期：2026-05-23
- 适用范围：`handleClaude` 透传链路（不含 Gemini、help、GitLab、Jenkins 等其他命令）

## 1. 背景与目标

当前 `src/commands/index.ts` 的 `handleClaude` 通过 `chat.update` 流式更新一条消息。Claude 回复结束后，没有任何主动提示通知发送者；用户可能错过 Slack 线程的完成状态。

目标：在 Claude 透传执行**结束**时（无论成功或失败），于同一 thread 独立 `postMessage` 一条短消息 `@` 发送者，触发 Slack 推送通知。

非目标：
- 不区分「需要继续回复」与「任务已完成」（每次都 @）
- 不改造 Gemini / 其他命令
- 不引入新的环境变量开关
- 不依赖 Claude 自标记（如旧 spec 的 `[NEED_REPLY]`）

## 2. 触发策略

| 场景 | 行为 |
|---|---|
| Claude 流式成功结束 | 在 `flush(true)` 之后独立 `postMessage` 发 `<@${userId}> ✅` |
| Claude 抛错（catch 分支） | 在现有错误消息之后独立 `postMessage` 发 `<@${userId}> ❌` |
| 早退分支（`activeSessions.has` 命中） | **不 @**：未真正跑 Claude，原「正在处理」提示已足够 |
| `userId` 为空 | 跳过 @ |

理由：
- `chat.update` 在 Slack 多端不可靠触发推送通知；只有独立 `postMessage` 才能稳定 push。
- 出错与成功用不同 emoji（❌ / ✅）区分，便于用户在通知预览中即刻识别状态。

## 3. @ 消息发送方式

- 走原生 `client.chat.postMessage`，**不经 `safePost` / `splitToBlocks`**：文本极短（`<@U…> ✅` 仅十余字符），无超长风险。
- 整段调用包 try/catch，失败仅 `log.warn`，不抛出、不影响主流程。
- 不复用最后一段 `safeUpdate` 把 @ 拼进去：那样 `chat.update` 仍不能可靠 push，等于失去通知目的。

## 4. 代码改动点

| 文件 | 改动 |
|---|---|
| `src/commands/index.ts` | 1) `CommandContext` 新增 `userId?: string`<br>2) `registerCommands` 构造 `ctx` 时塞入 `event.user`<br>3) `handleClaude` 解构 `userId`<br>4) `try` 末尾（`saveConversationLog` 之后）若 `userId` 存在，独立 `postMessage` `<@${userId}> ✅`<br>5) `catch` 末尾若 `userId` 存在，独立 `postMessage` `<@${userId}> ❌`<br>6) `@` 发送包 try/catch，失败 `log.warn` |

不做：
- 不在 chunk 内拼接 @
- 不在 `finally` 中以 flag 区分成功/失败（分散逻辑、不直观）
- 不动 `handleGemini` / `safeUpdate` / `postBlocks` / `splitToBlocks`
- 不新增环境变量

## 5. 边界处理

| 情况 | 处理 |
|---|---|
| `userId` 缺失 | 跳过 @（不报错） |
| `content` 为空但无异常（已 update 为「Claude 未返回内容」） | 仍发 `✅`（用户需要知道流程结束） |
| catch 中已发错误消息后再 @ | 接受会有两条消息（错误正文 + @ 通知） |
| @ 自身 `postMessage` 失败 | `log.warn`，不抛、不影响主流程 |
| `activeSessions` 早退分支 | 不 @ |

## 6. CLAUDE.md 同步

在「关键设计注意事项」追加一条：

> `handleClaude` 透传链路在成功结束（`✅`）或失败（`❌`）后，会在同一 thread 独立 `postMessage` 一条 `<@user> ✅|❌` 消息，用于触发 Slack 推送通知；该行为仅作用于 Claude，不涉及 Gemini 等其他命令。

## 7. 验证

- `npm run build` 通过
- Slack 端到端手动测试：
  - 普通提问 → Claude 流式回复 → thread 中收到独立 `<@USER> ✅`，移动端/桌面端有推送通知
  - 构造一次 SDK 错误（例如临时改坏 `ANTHROPIC_BASE_URL`）→ 收到错误消息 + 独立 `<@USER> ❌`
  - 同一 thread 在 Claude 处理中再次 @bot（触发 `activeSessions` 早退）→ **不** 应再收到 `✅` 或 `❌`
  - 隐藏：临时让 `postMessage` 抛错路径（脚本拦截）→ 主回复正常，仅 `log.warn`
