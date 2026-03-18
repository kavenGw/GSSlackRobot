# Claude Code SDK 替换 CLI 子进程

## 背景

当前 `askClaude()` 通过 `spawn('claude', ['-p', ...])` 调用 CLI 子进程。每次调用经历：进程创建 → CLI 初始化 → 会话加载 → API 连接建立 → AI 生成。相比用户在 CMD 中使用交互模式（进程常驻、连接复用），Slack bot 的整体完成时间明显更长。

## 方案

用 `@anthropic-ai/claude-agent-sdk` npm 包替换 CLI 子进程调用，在 Node.js 进程内直接调用 Claude Code 引擎，消除冷启动开销。

## 核心设计

### 接口不变

`askClaude()` 函数签名保持不变：

```typescript
export async function* askClaude(
  prompt: string,
  sessionId?: string,
  resume = false,
  model?: string,
  effort?: string
): AsyncGenerator<string>
```

调用方（`commands/index.ts` 等）零改动。

### 内部实现替换

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

// 构建 options
const options = {
  model: model ?? claudeSettings.model,
  effort: effort ?? claudeSettings.effort,
  includePartialMessages: true,
  env,
  cwd: cfg.projectDir,
  sessionId: !resume ? sessionId : undefined,
  resume: resume ? sessionId : undefined,
  permissionMode: 'bypassPermissions',
  allowDangerouslySkipPermissions: cfg.dangerouslySkipPermissions,
};

// 流式输出
const conversation = query({ prompt, options });
try {
  for await (const message of conversation) {
    if (message.type === 'stream_event') {
      const event = message.event;
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        hasContent = true;
        yield event.delta.text;
      }
    } else if (message.type === 'result') {
      if (message.subtype === 'success' && !hasContent) {
        // 兜底：流式 delta 未收到内容时，用 result 补偿
        yield message.result;
      } else if (message.subtype !== 'success') {
        // error_during_execution / error_max_turns 等
        throw new Error(message.errors?.[0] ?? `Claude SDK error: ${message.subtype}`);
      }
    }
  }
} finally {
  conversation.close();  // 确保资源释放（对应原 proc.kill）
}
```

### 配置映射

| CLI 参数/环境变量 | SDK options |
|---|---|
| `env.ANTHROPIC_BASE_URL` | `options.env.ANTHROPIC_BASE_URL` |
| `env.ANTHROPIC_AUTH_TOKEN` | `options.env.ANTHROPIC_AUTH_TOKEN` |
| `env.http_proxy / https_proxy` | `options.env.http_proxy / https_proxy` |
| `spawnOptions.cwd` | `options.cwd` |
| `--model` | `options.model` |
| `--effort` | `options.effort` |
| `--session-id` | `options.sessionId` |
| `--resume` | `options.resume` |
| `--dangerously-skip-permissions` | `options.permissionMode: 'bypassPermissions'` + `options.allowDangerouslySkipPermissions: true` |
| `--verbose` | 不再需要 |

### 删除的代码

- `spawn()` 进程创建、`proc.stdout` / `proc.stderr` 监听
- JSON Lines 手动解析（`buffer.split('\n')` + `JSON.parse`）
- `rawStdout`、`stderrOutput`、debug `saveRawLog`
- `exitCodePromise`、`proc.kill('SIGTERM')` 进程管理

### 错误处理

- `result` 消息区分 `subtype`：`success` 为正常完成，其余（`error_during_execution`、`error_max_turns` 等）抛异常
- 流式 delta 和 result 不重复 yield：优先用 `stream_event` delta，`result.result` 仅在无 delta 时兜底
- `finally` 块调用 `conversation.close()` 确保底层资源释放
- 外层 `handleClaude()` 的 try-catch 已能兜住所有异常

### debug 日志

原有 `DEBUG_CLAUDE=true` 时的 `saveRawLog` 不再保留。SDK 模式下如需调试，可通过记录所有 `SDKMessage` 实现等价能力，但不在本次范围内。

## 改动范围

| 文件 | 变更 |
|---|---|
| `src/services/claude.ts` | 重写（~50 行 → ~35 行） |
| `src/config/schema.ts` | 删除 `command` 字段 |
| `src/config/index.ts` | 删除 `CLAUDE_COMMAND` 加载逻辑 |
| `package.json` | 新增 `@anthropic-ai/claude-agent-sdk` |
| `CLAUDE.md` | 移除 `CLAUDE_COMMAND` 环境变量说明 |
| `.env.example` | 移除 `CLAUDE_COMMAND` |

## 依赖变更

- 新增：`@anthropic-ai/claude-agent-sdk`
- 移除 import：`spawn` from `node:child_process`

## 实施注意事项

### 模型名映射（确定性 breaking change）

SDK `options.model` 需要全名（如 `claude-sonnet-4-6`），而当前 `settings.ts` 存储短名 `opus/sonnet/haiku`。需在 `askClaude()` 内做映射：

```typescript
const MODEL_MAP: Record<string, string> = {
  opus: 'claude-opus-4-6',     // 版本号需实测确认
  sonnet: 'claude-sonnet-4-6', // 版本号需实测确认
  haiku: 'claude-haiku-4-5',   // haiku 系列版本号不同，需实测确认
};
```

具体版本号以安装 SDK 后查看类型定义或文档为准。

### 权限控制

当 `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS=true` 时设置 `permissionMode: 'bypassPermissions'` + `allowDangerouslySkipPermissions: true`；否则使用 `permissionMode: 'default'`（不设置 `allowDangerouslySkipPermissions`）。

### 资源释放

`query()` 返回 AsyncGenerator，优先使用 `.close()` 终止；如 SDK 不提供 `.close()`，退回标准 `.return()` 方法。需安装 SDK 后确认。

### Session 管理

SDK 的 session 行为可能与 CLI 有细微差异，需验证同一 sessionId 的多轮对话正常工作。

### 错误消息字段

`result` 错误子类型的具体字段名（`errors` 数组 vs `error` 字符串）需安装 SDK 后查看类型定义确认。
