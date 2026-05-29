# 硬锁定 Claude 透传为 opus4.8 + high

**日期**: 2026-05-29
**状态**: 设计已确认，待写实现计划

## 背景与目标

当前 Claude 透传支持运行时切换模型与 effort：Slack `model`/`effort` 命令、对话前缀 `opus/sonnet/haiku`、持久化到 `data/settings.json`。`src/services/claude.ts` 的 `MODEL_MAP` 把 `opus` 映射到旧版 `claude-opus-4-6`。

目标：把 Claude 透传**硬锁定**为最新的 `claude-opus-4-8` + effort `high`，不可经任何途径切换。彻底移除整套模型/effort 切换机制（含只读显示），消除随之而来的全部无用代码。

## 非目标

- 不引入任何环境变量来配置锁定值（明确要求固定，遵循 YAGNI）。
- 不保留任何形式的 `model`/`effort` 命令或只读显示。
- 不改动 Gemini、GitLab、Jenkins、Webhook 等无关链路。

## 设计

### 1. `src/services/claude.ts`（核心）
- `askClaude` 签名去掉 `model?` 与 `effort?` 参数，保留 `(text, images?, sessionId?, resume?)`。
- `options.model` 内联硬编码为 `'claude-opus-4-8'`，`options.effort` 内联硬编码为 `'high'`。
- 删除 `MODEL_MAP` 与 `resolveModel()`——锁定单一模型后映射表无意义。

锁定值仅存在于 `askClaude` 内部，不对外导出。

### 2. 删除整套切换机制
- 删除文件 `src/services/settings.ts`（内容 100% 为 model/effort 的加载、持久化、校验、切换）。
- 删除文件 `src/commands/model.ts`（`handleModel` / `handleEffort`）。
- 删除文件 `data/settings.json`。
- `src/app.ts`：移除 `import { loadSettings } from './services/settings.js'` 及 `await loadSettings();`。

### 3. `src/commands/index.ts`（路由与透传）
- 移除 import：`handleModel`、`handleEffort`；`isValidModel`、`isValidEffort`、`getClaudeSettings`；`type ClaudeModel`、`EffortLevel`。
- 删除 `parseModelPrefix()` 函数。`handleClaude` 直接用原始 `text` 作为 prompt 源（保留 `/` 开头前缀转义的空格处理）。
- 删除路由分支 `else if (/^model\b/i.test(text))` 与 `else if (/^effort\b/i.test(text))`。
- `COMMAND_ALIASES` 移除 `m: 'model'`。
- `askClaude(...)` 调用去掉 `model`、`effort` 实参。
- `saveConversationLog` 的 `model` / `effort` 字段固定写入 `'opus'` / `'high'`（保留日志可读性，不再依赖 settings）。

### 4. `src/commands/help.ts`（帮助文案）
删除以下 4 行：
- `model` (`m`) — 查看/切换 Claude 模型和 effort
- `model <opus|sonnet|haiku> [max|high|medium|low]` — 切换默认模型
- `effort <max|high|medium|low>` — 切换 effort 级别
- 对话前缀 `opus <问题>` — 单次指定模型（可选加 effort）

### 5. 文档同步（项目「三处同步」规范）
- `CLAUDE.md`：
  - 「命令路由」段删除 model/effort/单次前缀说明。
  - 删除 `data/settings.json` 运行时设置相关说明（含「运行时设置」「关键设计注意事项」中的对应条目）。
  - 项目结构树删除 `model.ts`、`settings.ts` 条目。
  - 「命令变更同步」检查清单据实更新（model/effort 命令已不存在）。
- `docs/setup-guide.md`：删除命令列表中的 model/effort/前缀条目。
- `.env.example`：模型/effort 走 settings.json 而非 env，预计无改动；实现时确认无遗留引用。

## 数据流（改动后）

```
@bot <任意文字>
  → registerCommands: 命中 help/commands/gitlab/gemini 命令则分流
  → 否则 handleClaude(text)
      → prompt = text（/ 前缀转义）
      → askClaude(prompt, images, sessionId, resume)
          → options.model = 'claude-opus-4-8'
          → options.effort = 'high'
          → query(...) 流式输出
```

## 影响与兼容性

- 行为变更：用户 @bot 发送 `model` / `effort` / `opus ...` 不再被识别为命令，将作为普通问题透传给 Claude（由 opus4.8/high 应答）。这是预期结果。
- 已存在的 `data/settings.json` 删除后，旧的用户偏好失效——符合硬锁定意图。
- 无数据库/外部接口变更。

## 验证

- `npm run build`：tsc 通过，确认无残留 `settings.js` / `model.js` import 或 `ClaudeModel` / `EffortLevel` 类型引用。
- Slack 端到端：
  - @bot 普通问题 → 由 opus4.8/high 应答（可在 conversation log 中确认 model/effort 字段）。
  - @bot `model` / `effort` → 作为普通问题透传，不报「无效模型」之类命令响应。
  - @bot `help` → 帮助文本中不再出现 model/effort/前缀条目。

## 风险

- 低。改动集中在透传链路与文档，删除的是自包含的切换子系统，无跨模块隐式依赖（已 grep 确认仅 `app.ts` / `commands/index.ts` / `services/claude.ts` / `commands/model.ts` / `services/settings.ts` 引用相关符号）。
- `saveConversationLog` 的 `model` / `effort` 均为可选 `string`（`src/utils/logger.ts:20-21`），字面量 `'opus'` / `'high'` 可直接传入，无类型约束问题。
