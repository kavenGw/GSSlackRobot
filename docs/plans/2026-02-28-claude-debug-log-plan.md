# Claude 详细日志 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** dev.bat 运行时记录 Claude CLI 完整原始输出和交互详情到 logs/，方便排查问题。

**Architecture:** 通过环境变量 `DEBUG_CLAUDE=true` 控制开关。logger.ts 新增 `isDebug()` 判断和 `saveRawLog()` 写入原始数据。claude.ts 在 debug 模式下收集完整 stdout/stderr 原始内容，调用结束后保存。对话日志增加 args/model/effort 字段。

**Tech Stack:** Node.js fs/promises, TypeScript

---

### Task 1: logger.ts — 新增 debug 工具函数

**Files:**
- Modify: `src/utils/logger.ts`

**Step 1: 添加 `isDebug()` 函数和 `saveRawLog()`**

在 `logger.ts` 文件顶部（`import` 之后、`function ts()` 之前）添加：

```typescript
export function isDebug(): boolean {
  return process.env.DEBUG_CLAUDE === 'true';
}
```

在 `saveConversationLog` 函数之后添加 `saveRawLog`：

```typescript
interface RawLogParams {
  args: string[];
  sessionId?: string;
  resume: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export async function saveRawLog(params: RawLogParams): Promise<void> {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = now.getFullYear();
  const m = pad(now.getMonth() + 1);
  const d = pad(now.getDate());
  const H = pad(now.getHours());
  const M = pad(now.getMinutes());
  const S = pad(now.getSeconds());

  const dateStr = `${y}-${m}-${d}`;
  const timeStr = `${H}:${M}:${S}`;
  const fileName = `${dateStr}_${H}-${M}-${S}_claude_raw.log`;
  const logsDir = join(process.cwd(), 'logs');
  const filePath = join(logsDir, fileName);

  const content = `# Claude CLI Raw Log
- 时间: ${dateStr} ${timeStr}
- 参数: ${params.args.join(' ')}
- 会话ID: ${params.sessionId ?? 'N/A'}
- 续对话: ${params.resume ? '是' : '否'}
- 退出码: ${params.exitCode}

## STDOUT
${params.stdout}

## STDERR
${params.stderr || '(empty)'}
`;

  try {
    await mkdir(logsDir, { recursive: true });
    await writeFile(filePath, content, 'utf-8');
    log.info(`Raw log saved: logs/${fileName}`);
  } catch (err) {
    log.error(`保存原始日志失败: ${err instanceof Error ? err.message : String(err)}`);
  }
}
```

**Step 2: 增强 `saveConversationLog` 参数**

修改 `ConversationLogParams` 接口，添加可选字段：

```typescript
interface ConversationLogParams {
  prompt: string;
  reply: string;
  durationMs: number;
  sessionId: string;
  resume: boolean;
  segments: number;
  args?: string[];
  model?: string;
  effort?: string;
  exitCode?: number | null;
}
```

在 `saveConversationLog` 的 `content` 模板中，`## 用户提问` 之前添加：

```typescript
${params.args ? `- 命令参数: ${params.args.join(' ')}\n` : ''}${params.model ? `- 模型: ${params.model}\n` : ''}${params.effort ? `- effort: ${params.effort}\n` : ''}${params.exitCode !== undefined ? `- 退出码: ${params.exitCode}\n` : ''}
```

**Step 3: 验证编译**

Run: `npx tsc --noEmit`
Expected: 无错误（新增函数暂未被调用，接口新增字段为可选）

**Step 4: Commit**

```bash
git add src/utils/logger.ts
git commit -m "feat: logger 新增 debug 判断和原始日志保存功能"
```

---

### Task 2: claude.ts — debug 模式收集原始输出

**Files:**
- Modify: `src/services/claude.ts`

**Step 1: 引入 debug 工具并收集原始数据**

