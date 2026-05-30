# 设计：「头脑风暴」前缀触发 brainstorming skill

- 日期：2026-05-30
- 状态：已批准，待实现
- 涉及文件：`src/commands/index.ts`、`src/commands/help.ts`、`CLAUDE.md`、`docs/setup-guide.md`

## 背景与目标

用户希望在 Slack 里 @bot 发送以 `头脑风暴 ` 开头的消息时，机器人把开头的 `头脑风暴`
替换为 `/superpowers:brainstorming`，并让 Claude Agent SDK **真正调用**该 skill，
从而用中文口令进入头脑风暴流程。

例：`头脑风暴 设计一个登录页` → 透传 `/superpowers:brainstorming 设计一个登录页`。

## 关键约束：绕过斜杠转义

`handleClaude`（`src/commands/index.ts:114`）现有逻辑：

```ts
const prompt = text.startsWith('/') ? ` ${text}` : text;
```

该转义会给 `/` 开头的文本**前置一个空格**，目的是阻止 SDK 把任意 `/foo:bar` 当 skill
调用（见 CLAUDE.md「Slash 前缀转义」）。本需求恰好相反——要真正触发 skill，因此
`头脑风暴` 替换后必须保持斜杠开头、**不被转义**。

## 设计

### 1. 触发与替换（`src/commands/index.ts` · `handleClaude`）

在原转义行处改为：

```ts
const BRAINSTORM_TRIGGER = '头脑风暴';
const BRAINSTORM_SKILL = '/superpowers:brainstorming';

let prompt: string;
if (text.startsWith(BRAINSTORM_TRIGGER + ' ')) {
  // 主动请求脑暴 skill：替换前缀并保持斜杠开头，跳过转义以真正触发
  prompt = BRAINSTORM_SKILL + text.slice(BRAINSTORM_TRIGGER.length);
} else {
  prompt = text.startsWith('/') ? ` ${text}` : text;
}
```

`BRAINSTORM_TRIGGER` / `BRAINSTORM_SKILL` 两个常量放在模块顶层（与
`THROTTLE_MS` 等同级），便于复用与日后扩展。

### 2. 行为矩阵

| 输入 | 透传 prompt | 效果 |
|------|------------|------|
| `头脑风暴 设计登录页` | `/superpowers:brainstorming 设计登录页` | 触发 skill ✅ |
| `头脑风暴`（单独） | `头脑风暴` | 普通对话，不触发 |
| `头脑风暴xxx`（无空格） | `头脑风暴xxx` | 普通对话，不触发 |
| `/foo:bar`（用户手打） | ` /foo:bar` | 原有转义保护，不误触发 |

- 仅匹配开头第一处，且 `头脑风暴` 后必须紧跟一个空格（"首词 + 后续内容"）。
- `text` 已在 `registerCommands` 经 `resolveAlias` 处理；`头脑风暴` 不在
  `COMMAND_ALIASES`、也不匹配任何命令正则，会正常落到 `handleClaude`。

### 3. help.ts

将现有第 14 行（`/superpowers:brainstorming <任意问题>`，因转义对用户其实不可用）
改为用户实际可用的中文形式：

```
• `头脑风暴 <任意问题>` — 与 Claude 开始头脑风暴（superpowers brainstorming）
```

### 4. 文档同步

- `CLAUDE.md`「Slash 前缀转义」设计说明：补一句 `头脑风暴 ` 前缀例外——
  会被替换为 `/superpowers:brainstorming` 并真正触发 skill。
- `docs/setup-guide.md` 命令列表：加入「头脑风暴」用法说明。

## 验证

`npm run build`（tsc strict 通过）即视为完成；无单测套件，必要时 Slack 端到端手测。

## 范围之外（YAGNI）

- 不做多触发词的通用映射表，仅此一个触发词。
- 不在代码层做大小写/全角空格归一化（中文触发词无大小写问题）。
