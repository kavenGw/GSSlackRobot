# Codex 接入

首次在 Slack thread 中 @bot 时，以完整单词 `codex` 开头选择 Codex，否则选择 Claude。忽略前导空白和大小写，仅首次选择时移除前缀。例如 `@bot codex 头脑风暴 新功能`，后续 `@bot 继续` 仍由 Codex 处理。后续出现的 `codex` 只是提示词，不会切换平台。已有 Claude 会话继续绑定 Claude。

`help`、`commands`、GitLab 和 Gemini 等内置命令保留原处理逻辑；它们作为首次 @bot 消息也会确定平台。`终止` 取消当前线程任务。同一线程只执行一个 AI 请求，不同频道的线程分别管理。

## 运行配置

通过 `@openai/codex-sdk` 启动本地 Codex，使用运行机器人的系统用户已有登录与 Codex 配置。首次部署先以该用户运行 `codex login`。SDK 不显式设置 API key 或模型。工作目录沿用 `CLAUDE_PROJECT_DIR`，未设置时使用机器人工作目录。

Codex 保留本机 sandbox 配置，approval policy 设置为 `never`，因为 Slack 没有交互审批界面。新建及恢复会话均设置 `skipGitRepoCheck: true`，允许在非 Git 工作目录中执行头脑风暴等请求，避免启动时出现 `Not inside a trusted directory`。`CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS` 仅控制 Claude，不覆盖 Codex 权限。

会话平台和 SDK 会话 ID 存在 `data/agent-sessions.json`，按频道和 Slack thread 区分。写入排队并通过临时文件替换，避免同时写入破坏内容；读取损坏文件会阻止启动，避免丢失绑定后换错平台。旧 `data/known-sessions.json` 作为 Claude 迁移来源保留读取。重启后还需要保留本机 Codex 会话目录，才能继续上下文。

## 快捷词与输出

| 快捷词 | Codex 提示词 |
| --- | --- |
| 头脑风暴 | `$grilling` |
| bug修复 | `$diagnosing-bugs` |
| 归纳总结 | `$distill-rules` |
| 压缩 | 请求总结目标、进展、决策和待办 |

对应技能需安装在 Codex 可发现的位置。`压缩` 是生成摘要，不执行 Claude `/compact` 或强制裁剪 Codex 的会话历史。

图片复用 Slack 下载和 PNG 转换流程，写入独立临时目录传给 Codex，结束或失败后删除。Codex 每完成一条 assistant message 就更新 Slack；工具输出和推理事件不作为聊天回复。完成及错误提醒、分段消息和对话日志复用现有流程，日志标记实际平台。

接入依据：[官方 Codex SDK 文档](https://developers.openai.com/codex/sdk/)。