在 `claude.ts` 顶部 import 中添加 `isDebug` 和 `saveRawLog`：

```typescript
import { log, isDebug, saveRawLog } from '../utils/logger.js';
```

在 `askClaude` 函数中，`const proc = spawn(...)` 之后、`let stderrOutput = ''` 之前添加：

```typescript
const debug = isDebug();
let rawStdout = '';
```

在 `for await (const chunk of proc.stdout)` 循环中，`buffer += chunk.toString()` 之后添加：

```typescript
if (debug) rawStdout += chunk.toString();
```

修改 stderr handler，让 debug 模式下也收集 stderr（现有 `stderrOutput` 已在做这个，无需改动）。

在 `finally` 块中，`clearTimeout(timeout)` 之后、`if (!proc.killed)` 之前添加：

```typescript
if (debug) {
  const exitCode = await exitCodePromise;
  saveRawLog({ args, sessionId: sessionId ?? undefined, resume, stdout: rawStdout, stderr: stderrOutput, exitCode });
}
```

注意：`saveRawLog` 返回 Promise 但此处不 await，避免阻塞主流程。日志保存失败不影响正常功能。

**Step 2: 让 `askClaude` 返回额外信息供对话日志使用**

修改 `askClaude` 的返回类型。为保持 AsyncGenerator 接口不变，改为在 generator return value 中携带 metadata。

实际上更简单的方式：在 `commands/index.ts` 调用 `saveConversationLog` 时直接传入 model/effort/args 信息，因为这些信息在调用侧已知。不需要修改 `askClaude` 的签名。

因此 claude.ts 只需加 debug 原始日志收集逻辑。

**Step 3: 验证编译**

Run: `npx tsc --noEmit`
Expected: 无错误

**Step 4: Commit**

```bash
git add src/services/claude.ts
git commit -m "feat: claude.ts debug 模式收集并保存 CLI 原始输出"
```

---

### Task 3: commands/index.ts — 对话日志传入增强字段

**Files:**
- Modify: `src/commands/index.ts`

**Step 1: 增强 `saveConversationLog` 调用**

在 `handleClaude` 函数中找到 `saveConversationLog` 调用（约第 143 行），添加新字段：

```typescript
await saveConversationLog({
  prompt,
  reply: content,
  durationMs,
  sessionId,
  resume,
  segments,
  model: model ?? getClaudeSettings().model,
  effort: effort ?? getClaudeSettings().effort,
});
```

需要在函数顶部引入 `getClaudeSettings`（已在文件中 import）。

**Step 2: 验证编译**

Run: `npx tsc --noEmit`
Expected: 无错误

**Step 3: Commit**

```bash
git add src/commands/index.ts
git commit -m "feat: 对话日志记录 model 和 effort 信息"
```

---

### Task 4: dev.bat — 设置环境变量

**Files:**
- Modify: `dev.bat`

**Step 1: 添加环境变量**

在 `cd /d "%~dp0"` 之后、`npm run dev` 之前添加：

```bat
set DEBUG_CLAUDE=true
```

完整文件：

```bat
@echo off
cd /d "%~dp0"
set DEBUG_CLAUDE=true
npm run dev
pause
```

**Step 2: Commit**

```bash
git add dev.bat
git commit -m "feat: dev.bat 开启 Claude debug 日志"
```

---

### Task 5: 端到端验证

**Step 1: 运行 dev 模式**

Run: `npm run dev`（不设 DEBUG_CLAUDE）
Expected: 正常启动，无额外日志文件生成

**Step 2: 设置环境变量运行**

Run: `DEBUG_CLAUDE=true npm run dev`
Expected: 启动后调用 Claude 时，logs/ 下生成 `*_claude_raw.log` 文件，对话日志包含 model/effort 字段

**Step 3: 检查日志内容**

确认 raw log 包含：完整 JSON Lines stdout、stderr、参数信息、退出码
确认对话日志包含：model、effort 字段
