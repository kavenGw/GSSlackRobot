# Session Isolation Design

## 问题

Slack Bot 通过 `claude -p` 调用 Claude CLI 时，不同线程的对话上下文会互相干扰（"记忆错乱"）。Claude CLI 会读取项目目录的 CLAUDE.md 和全局 memory，导致不相关项目的上下文混入对话。

## 方案

用 Slack 的 `thread_ts` 生成确定性 UUID 作为 `--session-id`，每个 Slack 线程对应一个独立的 Claude CLI 会话。

### 核心改动

1. **`src/services/claude.ts`**：`askClaude(prompt, sessionId)` 新增 `sessionId` 参数，传给 `--session-id`
2. **`src/commands/index.ts`**：用 `thread_ts` 通过 UUID v5 生成确定性 UUID，传给 `askClaude`
3. **新增依赖**：`uuid`

### 数据流

```
用户 @bot → thread_ts → uuid v5(thread_ts) → claude -p --session-id <uuid> --output-format stream-json
```

### 保留项

- `CLAUDE_PROJECT_DIR` 保留，作为 Claude Code 工作目录（cwd）
