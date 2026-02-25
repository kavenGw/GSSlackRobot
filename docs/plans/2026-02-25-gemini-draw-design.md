# Gemini Draw 画图命令设计

## 概述

新增 `gemini-draw` 命令，通过 Google Gemini 3 Pro Image 模型生成图片，返回图片+文字描述到 Slack。

## 数据流

```
用户: @bot gemini-draw 一只猫
  → commands/index.ts 路由匹配 /^gemini-draw\b/
  → commands/gemini-draw.ts 提取 prompt
  → services/gemini.ts drawGemini(prompt)
    → Gemini API (model: gemini-3-pro-image-preview, responseModalities: [TEXT, IMAGE])
    → 返回 { text?: string, imageBuffer?: Buffer }
  → Slack: files.uploadV2 上传图片 + postMessage/update 发文字
```

## 新增/修改文件

| 文件 | 变更 |
|------|------|
| `src/services/gemini.ts` | 新增 `drawGemini(prompt)` 函数 |
| `src/commands/gemini-draw.ts` | 新建，画图命令 handler |
| `src/commands/index.ts` | 路由 + import + 别名 `draw: 'gemini-draw'` |
| `src/config/schema.ts` | `GeminiConfig` 新增 `imageModel` 字段 |
| `src/config/index.ts` | 加载 `GEMINI_IMAGE_MODEL` 环境变量 |

## 核心逻辑

### service: drawGemini(prompt)

- 使用 `getGenerativeModel({ model: imageModel })`
- 设置 `generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }`
- 遍历 response parts，收集 text 和 inlineData (base64 → Buffer)
- 单次请求，不维护对话历史

### command: handleGeminiDraw(ctx)

- 提取 prompt（去掉 `gemini-draw` 前缀）
- 发送"绘图中..."占位消息
- 调用 `drawGemini(prompt)`
- `files.uploadV2` 上传图片到线程
- 有文字则 `chat.update` 更新占位消息；无文字则更新为"图片已生成"
- 错误时更新占位消息显示错误信息

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `GEMINI_IMAGE_MODEL` | `gemini-3-pro-image-preview` | 画图模型名 |

复用 `GEMINI_API_KEY`，无需新增 key。
