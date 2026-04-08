# GSSlackRobot 技术参考文档

本文档提供 GSSlackRobot 的完整技术参考，包括系统架构、API 接口、数据结构和实现细节。

## 目录

- [系统概述](#系统概述)
- [架构设计](#架构设计)
- [项目结构](#项目结构)
- [配置系统](#配置系统)
- [命令系统](#命令系统)
- [服务层](#服务层)
- [Webhook 系统](#webhook-系统)
- [工具函数](#工具函数)
- [环境变量参考](#环境变量参考)
- [API 参考](#api-参考)

---

## 系统概述

### 简介

GSSlackRobot 是一个基于 TypeScript 的 Slack Bot 个人助手，集成了以下外部系统：

- **Slack** - 通过 Socket Mode 接收和响应消息
- **GitLab** - 创建 Issue、查询里程碑状态
- **Jenkins** - 触发构建任务、获取构建结果
- **Claude Code CLI** - AI 驱动的智能分析

### 核心特性

| 特性 | 描述 |
|------|------|
| Socket Mode | 无需暴露公网地址，通过 WebSocket 连接 Slack |
| 流式输出 | Claude 响应实时显示，无需等待完整回复 |
| 多源数据整合 | 每日简报整合 Jenkins + GitLab + Claude 分析 |
| 事件驱动 | 支持 GitLab Webhook 自动推送通知 |

### 技术栈

```
TypeScript 5.6 + ES2022 Modules
├── @slack/bolt 4.1.0      # Slack Socket Mode
├── express 4.21.0         # HTTP Webhook 服务
└── tsx (开发热重载)
```

---

## 架构设计

### 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        GSSlackRobot 进程                         │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────┐    ┌──────────────────────┐          │
│  │   Bolt App           │    │   Express Server     │          │
│  │   (Socket Mode)      │    │   (:4567)            │          │
│  │                      │    │                      │          │
│  │  ┌────────────────┐  │    │  ┌────────────────┐  │          │
│  │  │ app_mention    │  │    │  │ POST /gitlab   │  │          │
│  │  │ 事件监听       │  │    │  │ Webhook 接收   │  │          │
│  │  └───────┬────────┘  │    │  └───────┬────────┘  │          │
│  └──────────┼───────────┘    └──────────┼───────────┘          │
│             │                           │                       │
│             ▼                           ▼                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    命令路由层                              │  │
│  │  commands/index.ts (正则匹配)                             │  │
│  │                                                           │  │
│  │  /^help$/                    → help.ts                   │  │
│  │  /^创建一个单子：/            → issue.ts                  │  │
│  │  /^头脑风暴 /                 → brainstorm.ts            │  │
│  │  /^当前版本状态：/            → version-status.ts        │  │
│  │  /^jenkins /                 → jenkins.ts                │  │
│  │  /^每日简报/                  → daily-report.ts          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                      服务层                                │  │
│  │                                                           │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      │  │
│  │  │ gitlab.ts   │  │ jenkins.ts  │  │ claude.ts   │      │  │
│  │  │ REST API v4 │  │ Remote API  │  │ CLI 子进程   │      │  │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘      │  │
│  └─────────┼────────────────┼────────────────┼──────────────┘  │
└────────────┼────────────────┼────────────────┼──────────────────┘
             │                │                │
             ▼                ▼                ▼
      ┌──────────┐     ┌──────────┐     ┌──────────┐
      │ GitLab   │     │ Jenkins  │     │ Claude   │
      │ Server   │     │ Server   │     │ Code CLI │
      └──────────┘     └──────────┘     └──────────┘
```

### 数据流

1. **命令处理流**
   ```
   用户 @bot → Slack WebSocket → Bolt app_mention → 命令路由 → 服务调用 → Slack 回复
   ```

2. **Webhook 处理流**
   ```
   GitLab 事件 → HTTP POST :4567 → 签名验证 → 事件格式化 → Slack 通知
   ```

3. **Claude 流式输出流**
   ```
   命令触发 → spawn 子进程 → stdout 流 → JSON 解析 → yield 文本 → 节流更新
   ```

---

## 项目结构

```
src/
├── app.ts                    # 应用入口
│   └── 职责: 加载配置 → 初始化 Bolt → 注册命令 → 启动服务
│
├── config/
│   ├── schema.ts             # TypeScript 类型定义
│   │   └── 接口: AppConfig, SlackConfig, GitLabConfig, etc.
│   └── index.ts              # 配置加载逻辑
│       └── 函数: loadConfig(), getConfig(), required(), optional()
│
├── commands/
│   ├── index.ts              # 命令路由器
│   │   └── 职责: 正则匹配 → 分发到处理器
│   ├── help.ts               # 帮助命令
│   ├── issue.ts              # GitLab Issue 创建
│   ├── brainstorm.ts         # Claude AI 头脑风暴
│   ├── version-status.ts     # 里程碑状态查询
│   ├── jenkins.ts            # Jenkins 构建触发
│   └── daily-report.ts       # 每日简报 (NEW)
│       └── 职责: Jenkins + GitLab + Claude 三步流水线
│
├── services/
│   ├── gitlab.ts             # GitLab REST API 封装
│   │   └── 函数: createIssue(), getMilestoneIssues(), getActiveMilestones()
│   ├── jenkins.ts            # Jenkins Remote API 封装
│   │   └── 函数: triggerBuild(), triggerBuildAndWait(), getLastBuildOutput()
│   └── claude.ts             # Claude CLI 子进程封装
│       └── 函数: brainstorm() AsyncGenerator
│
├── webhooks/
│   ├── server.ts             # Express HTTP 服务
│   │   └── 职责: 启动服务器、路由 webhook
│   └── gitlab.ts             # GitLab 事件处理
│       └── 职责: 验证签名、格式化事件、发送通知
│
└── utils/
    └── message.ts            # 消息工具函数
        └── 函数: truncate(), splitToBlocks(), formatIssueList()
```

---

## 配置系统

### 配置接口定义

```typescript
// src/config/schema.ts

export interface AppConfig {
  slack: SlackConfig;
  gitlab: GitLabConfig;
  jenkins: JenkinsConfig;
  claude: ClaudeConfig;
  webhook: WebhookConfig;
}

export interface SlackConfig {
  botToken: string;      // xoxb-... Bot User OAuth Token
  appToken: string;      // xapp-... App-Level Token (Socket Mode)
}

export interface GitLabConfig {
  url: string;           // GitLab 实例 URL
  token: string;         // Private Access Token
  defaultProject: string;  // 项目路径 (如 "namespace/project")
}

export interface JenkinsConfig {
  url: string;           // Jenkins 实例 URL
  user: string;          // 用户名
  token: string;         // API Token
  jobs: Record<string, string>;  // 别名 → 路径映射
}

export interface ClaudeConfig {
  command: string;       // CLI 命令名或路径
  timeoutMs: number;     // 超时时间 (毫秒)
}

export interface WebhookConfig {
  port: number;
  gitlabSecret: string;
  notifyChannel: string;
  events: {
    push: boolean;
    merge_request: boolean;
    pipeline: boolean;
    issue: boolean;
    note: boolean;
  };
}
```

### 配置加载逻辑

```typescript
// src/config/index.ts

let config: AppConfig | undefined;

export function loadConfig(): AppConfig {
  config = {
    slack: {
      botToken: required('SLACK_BOT_TOKEN'),
      appToken: required('SLACK_APP_TOKEN'),
    },
    gitlab: {
      url: optional('GITLAB_URL', 'https://gitlab.example.com'),
      token: required('GITLAB_TOKEN'),
      defaultProject: optional('GITLAB_DEFAULT_PROJECT', 'namespace/project'),
    },
    jenkins: {
      url: optional('JENKINS_URL', 'https://jenkins.example.com'),
      user: required('JENKINS_USER'),
      token: required('JENKINS_TOKEN'),
      jobs: parseJenkinsJobs(),
    },
    claude: {},
    webhook: {
      port: optionalInt('WEBHOOK_PORT', 4567),
      gitlabSecret: optional('GITLAB_WEBHOOK_SECRET', ''),
      notifyChannel: optional('WEBHOOK_NOTIFY_CHANNEL', '#dev-notifications'),
      events: {
        push: optionalBool('WEBHOOK_EVENT_PUSH', true),
        merge_request: optionalBool('WEBHOOK_EVENT_MR', true),
        pipeline: optionalBool('WEBHOOK_EVENT_PIPELINE', true),
        issue: optionalBool('WEBHOOK_EVENT_ISSUE', true),
        note: optionalBool('WEBHOOK_EVENT_NOTE', false),
      },
    },
  };
  return config;
}

export function getConfig(): AppConfig {
  if (!config) throw new Error('Config not loaded');
  return config;
}
```

---

## 命令系统

### 命令路由器

```typescript
// src/commands/index.ts

export interface CommandContext {
  event: AppMentionEvent;
  client: WebClient;
  say: SayFn;
  match: RegExpMatchArray;
}

interface CommandDef {
  pattern: RegExp;
  handler: (ctx: CommandContext) => Promise<void>;
}

const commands: CommandDef[] = [
  { pattern: /^help$/i, handler: handleHelp },
  { pattern: /^创建一个单子[：:]\s*(.+)$/s, handler: handleIssue },
  { pattern: /^头脑风暴\s+(.+)$/s, handler: handleBrainstorm },
  { pattern: /^当前版本状态[：:]\s*(.+)$/s, handler: handleVersionStatus },
  { pattern: /^jenkins\s+(\w+)$/i, handler: handleJenkins },
  { pattern: /^每日简报(?:[：:]\s*(.+))?$/s, handler: handleDailyReport },
];

export function registerCommands(app: App): void {
  app.event('app_mention', async ({ event, client, say }) => {
    const text = event.text.replace(/<@[A-Z0-9]+>\s*/gi, '').trim();

    for (const cmd of commands) {
      const match = text.match(cmd.pattern);
      if (match) {
        await cmd.handler({ event, client, say, match });
        return;
      }
    }

    await say({ text: '未识别的指令，输入 help 查看帮助', thread_ts: event.ts });
  });
}
```

### 命令列表

| 命令 | 正则模式 | 文件 | 描述 |
|------|----------|------|------|
| help | `/^help$/i` | help.ts | 显示帮助信息 |
| 创建一个单子 | `/^创建一个单子[：:]\s*(.+)$/s` | issue.ts | 创建 GitLab Issue |
| 头脑风暴 | `/^头脑风暴\s+(.+)$/s` | brainstorm.ts | Claude AI 问答 |
| 当前版本状态 | `/^当前版本状态[：:]\s*(.+)$/s` | version-status.ts | 查询里程碑状态 |
| jenkins | `/^jenkins\s+(\w+)$/i` | jenkins.ts | 触发 Jenkins 构建 |
| 每日简报 | `/^每日简报(?:[：:]\s*(.+))?$/s` | daily-report.ts | 生成每日简报 |

### 每日简报命令详解

每日简报是最复杂的命令，整合了三个外部服务：

```typescript
// src/commands/daily-report.ts

export async function handleDailyReport(ctx: CommandContext): Promise<void> {
  const { event, client, match } = ctx;
  const milestoneParam = match[1]?.trim();

  // 1. 发送占位消息
  const result = await client.chat.postMessage({
    channel: event.channel,
    thread_ts: event.ts,
    text: '正在生成每日简报...',
  });
  const msgTs = result.ts!;

  // 2. 步骤1: 获取 Jenkins 数据
  await updateMessage('⚙️ 正在获取运营数据...');
  let playfabData: string;
  try {
    const buildResult = await triggerBuildAndWait('GetPlayfabData');
    playfabData = buildResult.consoleOutput.slice(-8000);
  } catch {
    const fallback = await getLastBuildOutput('GetPlayfabData');
    playfabData = fallback.consoleOutput.slice(-8000);
  }

  // 3. 步骤2: 获取 GitLab 版本状态
  await updateMessage('🔍 正在获取版本状态...');
  let versionStatus = '';
  const milestone = milestoneParam || (await getActiveMilestones())[0]?.title;
  if (milestone) {
    const issues = await getMilestoneIssues(milestone);
    versionStatus = formatVersionStatus(issues, milestone);
  }

  // 4. 步骤3: Claude 分析
  await updateMessage('🧠 正在分析数据...');
  const prompt = buildAnalysisPrompt(playfabData, versionStatus);

  // 5. 流式输出
  for await (const chunk of brainstorm(prompt)) {
    content += chunk;
    await flush();
  }
  await flush(true);
}
```

---

## 服务层

### GitLab 服务

```typescript
// src/services/gitlab.ts

const api = (path: string, init?: RequestInit) => {
  const cfg = getConfig().gitlab;
  return fetch(`${cfg.url}/api/v4${path}`, {
    ...init,
    headers: {
      'PRIVATE-TOKEN': cfg.token,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
};

// 创建 Issue
export async function createIssue(title: string, description?: string): Promise<GitLabIssue> {
  const cfg = getConfig().gitlab;
  const projectPath = encodeURIComponent(cfg.defaultProject);
  const res = await api(`/projects/${projectPath}/issues`, {
    method: 'POST',
    body: JSON.stringify({ title, description }),
  });
  return res.json();
}

// 查询里程碑下的 Issues
export async function getMilestoneIssues(milestoneTitle: string): Promise<MilestoneIssues> {
  const cfg = getConfig().gitlab;
  const projectPath = encodeURIComponent(cfg.defaultProject);

  // 1. 查找里程碑
  const msRes = await api(`/projects/${projectPath}/milestones?title=${encodeURIComponent(milestoneTitle)}`);
  const milestones = await msRes.json();

  // 2. 查询 Issues
  const issuesRes = await api(`/projects/${projectPath}/issues?milestone=${encodeURIComponent(milestoneTitle)}&per_page=100`);
  const issues: GitLabIssue[] = await issuesRes.json();

  return {
    milestone: milestones[0],
    closed: issues.filter(i => i.state === 'closed'),
    opened: issues.filter(i => i.state === 'opened'),
  };
}

// 获取活跃里程碑
export async function getActiveMilestones(): Promise<GitLabMilestone[]> {
  const cfg = getConfig().gitlab;
  const projectPath = encodeURIComponent(cfg.defaultProject);
  const res = await api(`/projects/${projectPath}/milestones?state=active`);
  return res.json();
}
```

### Jenkins 服务

```typescript
// src/services/jenkins.ts

const authHeader = () => {
  const cfg = getConfig().jenkins;
  return 'Basic ' + Buffer.from(`${cfg.user}:${cfg.token}`).toString('base64');
};

// 触发构建
export async function triggerBuild(jobAlias: string): Promise<string> {
  const cfg = getConfig().jenkins;
  const jobPath = cfg.jobs[jobAlias];
  if (!jobPath) throw new Error(`Unknown job alias: ${jobAlias}`);

  const res = await fetch(`${cfg.url}/job/${jobPath.replace(/\//g, '/job/')}/build`, {
    method: 'POST',
    headers: { Authorization: authHeader() },
  });

  return res.headers.get('Location') || '';
}

// 触发构建并等待完成
export async function triggerBuildAndWait(jobAlias: string): Promise<BuildResult> {
  const queueUrl = await triggerBuild(jobAlias);
  const queueId = queueUrl.match(/\/queue\/item\/(\d+)/)?.[1];
  if (!queueId) throw new Error('Failed to get queue ID');

  // 等待构建开始 (最多 120 秒)
  let buildNumber: number | undefined;
  for (let i = 0; i < 60; i++) {
    const res = await fetch(`${cfg.url}/queue/item/${queueId}/api/json`, {
      headers: { Authorization: authHeader() },
    });
    const data = await res.json();
    if (data.executable?.number) {
      buildNumber = data.executable.number;
      break;
    }
    await sleep(2000);
  }
  if (!buildNumber) throw new Error('Build did not start');

  // 等待构建完成 (最多 15 分钟)
  const jobPath = cfg.jobs[jobAlias].replace(/\//g, '/job/');
  for (let i = 0; i < 180; i++) {
    const res = await fetch(`${cfg.url}/job/${jobPath}/${buildNumber}/api/json`, {
      headers: { Authorization: authHeader() },
    });
    const data = await res.json();
    if (!data.building) {
      const consoleRes = await fetch(`${cfg.url}/job/${jobPath}/${buildNumber}/consoleText`, {
        headers: { Authorization: authHeader() },
      });
      return {
        buildNumber,
        result: data.result,
        duration: data.duration,
        consoleOutput: await consoleRes.text(),
      };
    }
    await sleep(5000);
  }
  throw new Error('Build timeout');
}

// 获取上次构建输出
export async function getLastBuildOutput(jobAlias: string): Promise<BuildResult> {
  const cfg = getConfig().jenkins;
  const jobPath = cfg.jobs[jobAlias].replace(/\//g, '/job/');

  const infoRes = await fetch(`${cfg.url}/job/${jobPath}/lastBuild/api/json`, {
    headers: { Authorization: authHeader() },
  });
  const info = await infoRes.json();

  const consoleRes = await fetch(`${cfg.url}/job/${jobPath}/lastBuild/consoleText`, {
    headers: { Authorization: authHeader() },
  });

  return {
    buildNumber: info.number,
    result: info.result,
    duration: info.duration,
    consoleOutput: await consoleRes.text(),
  };
}
```

### Claude 服务

```typescript
// src/services/claude.ts

export async function* brainstorm(prompt: string): AsyncGenerator<string> {
  const cfg = getConfig().claude;

  // 启动子进程
  const proc = spawn(cfg.command, ['-p', prompt, '--output-format', 'stream-json'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // 超时保护
  const timeout = setTimeout(() => {
    proc.kill('SIGTERM');
  }, cfg.timeoutMs);

  try {
    let buffer = '';

    // 流式读取 stdout
    for await (const chunk of proc.stdout) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop()!;  // 保留不完整的行

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);

          // 处理两种 JSON 格式
          if (data.type === 'content_block_delta' && data.delta?.text) {
            yield data.delta.text;
          } else if (data.type === 'result' && data.result) {
            yield data.result;
          }
        } catch {
          // 非 JSON 行，忽略
        }
      }
    }

    // 处理剩余 buffer
    if (buffer.trim()) {
      try {
        const data = JSON.parse(buffer);
        if (data.type === 'content_block_delta' && data.delta?.text) {
          yield data.delta.text;
        } else if (data.type === 'result' && data.result) {
          yield data.result;
        }
      } catch {}
    }
  } finally {
    clearTimeout(timeout);
    if (!proc.killed) proc.kill('SIGTERM');
  }
}
```

---

## Webhook 系统

### Express 服务器

```typescript
// src/webhooks/server.ts

export function startWebhookServer(slackApp: App): void {
  const cfg = getConfig().webhook;
  const server = express();

  server.use(express.json());

  server.post('/gitlab', async (req, res) => {
    const token = req.headers['x-gitlab-token'];
    if (cfg.gitlabSecret && token !== cfg.gitlabSecret) {
      return res.status(401).send('Unauthorized');
    }

    await handleGitLabEvent(slackApp.client, req.headers, req.body);
    res.status(200).send('OK');
  });

  server.listen(cfg.port, () => {
    console.log(`Webhook server listening on port ${cfg.port}`);
  });
}
```

### GitLab 事件处理

```typescript
// src/webhooks/gitlab.ts

const formatters: Record<string, (payload: any) => string> = {
  'Push Hook': formatPush,
  'Merge Request Hook': formatMergeRequest,
  'Pipeline Hook': formatPipeline,
  'Issue Hook': formatIssue,
  'Note Hook': formatNote,
};

export async function handleGitLabEvent(
  client: WebClient,
  headers: Record<string, string>,
  payload: any
): Promise<void> {
  const cfg = getConfig().webhook;
  const eventType = headers['x-gitlab-event'];

  const formatter = formatters[eventType];
  if (!formatter) return;

  // 检查事件开关
  const eventKey = eventType.replace(' Hook', '').toLowerCase().replace(' ', '_');
  if (!cfg.events[eventKey]) return;

  const message = formatter(payload);
  if (!message) return;

  await client.chat.postMessage({
    channel: cfg.notifyChannel,
    text: message,
  });
}

// 格式化函数示例
function formatPush(payload: any): string {
  const branch = payload.ref.replace('refs/heads/', '');
  const commits = payload.commits.slice(0, 5);
  const commitList = commits
    .map((c: any) => `• \`${c.id.slice(0, 8)}\` ${c.message.split('\n')[0]}`)
    .join('\n');

  return `*[${payload.project.name}]* ${payload.user_name} pushed to \`${branch}\`\n${commitList}`;
}
```

---

## 工具函数

### 消息处理

```typescript
// src/utils/message.ts

export const MAX_BLOCK_TEXT = 3000;

// 截断文本
export function truncate(text: string, maxLen: number = 3000): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

// 智能分段
export function splitToBlocks(text: string, maxLen: number = 3000): string[] {
  if (text.length <= maxLen) return [text];

  const blocks: string[] = [];
  let current = '';

  for (const line of text.split('\n')) {
    if (current.length + line.length + 1 > maxLen) {
      if (current) blocks.push(current);
      current = line;
    } else {
      current += (current ? '\n' : '') + line;
    }
  }
  if (current) blocks.push(current);

  return blocks;
}

// 格式化 Issue 列表 (Block Kit)
export function formatIssueList(issues: GitLabIssue[], header: string): Block[] {
  const blocks: Block[] = [
    { type: 'header', text: { type: 'plain_text', text: header } },
  ];

  for (const issue of issues) {
    const labels = issue.labels.map(l => `\`${l}\``).join(' ');
    const assignees = issue.assignees.map(a => a.name).join(', ') || '未分配';

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*<${issue.web_url}|#${issue.iid} ${issue.title}>*\n${labels}\n👤 ${assignees}`,
      },
    });
  }

  return blocks;
}
```

---

## 环境变量参考

### 必填变量

| 变量名 | 描述 | 示例 |
|--------|------|------|
| `SLACK_BOT_TOKEN` | Slack Bot User OAuth Token | `xoxb-123-456-abc` |
| `SLACK_APP_TOKEN` | Slack App-Level Token (Socket Mode) | `xapp-1-A123-456-abc` |
| `GITLAB_TOKEN` | GitLab Private Access Token | `glpat-xxxx` |
| `JENKINS_USER` | Jenkins 用户名 | `admin` |
| `JENKINS_TOKEN` | Jenkins API Token | `11xxxxx` |

### 可选变量

| 变量名 | 默认值 | 描述 |
|--------|--------|------|
| `GITLAB_URL` | `https://gitlab.example.com` | GitLab 实例 URL |
| `GITLAB_DEFAULT_PROJECT` | `namespace/project` | 默认项目路径 |
| `JENKINS_URL` | `https://jenkins.example.com` | Jenkins 实例 URL |
| `JENKINS_JOBS` | `{}` | Job 别名映射 (JSON) |
| `WEBHOOK_PORT` | `4567` | Webhook 服务端口 |
| `GITLAB_WEBHOOK_SECRET` | `''` | GitLab Webhook 密钥 |
| `WEBHOOK_NOTIFY_CHANNEL` | `#dev-notifications` | 通知频道 |
| `WEBHOOK_EVENT_PUSH` | `true` | 启用 Push 事件 |
| `WEBHOOK_EVENT_MR` | `true` | 启用 MR 事件 |
| `WEBHOOK_EVENT_PIPELINE` | `true` | 启用 Pipeline 事件 |
| `WEBHOOK_EVENT_ISSUE` | `true` | 启用 Issue 事件 |
| `WEBHOOK_EVENT_NOTE` | `false` | 启用 Note 事件 |

### JENKINS_JOBS 格式

```bash
JENKINS_JOBS='{"Patch":"MyProject/Patch_Build","Release":"MyProject/Release_Build","GetPlayfabData":"MyProject/GetPlayfabData"}'
```

---

## API 参考

### GitLab API 端点

| 操作 | 方法 | 端点 |
|------|------|------|
| 创建 Issue | POST | `/projects/{id}/issues` |
| 查询里程碑 | GET | `/projects/{id}/milestones` |
| 查询 Issues | GET | `/projects/{id}/issues` |

### Jenkins API 端点

| 操作 | 方法 | 端点 |
|------|------|------|
| 触发构建 | POST | `/job/{path}/build` |
| 查询队列 | GET | `/queue/item/{id}/api/json` |
| 查询构建 | GET | `/job/{path}/{number}/api/json` |
| 获取日志 | GET | `/job/{path}/{number}/consoleText` |

### Claude CLI 参数

```bash
claude -p "<prompt>" --output-format stream-json
```

输出格式:
```json
{"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}
{"type":"result","result":"..."}
```

---

## 相关文档

- [流程图](./flowchart.md) - 系统流程图和时序图
- [Claude 集成文档](./claude-integration.md) - Claude Code CLI 集成详解
