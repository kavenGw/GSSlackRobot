# Claude Code SDK 迁移实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 `@anthropic-ai/claude-agent-sdk` 替换 CLI 子进程调用，消除每次请求的冷启动开销。

**Architecture:** 重写 `src/services/claude.ts` 内部实现，从 `spawn()` 切换为 SDK 的 `query()` 函数。`askClaude()` 对外接口不变（AsyncGenerator<string>），调用方零改动。同步清理 `CLAUDE_COMMAND` 相关配置。

**Tech Stack:** `@anthropic-ai/claude-agent-sdk`, TypeScript, Node.js

---

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `src/services/claude.ts` | 重写 | SDK `query()` 调用 + 流式输出解析 |
| `src/config/schema.ts` | 修改 | 删除 `command` 字段 |
| `src/config/index.ts` | 修改 | 删除 `CLAUDE_COMMAND` 加载 |
| `package.json` | 修改 | 新增 SDK 依赖 |
| `.env.example` | 修改 | 移除 `CLAUDE_COMMAND` |
| `CLAUDE.md` | 修改 | 移除 `CLAUDE_COMMAND` 说明 |
| `docs/setup-guide.md` | 修改 | 移除 `CLAUDE_COMMAND` 引用 |
| `docs/claude-integration.md` | 修改 | 移除 `CLAUDE_COMMAND` 引用 |
| `docs/technical-reference.md` | 修改 | 移除 `CLAUDE_COMMAND` 引用 |

---

### Task 1: 安装 SDK 并确认 API

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 `@anthropic-ai/claude-agent-sdk`**

```bash
npm install @anthropic-ai/claude-agent-sdk
```

- [ ] **Step 2: 确认 SDK 导出和类型**

检查 `node_modules/@anthropic-ai/claude-agent-sdk` 下的 `.d.ts` 类型定义文件，确认：
- `query()` 参数结构（`{ prompt, options }` 还是其他）
- result 消息的错误字段名（`errors` 数组 vs `error` 字符串）
- 返回对象是否有 `.close()` 方法（vs 标准 `.return()`）
- `options.model` 接受的值格式

确认模型名格式：

```bash
grep -r "ModelName\|claude-opus\|claude-sonnet\|claude-haiku" node_modules/@anthropic-ai/claude-agent-sdk/dist/
```

记录确认结果，后续步骤以实际类型为准。

---

### Task 2: 重写 `src/services/claude.ts`

**Files:**
- Modify: `src/services/claude.ts`

- [ ] **Step 1: 替换 import**

将文件开头的 import 区段替换为：

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';
import { getConfig } from '../config/index.js';
import { log } from '../utils/logger.js';
import { getClaudeSettings } from './settings.js';
```

注意：`getConfig` 和 `getClaudeSettings` 保留，`spawn`、`isDebug`、`saveRawLog` 删除。

- [ ] **Step 2: 添加模型名映射**

在 import 之后添加（版本号以 Task 1 确认为准）：

```typescript
const MODEL_MAP: Record<string, string> = {
  opus: 'claude-opus-4-6',
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5',
};

