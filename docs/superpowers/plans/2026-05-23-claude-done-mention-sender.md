# Claude 完成后 @ 发送者 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Claude 透传链路（`handleClaude`）每次结束时，在同一 Slack thread 独立 `postMessage` 一条 `<@user> ✅`（成功）或 `<@user> ❌`（失败），触发推送通知。

**Architecture:** 仅修改 `src/commands/index.ts`：扩展 `CommandContext` 携带 `userId`，在 `try` 末尾和 `catch` 末尾各加一段「独立 `chat.postMessage` + try/catch + log.warn 兜底」。同步更新 `CLAUDE.md`。

**Tech Stack:** TypeScript (strict, ES2022 Modules) + @slack/bolt + @slack/web-api。无单元测试，验证 = `npm run build` + Slack 端到端手动测试。

**Spec:** `docs/superpowers/specs/2026-05-23-claude-done-mention-sender-design.md`

---

## File Structure

- Modify: `src/commands/index.ts` — 接口扩展、`registerCommands` 注入 `userId`、`handleClaude` 末端发 @
- Modify: `CLAUDE.md` — 「关键设计注意事项」追加一条说明

无新增文件，无文件拆分。

---

### Task 1: 扩展 `CommandContext`，让 `event.user` 流入 `handleClaude`

**Files:**
- Modify: `src/commands/index.ts:53-60` (`CommandContext` 接口)
- Modify: `src/commands/index.ts:206-212` (`registerCommands` 构造 `ctx`)

- [ ] **Step 1: 在 `CommandContext` 增加 `userId?: string`**

修改 `src/commands/index.ts` 中的接口定义（第 53-60 行）：

```ts
export interface CommandContext {
  text: string;
  channel: string;
  threadTs: string;
  say: SayFn;
  client: WebClient;
  files?: SlackFile[];
  userId?: string;
}
```

- [ ] **Step 2: 在 `registerCommands` 把 `event.user` 注入 `ctx`**

修改 `src/commands/index.ts` 中 `app.event('app_mention', ...)` 内构造 `ctx` 的语句（第 211-212 行附近）：

```ts
const files = (event as any).files as SlackFile[] | undefined;
const ctx: CommandContext = {
  text,
  channel: event.channel,
  threadTs,
  say,
  client,
  files,
  userId: event.user,
};
```

- [ ] **Step 3: 验证 `npm run build`**

Run: `npm run build`
Expected: PASS（tsc 0 错误）

- [ ] **Step 4: Commit**

```bash
git add src/commands/index.ts
git commit -m "feat(commands): expose event.user via CommandContext.userId"
```

---

### Task 2: 在 `handleClaude` 成功结束后 @ 发送者

**Files:**
- Modify: `src/commands/index.ts:126-203` (`handleClaude`)

- [ ] **Step 1: 在 `handleClaude` 签名解构 `userId`**

修改第 126 行函数签名：

```ts
async function handleClaude({ text, channel, threadTs, client, files, userId }: CommandContext) {
```

- [ ] **Step 2: 在成功路径末尾（`saveConversationLog` 之后）追加 @ 消息**

定位第 187 行附近的 `await saveConversationLog(...)`，在其后、`} catch` 之前追加：

```ts
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
```

完整 `try` 块结尾的预期形态：

```ts
    const settings = getClaudeSettings();
    await saveConversationLog({ prompt: finalPrompt, reply: content, durationMs, sessionId, resume, segments, model: model ?? settings.model, effort: effort ?? settings.effort });
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
```

- [ ] **Step 3: 验证 `npm run build`**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/commands/index.ts
git commit -m "feat(commands): mention sender with checkmark after Claude success"
```

---

### Task 3: 在 `handleClaude` 失败路径 @ 发送者

**Files:**
- Modify: `src/commands/index.ts:188-194` (`handleClaude` 的 `catch` 块)

- [ ] **Step 1: 在 `catch` 末尾追加 @ 消息**

定位第 188-194 行的 `catch (err)` 块，在已有的错误消息发送（`chat.update` 或 `safePost`）之后追加 `userId` 兜底 @：

```ts
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
```

- [ ] **Step 2: 验证 `npm run build`**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/commands/index.ts
git commit -m "feat(commands): mention sender with cross-mark after Claude error"
```

