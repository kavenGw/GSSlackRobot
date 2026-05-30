# 「头脑风暴」前缀触发 brainstorming skill 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Slack 里 @bot 发送以 `头脑风暴 ` 开头的消息时，把开头替换为 `/superpowers:brainstorming` 并真正触发该 skill。

**Architecture:** 在 `handleClaude` 的斜杠转义点新增一个前缀分支：命中 `头脑风暴 ` 则替换前缀并保持斜杠开头（跳过空格转义），否则维持原有转义逻辑。其余为帮助文本与文档同步。

**Tech Stack:** TypeScript (strict, ES2022 Modules), Node.js, Slack Bolt。无单测套件，验证 = `npm run build`（tsc 通过）。

---

## 文件结构

- 修改：`src/commands/index.ts` — 新增两个模块级常量 + `handleClaude` 内前缀分支（核心逻辑）
- 修改：`src/commands/help.ts` — 帮助文本第 14 行改为中文触发形式
- 修改：`CLAUDE.md` — 「Slash 前缀转义」设计说明补例外
- 修改：`docs/setup-guide.md` — 命令列表加入「头脑风暴」用法

参考 spec：`docs/superpowers/specs/2026-05-30-brainstorm-trigger-design.md`

---

### Task 1: 核心逻辑 — `头脑风暴` 前缀替换并触发 skill

**Files:**
- Modify: `src/commands/index.ts`（模块级常量区，约 `:77` 的 `THROTTLE_MS` 附近；`handleClaude` 第 114 行）

- [ ] **Step 1: 新增模块级常量**

在 `src/commands/index.ts` 中 `const THROTTLE_MS = 500;`（第 77 行）这一行**下方**插入：

```ts
const BRAINSTORM_TRIGGER = '头脑风暴';
const BRAINSTORM_SKILL = '/superpowers:brainstorming';
```

- [ ] **Step 2: 替换斜杠转义行为前缀分支**

把 `handleClaude` 第 114 行：

```ts
  const prompt = text.startsWith('/') ? ` ${text}` : text;
```

替换为：

```ts
  let prompt: string;
  if (text.startsWith(BRAINSTORM_TRIGGER + ' ')) {
    // 主动请求脑暴 skill：替换前缀并保持斜杠开头，跳过转义以真正触发
    prompt = BRAINSTORM_SKILL + text.slice(BRAINSTORM_TRIGGER.length);
  } else {
    prompt = text.startsWith('/') ? ` ${text}` : text;
  }
```

注意：`prompt` 由 `const` 改为 `let`，下方代码对 `prompt` 只读，不受影响。

- [ ] **Step 3: 编译验证**

Run: `npm run build`
Expected: tsc 无报错（无 `prompt` 重复声明 / 类型错误），生成 `dist/`。

- [ ] **Step 4: 人工核对行为矩阵（读代码自查，无需运行 bot）**

对照确认：
- `头脑风暴 设计登录页` → `text.slice(4)` = ` 设计登录页` → prompt = `/superpowers:brainstorming 设计登录页` ✅
- `头脑风暴`（无空格后缀）→ 不命中 `+ ' '` → 走 else → prompt = `头脑风暴` ✅
- `头脑风暴xxx` → 不命中 → prompt = `头脑风暴xxx` ✅
- `/foo:bar` → else 分支 → prompt = ` /foo:bar`（原保护）✅

- [ ] **Step 5: Commit**

```bash
git add src/commands/index.ts
git commit -m "feat(claude): 头脑风暴 prefix triggers /superpowers:brainstorming skill"
```

---

### Task 2: help 帮助文本

**Files:**
- Modify: `src/commands/help.ts:14`

- [ ] **Step 1: 改写帮助条目**

把 `src/commands/help.ts` 第 14 行：

```ts
• \`/superpowers:brainstorming <任意问题>\` — 与 Claude 开始头脑风暴
```

替换为：

```ts
• \`头脑风暴 <任意问题>\` — 与 Claude 开始头脑风暴（superpowers brainstorming）
```

- [ ] **Step 2: 编译验证**

Run: `npm run build`
Expected: tsc 无报错（模板字符串内反引号已用 `\`` 转义，注意保持）。

- [ ] **Step 3: Commit**

```bash
git add src/commands/help.ts
git commit -m "docs(help): advertise 头脑风暴 trigger instead of raw slash form"
```

---

### Task 3: 文档同步 — CLAUDE.md 与 setup-guide.md

**Files:**
- Modify: `CLAUDE.md`（「Slash 前缀转义」设计说明条目）
- Modify: `docs/setup-guide.md`（命令列表，参考第 36/73 行附近现有命令说明格式）

- [ ] **Step 1: CLAUDE.md 补例外说明**

定位 `CLAUDE.md` 中以 `**Slash 前缀转义**` 开头的设计说明条目，在其末尾追加一句：

```
；例外：以 `头脑风暴 `（带空格）开头的消息会被替换为 `/superpowers:brainstorming` 并保持斜杠开头，从而真正触发该 skill（不前置空格）
```

- [ ] **Step 2: setup-guide.md 命令列表加入头脑风暴**

在 `docs/setup-guide.md` 介绍 bot 命令/透传用法处（命令清单），加入一行说明：

```
- `头脑风暴 <任意问题>`：以 `/superpowers:brainstorming` 进入头脑风暴流程（@bot 透传 Claude）
```

（放在与 `gemini` / 透传 Claude 说明相邻的位置，保持风格一致。）

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/setup-guide.md
git commit -m "docs: document 头脑风暴 trigger in CLAUDE.md and setup-guide"
```

---

## Self-Review

**Spec coverage：**
- 触发与替换（spec §1）→ Task 1 ✅
- 行为矩阵（spec §2）→ Task 1 Step 4 ✅
- help.ts（spec §3）→ Task 2 ✅
- CLAUDE.md + setup-guide.md（spec §4）→ Task 3 ✅
- 验证 = npm run build（spec 验证节）→ 每 Task 编译步 ✅

**Placeholder 扫描：** 无 TBD/TODO；每个改动均给出确切代码与路径。

**类型一致性：** `prompt` 由 `const` → `let`，下游只读；`BRAINSTORM_TRIGGER`/`BRAINSTORM_SKILL` 在 Task 1 Step 1 定义、Step 2 使用，名称一致。

**范围之外（YAGNI）：** 不做多触发词映射表；不做全角空格/大小写归一化。