function resolveModel(shortName: string): string {
  return MODEL_MAP[shortName] ?? shortName;
}
```

- [ ] **Step 3: 重写 `askClaude()` 函数体**

保持签名不变，替换整个函数体为：

```typescript
export async function* askClaude(prompt: string, sessionId?: string, resume = false, model?: string, effort?: string): AsyncGenerator<string> {
  const cfg = getConfig().claude;
  const claudeSettings = getClaudeSettings();

  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  if (cfg.anthropicBaseUrl) env.ANTHROPIC_BASE_URL = cfg.anthropicBaseUrl;
  if (cfg.anthropicAuthToken) env.ANTHROPIC_AUTH_TOKEN = cfg.anthropicAuthToken;
  if (cfg.httpProxy) env.http_proxy = cfg.httpProxy;
  if (cfg.httpsProxy) env.https_proxy = cfg.httpsProxy;

  const options: Record<string, unknown> = {
    model: resolveModel(model ?? claudeSettings.model),
    effort: effort ?? claudeSettings.effort,
    includePartialMessages: true,
    env,
  };

  if (cfg.projectDir) options.cwd = cfg.projectDir;

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
  } else {
    options.permissionMode = 'default';
  }

  const conversation = query({ prompt, options });
  let hasContent = false;

  try {
    for await (const message of conversation) {
      // 流式文本 delta
      if (message.type === 'stream_event') {
        const event = (message as any).event;
        if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          hasContent = true;
          yield event.delta.text;
        }
      }
      // 最终结果
      else if (message.type === 'result') {
        const msg = message as any;
        if (msg.subtype === 'success' && !hasContent && msg.result) {
          yield msg.result;
        } else if (msg.subtype !== 'success') {
          throw new Error(msg.errors?.[0] ?? msg.error ?? `Claude SDK error: ${msg.subtype}`);
        }
      }
    }
  } finally {
    if (typeof (conversation as any).close === 'function') {
      (conversation as any).close();
    } else if (typeof conversation.return === 'function') {
      conversation.return(undefined as any);
    }
  }
}
```

- [ ] **Step 4: 根据 Task 1 类型确认结果，将 `as any` 替换为正确的类型**

检查 SDK 导出的类型定义，替换所有 `as any` 为正确的类型断言或类型守卫。如 SDK 类型不够精确，保留 `as any` 并添加注释说明原因。

- [ ] **Step 5: 验证编译通过**

```bash
npm run build
```

Expected: 编译成功，无错误。

---

### Task 3: 清理 `CLAUDE_COMMAND` 配置

**Files:**
- Modify: `src/config/schema.ts:7` — 删除 `command: string;`
- Modify: `src/config/index.ts:41` — 删除 `command: optional('CLAUDE_COMMAND', 'claude'),`
- Modify: `.env.example:6` — 删除 `CLAUDE_COMMAND=claude`
- Modify: `CLAUDE.md:80` — 删除 `CLAUDE_COMMAND` 行
- Modify: `docs/setup-guide.md:109` — 删除 `CLAUDE_COMMAND` 引用
- Modify: `docs/claude-integration.md` — 删除所有 `CLAUDE_COMMAND` 引用
- Modify: `docs/technical-reference.md` — 删除所有 `CLAUDE_COMMAND` 引用

- [ ] **Step 1: 修改 `src/config/schema.ts`**

从 `ClaudeConfig` 接口中删除 `command: string;` 行。

- [ ] **Step 2: 修改 `src/config/index.ts`**

从 `claude` 配置对象中删除 `command: optional('CLAUDE_COMMAND', 'claude'),` 行。

- [ ] **Step 3: 修改 `.env.example`**

删除 `CLAUDE_COMMAND=claude` 行。

- [ ] **Step 4: 修改 `CLAUDE.md`**

从可选参数表中删除 `CLAUDE_COMMAND` 行。

- [ ] **Step 5: 修改 `docs/setup-guide.md`**

删除 `CLAUDE_COMMAND` 相关行。

- [ ] **Step 6: 修改 `docs/claude-integration.md`**

删除所有 `CLAUDE_COMMAND` 引用（环境变量表、示例代码、调试命令等）。

- [ ] **Step 7: 修改 `docs/technical-reference.md`**

删除所有 `CLAUDE_COMMAND` 引用（配置代码示例、环境变量表等）。

- [ ] **Step 8: 验证编译通过**

Task 2 已重写 `claude.ts` 移除了 `cfg.command` 引用，此步确认所有文件修改完成后整体编译正常：

```bash
npm run build
```

Expected: 编译成功。

---

### Task 4: 冒烟测试

- [ ] **Step 1: 启动 dev 模式**

```bash
npm run dev
```

确认启动无报错。

- [ ] **Step 2: Slack 中发送简单问题**

在 Slack 中 @bot 发送一条简单问题（如"你好"），验证：
- 回复正常返回
- 流式更新正常（"思考中..."逐步变为内容）

- [ ] **Step 3: 验证短回复场景**

发送一个预期短回复的问题（如"1+1"），验证仅通过 result 兜底（无 stream delta）时也能正常显示。

- [ ] **Step 4: 验证 session 多轮对话**

在同一 thread 中再发一条消息，验证上下文保持。

- [ ] **Step 5: 验证模型切换**

发送 `opus 你好` 或 `haiku 你好`，验证模型前缀解析正常。

- [ ] **Step 6: 验证错误处理**

触发一个错误场景（如发送极长文本或无效操作），验证错误消息正确显示在 Slack thread 中而非导致进程崩溃。
