# 设计：Jenkins 通知频道补发 @channel

- 日期：2026-05-27
- 主题：监听指定 Slack 频道里的 Jenkins App 通知消息，由本 bot 在同频道独立补发一条 `<!channel>` 触发推送提醒

## 背景

Jenkins 当前通过 Slack 自带的 Jenkins 应用把构建结果推送到 Slack 频道（截图所示样式：`Upgrade GSEngine #309 - Success`）。Jenkins App 本身不会 @channel/@here，频道成员容易错过通知。

需求：让 bot 在 Jenkins 推送到达后，在同频道独立补发一条 `<!channel>` 消息，触发 Slack 对所有频道成员的推送提醒。

不改 Jenkins 侧 Slack Plugin 配置；只在本 bot 项目内实现。

## 决策摘要

| 维度 | 决策 |
|------|------|
| 触发源 | bot 监听指定 Slack 频道的 `message` 事件 |
| 识别策略 | 频道作为唯一过滤器（约定该频道只用于 Jenkins 通知，不限制发送方 bot_id / username） |
| @ 粒度 | `<!channel>`（频道所有成员，含离线） |
| 消息形态 | 在该频道顶层独立发一条新消息（不进 thread） |
| 消息内容 | 纯 `<!channel>` 一个字 |
| 触发条件 | 该频道里出现新顶层消息即触发，**bot 自身消息除外** |
| 配置 | 新增环境变量 `JENKINS_NOTIFY_CHANNEL`，未设置则功能完全关闭 |

## 架构与组件

### 新增 / 修改文件

| 文件 | 改动 |
|------|------|
| `src/config/schema.ts` | `AppConfig` 增加 `jenkinsMention?: { channel: string }` |
| `src/config/index.ts` | 读取 `JENKINS_NOTIFY_CHANNEL` 环境变量并填入 `AppConfig` |
| `src/config/env-validator.ts` | 校验 `JENKINS_NOTIFY_CHANNEL` 格式（若设置） |
| `src/events/jenkins-mention.ts` *(新建)* | 注册 `message` 事件 handler |
| `src/app.ts` | 在 `registerCommands(app)` 之后调用 `registerJenkinsMention(app)` |
| `CLAUDE.md` | 环境变量表新增条目；关键设计注意事项加一条说明 |
| `docs/setup-guide.md` | 中文配置指南补充变量与 Slack scope / event 订阅说明 |
| `.env.example` | 增加占位行 `# JENKINS_NOTIFY_CHANNEL=C0000000000` |

### Slack App 配置要求（运行时人工配置，不在代码内）

- **OAuth scope**：`channels:history`（公共频道）或 `groups:history`（私有频道），按 Jenkins 频道实际类型勾选
- **Event Subscriptions**：订阅 `message.channels`（公共）或 `message.groups`（私有）
- **频道**：bot 必须被 invite 进 Jenkins 通知频道
- `chat:write` scope 已有，无需新增

## 事件 handler 过滤逻辑

`src/events/jenkins-mention.ts` 注册 `message` 事件 handler，按顺序执行以下过滤，**任一不通过则 return**：

1. **频道匹配**：`event.channel === cfg.jenkinsMention.channel`。不匹配直接 ignore。
2. **跳过自身**：`event.bot_id === <自身 bot_id>` 时跳过。自身 bot_id 在 app 启动后通过 `auth.test` API 一次性查出并缓存。**防无限循环的关键**。
3. **跳过 message 变更事件**：`event.subtype` 在 `['message_changed', 'message_deleted', 'message_replied']` 中时跳过。Jenkins App 编辑消息（如 In Progress → Success）会触发 `message_changed`，不需要重复 @。
4. **跳过 thread 内回复**：`event.thread_ts && event.thread_ts !== event.ts` 时跳过。只对频道顶层新消息 @，避免别人在 Jenkins 消息下 thread 讨论时被 @。
5. **兜底：文本即 `<!channel>` 时跳过**。归一化 trim 后若文本就是 `<!channel>`，跳过。防 bot_id 缓存未及时拿到的边角情况下的循环。

通过过滤后：

```ts
await client.chat.postMessage({
  channel: event.channel,
  text: '<!channel>',
  link_names: 1,
});
```

失败用 `log.warn` 记录，不抛错（与项目"通知失败不中断主流程"约定一致）。

