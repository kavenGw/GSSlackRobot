# GSSlackRobot 简化设计

## 目标

将 Slack Bot 从多服务集成助手简化为 Slack → Claude Code 透传代理。移除 GitLab、Jenkins、Webhook 相关所有代码和配置。

## 简化后功能

| 输入 | 行为 |
|------|------|
| `@bot help` | 显示帮助信息 |
| `@bot <任意文字>` | 透传给 Claude CLI，流式返回结果到 Slack thread |

## 项目结构（简化后）

```
src/
├── app.ts                    # 入口：加载配置 → 启动 Bolt
├── config/
│   ├── schema.ts             # SlackConfig + ClaudeConfig
│   ├── index.ts              # loadConfig() Slack + Claude 参数
│   └── env-validator.ts      # 验证 Slack + Claude 参数
├── commands/
│   ├── index.ts              # help → handleHelp，其余 → Claude 透传
│   └── help.ts               # 帮助信息
├── services/
│   └── claude.ts             # Claude CLI 子进程（保持不变）
└── utils/
    └── message.ts            # truncate + splitToBlocks
```

## 删除清单

### 文件删除
- `src/commands/issue.ts`
- `src/commands/brainstorm.ts`
- `src/commands/version-status.ts`
- `src/commands/jenkins.ts`
- `src/commands/daily-report.ts`
- `src/services/gitlab.ts`
- `src/services/jenkins.ts`
- `src/webhooks/server.ts`
- `src/webhooks/gitlab.ts`

### 依赖删除
- `express` + `@types/express`

## 配置简化

### 必填环境变量（2 个）
| 变量 | 说明 |
|------|------|
| `SLACK_BOT_TOKEN` | 必须以 `xoxb-` 开头 |
| `SLACK_APP_TOKEN` | 必须以 `xapp-` 开头 |

### 可选环境变量
| 变量 | 默认值 | 说明 |
|------|--------|------|
| `CLAUDE_COMMAND` | `claude` | Claude CLI 命令路径 |
| `CLAUDE_TIMEOUT_MS` | `300000` | 超时（正整数, 上限 3600000ms）|
| `ANTHROPIC_BASE_URL` | 无 | Anthropic API Base URL |
| `ANTHROPIC_AUTH_TOKEN` | 无 | Anthropic Auth Token |
| `CLAUDE_PROJECT_DIR` | 无 | Claude 项目目录 |
| `CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS` | `false` | 跳过权限检查 |

### 移除的配置
- 所有 `GITLAB_*` 变量
- 所有 `JENKINS_*` 变量
- 所有 `GITLAB_NOTIFY_*` 变量

## 命令路由

```typescript
// commands/index.ts 简化后逻辑
if (/^help$/i.test(text)) → handleHelp()
else → Claude 透传（复用现有流式输出 + 节流 + 分段逻辑）
```

## 不变的部分

- `services/claude.ts`：AsyncGenerator 流式输出保持不变
- `utils/message.ts`：`truncate()` 和 `splitToBlocks()` 保持不变（删除 `formatIssueList`）
- 流式输出到 Slack 的节流更新机制（500ms 间隔）
- 消息分段发送机制（3800 字符上限）
