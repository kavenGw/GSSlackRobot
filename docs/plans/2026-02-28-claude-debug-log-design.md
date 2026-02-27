# Claude 详细日志设计

## 目标

dev.bat 运行时记录 Claude CLI 完整原始输出和交互详情，方便排查问题。生产环境不受影响。

## 触发机制

- `dev.bat` 设置 `set DEBUG_CLAUDE=true`
- 代码通过 `process.env.DEBUG_CLAUDE === 'true'` 判断
- 生产环境不设该变量，零开销

## 日志内容

### Claude CLI 原始输出日志（新增）

- 文件：`logs/YYYY-MM-DD_HH-MM-SS_claude_raw.log`
- 头部：调用时间、命令参数、sessionId、是否 resume
- 正文：完整 stdout JSON Lines 原始数据 + stderr 输出

### 对话日志增强（修改现有）

`saveConversationLog` 增加字段：
- 完整命令参数列表
- model、effort
- 退出码

## 数据流

```
Claude CLI spawn → stdout chunks
  ├── 正常流程：解析 JSON → yield content → Slack
  └── debug 模式：同时收集原始 chunks → 结束后写入 logs/*_claude_raw.log
```

## 改动文件

| 文件 | 改动 |
|------|------|
| `dev.bat` | 加 `set DEBUG_CLAUDE=true` |
| `src/utils/logger.ts` | 新增 `isDebug()` + `saveRawLog()` + `saveConversationLog` 增加参数 |
| `src/services/claude.ts` | debug 模式收集原始 stdout，结束后保存 |
| `.gitignore` | 确认 `logs/` 已忽略 |