### 为什么不限制 `subtype === 'bot_message'`

用户已声明该频道只用于 Jenkins 通知、无真人聊天。限制 bot_message 反而增加复杂度且对未来兼容性不友好（Jenkins 若改用其他推送方式可能不带 `bot_message` subtype）。**频道纯净度是运维约定，不是代码层校验。**

## 配置与环境变量

### 新增环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `JENKINS_NOTIFY_CHANNEL` | 无 | Jenkins 通知 Slack 频道 ID。设置后启用 @channel 补发功能；不设则该功能完全关闭。 |

### `AppConfig` 字段

```ts
// src/config/schema.ts
jenkinsMention?: {
  channel: string;
};
```

### 加载

```ts
// src/config/index.ts
jenkinsMention: process.env.JENKINS_NOTIFY_CHANNEL
  ? { channel: process.env.JENKINS_NOTIFY_CHANNEL }
  : undefined,
```

### 校验（`env-validator.ts`）

若 `JENKINS_NOTIFY_CHANNEL` 设置：

- 必须以 `C`（公共频道）或 `G`（私有频道）开头
- 长度 ≥ 9（Slack channel ID 最短约 9 字符）
- 不可为占位符（`your-channel-id` / `xxx` 等）

校验失败抛 `EnvValidationError`，与现有机制一致。

### 与 `GITLAB_NOTIFY_CHANNEL` 的关系

各自独立。两个变量可以都设、都不设、或只设一个。`GITLAB_NOTIFY_CHANNEL` 控制 webhook server 是否启动；`JENKINS_NOTIFY_CHANNEL` 控制 message 事件 handler 是否注册。互不影响。

## 启动行为

- `JENKINS_NOTIFY_CHANNEL` 未设置：`registerJenkinsMention(app)` 内部直接 return，不订阅事件、不打日志噪音
- 已设置：注册 `message` 事件 handler；启动时 `log.info('jenkins-mention: 已启用，监听频道 <channel>')`

## 错误处理

| 错误场景 | 处理 |
|----------|------|
| `auth.test` 取自身 bot_id 失败 | 启动时 `log.error` 并跳过 `registerJenkinsMention`，不阻塞 app 启动 |
| `client.chat.postMessage` 失败 | `log.warn`，不抛错。保持"通知失败不中断主流程"约定 |
| `message` event 处理过程中抛错 | handler 整体包 try-catch，错误记 `log.warn`，避免影响后续 event 处理 |
| 未订阅 `message.channels` event scope | Slack 端静默不推事件，bot 启动时无感知。**Slack App 配置为人工运维项**，本设计在文档侧明确要求 |

## 测试策略

按项目约定（无单元测试套件）：

1. **构建验证**：`npm run build`（tsc 必须通过）
2. **端到端手动验证**（用户执行）：
   - 配置 `JENKINS_NOTIFY_CHANNEL` 到一个测试频道
   - 把 bot invite 到该频道
   - 在 Slack App 后台订阅 `message.channels` 或 `message.groups` event
   - 在该频道里发任意一条消息（手动或触发一个 Jenkins build）
   - 验证 bot 立即补发 `<!channel>`，且**不自我循环**
3. **回归验证**：不配置 `JENKINS_NOTIFY_CHANNEL` 时，启动日志不出现 jenkins-mention 相关字样，行为完全不变

## 文档同步（按 CLAUDE.md "配置变更同步" 约定）

- `CLAUDE.md`：环境变量表新增 `JENKINS_NOTIFY_CHANNEL`；"关键设计注意事项" 加一条说明 bot 监听 Jenkins 频道补发 @channel 的机制
- `docs/setup-guide.md`：中文配置指南补充该变量与 Slack scope（`channels:history` / `groups:history`）+ event 订阅说明
- `.env.example`：加占位行 `# JENKINS_NOTIFY_CHANNEL=C0000000000`

## 范围之外（YAGNI）

- 不实现按 build 状态过滤（Success/Failure/Aborted）
- 不实现按 Job 名过滤
- 不实现 @here 或自定义用户列表（未来如需，再加 env 切换）
- 不实现 Jenkins 自己的 webhook 端点（与"沿用 Jenkins App"决策冲突）
- 不实现可配置的消息内容（固定为 `<!channel>`）
