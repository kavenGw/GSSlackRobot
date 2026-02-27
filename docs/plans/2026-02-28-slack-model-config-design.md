# Slack 中配置 Claude 模型和 Effort

## 概述

支持在 Slack 中动态切换 Claude 模型（opus/sonnet/haiku）和 effort 级别（max/high/medium/low），无需重启服务。

## 命令交互

| 用法 | 说明 |
|------|------|
| `model` | 查看当前默认模型和 effort |
| `model <opus\|sonnet\|haiku> [effort]` | 切换全局默认模型，可选同时设 effort |
| `effort <max\|high\|medium\|low>` | 只切换全局 effort |

### 单次前缀指定

对话文本前加模型名，本次使用指定配置，不影响全局默认：
- `@bot opus 帮我分析架构` — 本次用 opus
- `@bot haiku low 快速翻译` — 本次用 haiku + low effort

### 模型映射

| 别名 | CLI `--model` 值 |
|------|-----------------|
| `opus` | `opus` |
| `sonnet` | `sonnet` |
| `haiku` | `haiku` |

### Effort 级别

| 级别 | 说明 | 限制 |
|------|------|------|
| `max` | 最强推理，不限 token | 仅 opus 可用 |
| `high` | 默认级别，复杂推理 | 所有模型 |
| `medium` | 平衡速度和质量 | 所有模型 |
| `low` | 最快最省，简单任务 | 所有模型 |

## 数据存储

文件：`data/settings.json`

```json
{
  "claude": {
    "model": "sonnet",
    "effort": "high"
  }
}
```

启动时加载到内存，修改时同步写入文件。文件不存在则用默认值（sonnet + high）。

## 架构变更

### 新增文件

**`src/services/settings.ts`**
- `loadSettings()` — 启动时从文件加载
- `getSettings()` — 获取当前设置
- `updateClaudeModel(model, effort?)` — 更新模型/effort 并持久化
- `updateClaudeEffort(effort)` — 仅更新 effort 并持久化

**`src/commands/model.ts`**
- `handleModel(text, say)` — 处理 model 命令
- `handleEffort(text, say)` — 处理 effort 命令

### 修改文件

**`src/services/claude.ts`**
- `askClaude()` 新增可选参数 `model` 和 `effort`
- 构建 CLI 命令时追加 `--model` 和 `--effort` 参数

**`src/commands/index.ts`**
- 新增 `model`/`effort` 命令路由和别名
- `handleClaude` 开头增加前缀解析：检测消息是否以模型名开头，提取模型和 effort

**`src/commands/help.ts`**
- 帮助文本新增 model/effort 命令说明

**`src/config/schema.ts`**
- ClaudeConfig 可选新增 `CLAUDE_MODEL` 环境变量作为初始默认模型

**`.gitignore`**
- 添加 `data/` 目录

**`CLAUDE.md` / `README.md`**
- 同步命令路由和环境变量文档

## 错误处理

- `max` effort + 非 opus 模型 → 回复错误提示
- 无效模型/effort 名 → 回复可用选项列表
- settings.json 读写失败 → 日志记录，回退到内存默认值

## 数据流

1. **全局命令**：`model opus high` → 解析 → 校验 → 更新 settings → 写入文件 + 内存 → 回复确认
2. **对话请求**：消息 → 前缀解析（如有）→ 合并默认设置 → `askClaude(prompt, sessionId, resume, model, effort)` → Claude CLI `--model opus --effort high`