---

### Task 4: 更新 CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`（「关键设计注意事项」节）

- [ ] **Step 1: 在「关键设计注意事项」追加一条**

打开 `CLAUDE.md`，定位到「关键设计注意事项」列表，在「Slash 前缀转义」之前或之后追加一行（保持列表风格一致）：

```markdown
- **Claude 完成通知**: `handleClaude` 透传链路在成功结束（`✅`）或失败（`❌`）后，会在同一 thread 独立 `postMessage` 一条 `<@user> ✅|❌` 消息，用于触发 Slack 推送通知；该行为仅作用于 Claude，不涉及 Gemini 等其他命令；`postMessage` 自身失败仅 `log.warn`，不中断主流程
```

- [ ] **Step 2: 验证（仅 docs，不需 build；快速扫读列表风格一致）**

Run: `git diff CLAUDE.md`
Expected: 仅新增一行 bullet；缩进/前缀与同列表其他项一致。

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude.md): document Claude done @sender notification"
```

---

### Task 5: Slack 端到端手动验证

**Files:** 无（运行时验证）

- [ ] **Step 1: 启动 bot**

Run: `npm run dev`
Expected: 控制台显示 `Slack bot started`（或当前项目的启动日志），无致命错误。

- [ ] **Step 2: 正常对话路径**

在 Slack 中 @bot 发一条普通问题，例如：`@bot 你好`

Expected：
- Claude 流式回复正常
- thread 中最后**多出一条独立消息** `@<你> ✅`
- 手机/桌面 Slack 收到推送（前提：未屏蔽 thread）

- [ ] **Step 3: 错误路径**

临时构造一次 Claude 调用失败：例如在 `.env` 把 `ANTHROPIC_BASE_URL` 改为一个无法访问的 URL（如 `http://127.0.0.1:1`），重启 bot 后 @bot 提问。

Expected：
- thread 中出现 `出错: ...` 错误消息
- 紧接着出现独立的 `@<你> ❌` 消息
- 控制台未崩溃

测试后**恢复 `.env`** 并重启。

- [ ] **Step 4: 早退路径**

在 Claude 还在流式回复的 thread 内再次 @bot 发一条新消息（趁第一条未结束）。

Expected：
- 收到「上一条消息还在处理中，请稍后再试。」
- **不**收到 `✅` 或 `❌`

- [ ] **Step 5: 不出现 @ 的命令**

@bot 发 `help`、`gemini 你好`（若 Gemini 已配置）。

Expected：
- 正常返回帮助 / Gemini 回复
- thread 中**没有** `<@user> ✅`/`❌` 跟在后面

- [ ] **Step 6: 全部通过后无需额外 commit**

前面 4 个 task 已经各自 commit，验证阶段不产生代码改动。如发现 bug，回到对应 task 修正并补 commit。

---

## Self-Review

**1. Spec coverage:**
- Spec §2 「触发策略」四种情况：成功 → Task 2；失败 → Task 3；早退 → 未改动 `activeSessions.has` 早退分支即默认不 @（Task 5 Step 4 验证）；`userId` 为空 → Task 2/3 用 `if (userId)` 守卫
- Spec §3 「发送方式」直接 `client.chat.postMessage` + try/catch + `log.warn` → Task 2/3
- Spec §4 「代码改动点」全部 6 项 → Task 1（1-3 项）、Task 2（4 项）、Task 3（5 项），第 6 项「@ 发送包 try/catch + log.warn」在 Task 2/3 落实
- Spec §5 「边界处理」全部映射到 Task 2/3 实现 + Task 5 验证
- Spec §6 「CLAUDE.md 同步」→ Task 4
- Spec §7 「验证」→ Task 5

**2. Placeholder scan:** 无 TBD / TODO / "implement later"。所有代码块给出完整可粘贴片段。

**3. Type consistency:** `userId?: string` 统一；`event.user` Bolt 类型为 `string | undefined`，与 `userId?: string` 兼容。`log.warn` 已在 `src/utils/logger.ts` 存在（CLAUDE.md 已记录）。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-23-claude-done-mention-sender.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
