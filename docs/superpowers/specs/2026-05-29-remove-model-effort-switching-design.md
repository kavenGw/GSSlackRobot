# 移除 Claude 模型/effort 切换，跟随本机默认

**日期**: 2026-05-29
**状态**: 设计已确认，待写实现计划

## 背景与目标

当前 Claude 透传支持运行时切换模型与 effort：Slack `model`/`effort` 命令、对话前缀 `opus/sonnet/haiku`、持久化到 `data/settings.json`，并在 `src/services/claude.ts` 用 `MODEL_MAP` 把短名映射成完整 ID 后显式设置 `options.model` / `options.effort`。

目标：**彻底移除整套模型/effort 切换机制**，并让 `askClaude` **不再显式设置** model 与 effort——交由 Claude Agent SDK 回退到**本机 Claude Code 默认值**。bot 实际使用的模型/effort 由本地 CLI 配置单点决定，随本地配置自然变化。

## 非目标

- 不在代码里硬编码任何模型 ID 或 effort 级别。
- 不保留任何 `model`/`effort` 命令、前缀或只读显示。
- 不引入环境变量来配置 model/effort。
- 不改动 Gemini、GitLab、Jenkins、Webhook 等无关链路。

## 设计

### 1. `src/services/claude.ts`（核心）
- `askClaude` 签名去掉 `model?` 与 `effort?` 参数，保留 `(text, images?, sessionId?, resume?)`。
- 构造 `options` 时**不再设置** `model` 与 `effort` 字段（两者留空）→ SDK 回退本机默认。
- 删除 `MODEL_MAP` 与 `resolveModel()`——不再做任何模型映射。
- 其余 `options`（env / cwd / sessionId / resume / permissionMode 等）保持不变。

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
- `saveConversationLog` 调用**省略** `model` / `effort` 字段（代码侧不再知道实际值，二者本就是可选字段，日志中相应行自动不渲染）。

### 4. `src/commands/help.ts`（帮助文案）
删除以下 4 行：
- `model` (`m`) — 查看/切换 Claude 模型和 effort
- `model <opus|sonnet|haiku> [max|high|medium|low]` — 切换默认模型
- `effort <max|high|medium|low>` — 切换 effort 级别
- 对话前缀 `opus <问题>` — 单次指定模型（可选加 effort）

### 5. 文档同步（项目「三处同步」规范）
- `CLAUDE.md`：
  - 「命令路由」段删除 model/effort/单次前缀说明。
  - 删除 `data/settings.json` 运行时设置相关说明（含「运行时设置」「关键设计注意事项」对应条目）；可补一句「model/effort 跟随本机 Claude Code 默认」。
  - 项目结构树删除 `model.ts`、`settings.ts` 条目。
  - 「命令变更同步」检查清单据实更新。
- `docs/setup-guide.md`：删除命令列表中的 model/effort/前缀条目。
- `.env.example`：模型/effort 走 settings.json 而非 env，预计无改动；实现时确认无遗留引用。

## 数据流（改动后）

```
@bot <任意文字>
  → registerCommands: 命中 help/commands/gitlab/gemini 命令则分流
  → 否则 handleClaude(text)
      → prompt = text（/ 前缀转义）
      → askClaude(prompt, images, sessionId, resume)
          → options 不含 model / effort
          → SDK 使用本机 Claude Code 默认 model + effort
          → query(...) 流式输出
```

## 影响与兼容性

- 行为变更：bot 使用的 model / effort 完全由本机 Claude Code 默认配置决定；本地默认变更（`/model` 命令、配置更新、CLI 升级）会直接影响 bot，且代码侧无提示。这是本方案的预期取舍——以「单点跟随本地」换取零切换代码。
- 用户 @bot 发送 `model` / `effort` / `opus ...` 不再被识别为命令，将作为普通问题透传给 Claude。
- 已存在的 `data/settings.json` 删除后旧偏好失效。
- 无数据库/外部接口变更。

## 验证

- `npm run build`：tsc 通过，确认无残留 `settings.js` / `model.js` import 或 `ClaudeModel` / `EffortLevel` 类型引用，无 `MODEL_MAP` / `resolveModel` 残留。
- Slack 端到端：
  - @bot 普通问题 → 正常应答（实际模型为本机默认）。
  - @bot `model` / `effort` → 作为普通问题透传，不再出现命令响应。
  - @bot `help` → 帮助文本中不再出现 model/effort/前缀条目。

## 风险

- 低。改动集中在透传链路与文档，删除的是自包含的切换子系统，无跨模块隐式依赖（已 grep 确认仅 `app.ts` / `commands/index.ts` / `services/claude.ts` / `commands/model.ts` / `services/settings.ts` 引用相关符号）。
- 需留意：本机默认 model/effort 不再受 bot 代码约束，运维上需知晓「改本地默认即改 bot 行为」。
