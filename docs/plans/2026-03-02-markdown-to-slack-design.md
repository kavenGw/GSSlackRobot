# Markdown → Slack mrkdwn 转换层设计

## 问题

Claude CLI 返回标准 Markdown 格式文本，直接发送到 Slack 后无法正确渲染（`##` 标题、`**` 粗体、`|---|` 表格等原样显示）。Slack 使用自己的 mrkdwn 格式。

## 方案

在 `src/utils/message.ts` 中新增 `markdownToSlack()` 转换函数，零依赖，将标准 Markdown 转换为 Slack mrkdwn。

## 转换规则

| Markdown 语法 | Slack mrkdwn | 处理方式 |
|---|---|---|
| `` ``` `` 代码块 | `` ``` `` 代码块 | 保留，去掉语言标记 |
| `` `code` `` 行内代码 | `` `code` `` | 保留不变 |
| `## 标题` / `### 标题` | `*标题*` 粗体 | 去 `#` 号，转粗体 |
| `**粗体**` | `*粗体*` | 双星→单星 |
| `*斜体*` / `_斜体_` | `_斜体_` | 统一用下划线 |
| `~~删除线~~` | `~删除线~` | 双波浪→单波浪 |
| `[text](url)` | `<url\|text>` | 转 Slack 链接语法 |
| `![alt](url)` | `<url\|alt>` | 图片→链接 |
| `- item` / `* item` | `• item` | 无序列表用圆点 |
| `1. item` | `1. item` | 有序列表保留 |
| `> quote` | `> quote` | 引用保留不变 |
| `---` 水平线 | `───────` | Unicode 线条 |
| Markdown 表格 | 等宽代码块 | 解析→对齐→包裹在代码块中 |

## 核心逻辑

1. 提取代码块（``` ... ```）替换为占位符
2. 提取行内代码（`...`）替换为占位符
3. 在非代码区域执行转换规则
4. 恢复占位符

## 表格转换

Markdown 表格 → 解析行列 → 计算各列最大宽度 → 空格填充对齐 → `─` 分隔线 → 包裹在代码块中。

## 调用点

所有发往 Slack 的消息统一走转换，在 `splitToBlocks()` 之前调用：
- `src/commands/index.ts` — Claude 流式输出
- `src/commands/gemini.ts` — Gemini 回复
- 其他消息发送点

转换函数幂等：已有 Slack mrkdwn 语法不被二次破坏。

## 应用范围

所有消息统一转换（包括 help、webhook 等）。
