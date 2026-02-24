# GSSlackRobot 简化重构 实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 Slack Bot 从多服务集成助手简化为 Slack → Claude Code 透传代理，移除 GitLab/Jenkins/Webhook 相关代码。

**Architecture:** 保留现有 Bolt Socket Mode 架构，命令路由简化为 help + 默认 Claude 透传。配置层只保留 Slack + Claude 参数。

**Tech Stack:** TypeScript, @slack/bolt, Node.js child_process (Claude CLI)

---

### Task 1: 删除不需要的源文件

**Files:**
- Delete: `src/commands/issue.ts`
- Delete: `src/commands/brainstorm.ts`
- Delete: `src/commands/version-status.ts`
- Delete: `src/commands/jenkins.ts`
- Delete: `src/commands/daily-report.ts`
- Delete: `src/services/gitlab.ts`
- Delete: `src/services/jenkins.ts`
- Delete: `src/webhooks/server.ts`
- Delete: `src/webhooks/gitlab.ts`

**Step 1: 删除命令文件**

```bash
rm src/commands/issue.ts src/commands/brainstorm.ts src/commands/version-status.ts src/commands/jenkins.ts src/commands/daily-report.ts
```

**Step 2: 删除服务文件**

```bash
rm src/services/gitlab.ts src/services/jenkins.ts
```

**Step 3: 删除 webhook 文件**

```bash
rm src/webhooks/server.ts src/webhooks/gitlab.ts
rmdir src/webhooks
```

**Step 4: Commit**

```bash
git add -A && git commit -m "refactor: remove GitLab, Jenkins, Webhook source files"
```

---

### Task 2: 简化配置类型定义

**Files:**
- Modify: `src/config/schema.ts`

**Step 1: 重写 schema.ts**

只保留 SlackConfig + ClaudeConfig，移除 GitLabConfig、JenkinsConfig、GitLabNotifyConfig：

```typescript
export interface SlackConfig {
  botToken: string;
  appToken: string;
}

export interface ClaudeConfig {
  command: string;
  timeoutMs: number;
  anthropicBaseUrl?: string;
  anthropicAuthToken?: string;
  projectDir?: string;
  dangerouslySkipPermissions?: boolean;
}

export interface AppConfig {
  slack: SlackConfig;
  claude: ClaudeConfig;
}
```

**Step 2: Commit**

```bash
git add src/config/schema.ts && git commit -m "refactor: simplify AppConfig to Slack + Claude only"
```

---

### Task 3: 简化配置加载

**Files:**
- Modify: `src/config/index.ts`

**Step 1: 重写 loadConfig()**

移除 gitlab、jenkins 配置加载，移除 `parseJenkinsJobs` 函数。只保留 `required`, `optional`, `optionalInt`, `optionalBool` 工具函数 + slack/claude 配置：

```typescript
import type { AppConfig } from './schema.js';
import { validateConfig, validateRequiredEnvVars, EnvValidationError } from './env-validator.js';

export { EnvValidationError } from './env-validator.js';

let config: AppConfig;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optional(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

function optionalInt(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) throw new Error(`Invalid integer for ${name}: ${value}`);
  return parsed;
}

function optionalBool(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

export function loadConfig(): AppConfig {
  validateRequiredEnvVars();

  config = {
    slack: {
      botToken: required('SLACK_BOT_TOKEN'),
      appToken: required('SLACK_APP_TOKEN'),
    },
    claude: {
      command: optional('CLAUDE_COMMAND', 'claude'),
      timeoutMs: optionalInt('CLAUDE_TIMEOUT_MS', 300000),
      anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL,
      anthropicAuthToken: process.env.ANTHROPIC_AUTH_TOKEN,
      projectDir: process.env.CLAUDE_PROJECT_DIR,
      dangerouslySkipPermissions: optionalBool('CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS', false),
    },
  };

  validateConfig(config);

  return config;
}

export function getConfig(): AppConfig {
  if (!config) throw new Error('Config not loaded. Call loadConfig() first.');
  return config;
}
```

**Step 2: Commit**

```bash
git add src/config/index.ts && git commit -m "refactor: simplify loadConfig to Slack + Claude only"
```

---

### Task 4: 简化环境变量验证

**Files:**
- Modify: `src/config/env-validator.ts`

**Step 1: 重写验证逻辑**

移除 GitLab/Jenkins/Notify 验证。必填变量只剩 `SLACK_BOT_TOKEN` 和 `SLACK_APP_TOKEN`。保留 `EnvValidationError` 类和辅助函数不变：

```typescript
import type { AppConfig } from './schema.js';

export interface ValidationError {
  param: string;
  message: string;
  value?: string;
}

export class EnvValidationError extends Error {
  public readonly errors: ValidationError[];

  constructor(errors: ValidationError[]) {
    const message = formatValidationErrors(errors);
    super(message);
    this.name = 'EnvValidationError';
    this.errors = errors;
  }
}

function formatValidationErrors(errors: ValidationError[]): string {
  const lines = [
    '',
    '╔══════════════════════════════════════════════════════════════════╗',
    '║          ENVIRONMENT VALIDATION FAILED                          ║',
    '╚══════════════════════════════════════════════════════════════════╝',
    '',
    `Found ${errors.length} validation error(s):`,
    '',
  ];

  errors.forEach((err, index) => {
    lines.push(`  ${index + 1}. [${err.param}]`);
    lines.push(`     ${err.message}`);
    if (err.value !== undefined) {
      const displayValue = err.value.length > 50
        ? err.value.substring(0, 47) + '...'
        : err.value;
      lines.push(`     Current value: "${displayValue}"`);
    }
    lines.push('');
  });

  lines.push('Please check your environment variables and try again.');
  lines.push('');

  return lines.join('\n');
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function isValidToken(token: string): boolean {
  if (typeof token !== 'string' || token.trim().length === 0) return false;

  const placeholders = [
    'your_token_here',
    'your-token-here',
    'xxx',
    'placeholder',
    '<token>',
    '${',
    'TODO',
    'FIXME',
  ];

  const lowerToken = token.toLowerCase();
  return !placeholders.some(p => lowerToken.includes(p.toLowerCase()));
}

export function validateConfig(config: AppConfig): void {
  const errors: ValidationError[] = [];

  // Slack validation
  if (!config.slack.botToken || !config.slack.botToken.trim()) {
    errors.push({
      param: 'SLACK_BOT_TOKEN',
      message: 'Slack Bot Token is required and cannot be empty',
    });
  } else if (!config.slack.botToken.startsWith('xoxb-')) {
    errors.push({
      param: 'SLACK_BOT_TOKEN',
      message: 'Slack Bot Token should start with "xoxb-"',
      value: config.slack.botToken.substring(0, 10) + '***',
    });
  }

  if (!config.slack.appToken || !config.slack.appToken.trim()) {
    errors.push({
      param: 'SLACK_APP_TOKEN',
      message: 'Slack App Token is required and cannot be empty',
    });
  } else if (!config.slack.appToken.startsWith('xapp-')) {
    errors.push({
      param: 'SLACK_APP_TOKEN',
      message: 'Slack App Token should start with "xapp-"',
      value: config.slack.appToken.substring(0, 10) + '***',
    });
  }

  // Claude validation (optional but if provided, must be valid)
  if (config.claude.anthropicBaseUrl !== undefined &&
      config.claude.anthropicBaseUrl !== '' &&
      !isValidUrl(config.claude.anthropicBaseUrl)) {
    errors.push({
      param: 'ANTHROPIC_BASE_URL',
      message: 'Anthropic Base URL must be a valid HTTP/HTTPS URL if provided',
      value: config.claude.anthropicBaseUrl,
    });
  }

  if (config.claude.anthropicAuthToken !== undefined &&
      config.claude.anthropicAuthToken !== '' &&
      !isValidToken(config.claude.anthropicAuthToken)) {
    errors.push({
      param: 'ANTHROPIC_AUTH_TOKEN',
      message: 'Anthropic Auth Token cannot be a placeholder value if provided',
    });
  }

  if (config.claude.timeoutMs <= 0) {
    errors.push({
      param: 'CLAUDE_TIMEOUT_MS',
      message: 'Claude timeout must be a positive number (milliseconds)',
      value: String(config.claude.timeoutMs),
    });
  }

  if (config.claude.timeoutMs > 3600000) {
    errors.push({
      param: 'CLAUDE_TIMEOUT_MS',
      message: 'Claude timeout cannot exceed 1 hour (3600000ms)',
      value: String(config.claude.timeoutMs),
    });
  }

  if (errors.length > 0) {
    throw new EnvValidationError(errors);
  }
}

export function validateRequiredEnvVars(): void {
  const requiredVars = [
    'SLACK_BOT_TOKEN',
    'SLACK_APP_TOKEN',
  ];

  const missing = requiredVars.filter(v => !process.env[v]);

  if (missing.length > 0) {
    const errors: ValidationError[] = missing.map(param => ({
      param,
      message: `Required environment variable is not set`,
    }));
    throw new EnvValidationError(errors);
  }
}
```

**Step 2: Commit**

```bash
git add src/config/env-validator.ts && git commit -m "refactor: simplify env validation to Slack + Claude only"
```

---

### Task 5: 简化命令路由 + 内联 Claude 透传

**Files:**
- Modify: `src/commands/index.ts`
- Modify: `src/commands/help.ts`

**Step 1: 重写 commands/index.ts**

移除所有旧命令导入，只保留 help。默认分支改为 Claude 透传（复用 brainstorm.ts 的流式逻辑，内联到此文件）：

```typescript
import type { App, SayFn } from '@slack/bolt';
import type { WebClient } from '@slack/web-api';
import { handleHelp } from './help.js';
import { brainstorm } from '../services/claude.js';
import { splitToBlocks } from '../utils/message.js';

export interface CommandContext {
  text: string;
  channel: string;
  threadTs: string;
  say: SayFn;
  client: WebClient;
}

const THROTTLE_MS = 500;
const MAX_MSG_LEN = 3800;

async function handleClaude({ text, channel, threadTs, client }: CommandContext) {
  const initial = await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: '思考中...',
  });
  const msgTs = initial.ts!;

  let content = '';
  let lastUpdate = 0;
  let segmentIndex = 0;

  const flush = async (final = false) => {
    const now = Date.now();
    if (!final && now - lastUpdate < THROTTLE_MS) return;
    lastUpdate = now;

    if (content.length <= MAX_MSG_LEN) {
      await client.chat.update({
        channel,
        ts: msgTs,
        text: content || '思考中...',
      });
    } else {
      const chunks = splitToBlocks(content);
      await client.chat.update({
        channel,
        ts: msgTs,
        text: chunks[0],
      });
      for (let i = segmentIndex + 1; i < chunks.length; i++) {
        await client.chat.postMessage({
          channel,
          thread_ts: threadTs,
          text: chunks[i],
        });
        segmentIndex = i;
      }
    }
  };

  try {
    for await (const chunk of brainstorm(text)) {
      content += chunk;
      await flush();
    }
    await flush(true);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await client.chat.update({
      channel,
      ts: msgTs,
      text: content ? `${content}\n\n_（出错: ${errMsg}）_` : `出错: ${errMsg}`,
    });
  }
}

export function registerCommands(app: App) {
  app.event('app_mention', async ({ event, say, client }) => {
    const text = event.text.replace(/<@[A-Z0-9]+>\s*/g, '').trim();
    const threadTs = event.thread_ts ?? event.ts;

    const ctx: CommandContext = { text, channel: event.channel, threadTs, say, client };

    try {
      if (/^help$/i.test(text)) {
        await handleHelp(ctx);
      } else {
        await handleClaude(ctx);
      }
    } catch (err) {
      console.error('Command error:', err);
      await say({
        text: `执行出错: ${err instanceof Error ? err.message : String(err)}`,
        thread_ts: threadTs,
      });
    }
  });
}
```

**Step 2: 更新 help.ts**

```typescript
import type { CommandContext } from './index.js';

const HELP_TEXT = `*GSSlackRobot 可用指令:*

• \`help\` — 显示此帮助信息
• \`<任意问题>\` — 直接与 Claude AI 对话`;

export async function handleHelp({ say, threadTs }: CommandContext) {
  await say({ text: HELP_TEXT, thread_ts: threadTs });
}
```

**Step 3: Commit**

```bash
git add src/commands/index.ts src/commands/help.ts && git commit -m "refactor: simplify routing to help + Claude passthrough"
```

---

### Task 6: 简化 utils/message.ts

**Files:**
- Modify: `src/utils/message.ts`

**Step 1: 移除 formatIssueList**

删除 `IssueItem` 接口、`formatIssueList` 函数和 `import type { Block, KnownBlock }`。只保留 `truncate` 和 `splitToBlocks`：

```typescript
const MAX_BLOCK_TEXT = 3000;

export function truncate(text: string, maxLen: number = MAX_BLOCK_TEXT): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

export function splitToBlocks(text: string, maxLen: number = MAX_BLOCK_TEXT): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf('\n', maxLen);
    if (splitAt < maxLen * 0.5) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  return chunks;
}
```

**Step 2: Commit**

```bash
git add src/utils/message.ts && git commit -m "refactor: remove formatIssueList from message utils"
```

---

### Task 7: 简化 app.ts 入口

**Files:**
- Modify: `src/app.ts`

**Step 1: 移除 Webhook 启动**

```typescript
import { App } from '@slack/bolt';
import { loadConfig, EnvValidationError } from './config/index.js';
import { registerCommands } from './commands/index.js';

let config;
try {
  config = loadConfig();
} catch (error) {
  if (error instanceof EnvValidationError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

const app = new App({
  token: config.slack.botToken,
  appToken: config.slack.appToken,
  socketMode: true,
});

registerCommands(app);

await app.start();
console.log('GSSlackRobot is running');
```

**Step 2: Commit**

```bash
git add src/app.ts && git commit -m "refactor: remove webhook server startup from app entry"
```

---

### Task 8: 清理依赖和 .env

**Files:**
- Modify: `package.json`
- Modify: `.env`

**Step 1: 卸载 express 相关依赖**

```bash
npm uninstall express @types/express
```

**Step 2: 清理 .env 文件**

移除 GitLab、Jenkins、GitLab Notify 配置段，只保留 Slack + Claude：

```
# Slack Configuration (required)
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...

# Claude Configuration
CLAUDE_COMMAND=claude
CLAUDE_TIMEOUT_MS=300000
CLAUDE_PROJECT_DIR=D:\Git\GSTetris
CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS=true
ANTHROPIC_BASE_URL=http://47.108.66.3:3001/api
ANTHROPIC_AUTH_TOKEN=cr_...
```

**Step 3: Commit**

```bash
git add package.json package-lock.json .env && git commit -m "refactor: remove express dependency, clean up .env"
```

---

### Task 9: 更新 CLAUDE.md 项目文档

**Files:**
- Modify: `CLAUDE.md`

**Step 1: 更新 CLAUDE.md**

更新所有受影响的章节：项目概述、项目结构、环境变量表、关键设计注意事项。移除 GitLab/Jenkins/Webhook 相关描述。

关键变更：
- 项目概述：`集成本机 Claude Code CLI` （移除 GitLab、Jenkins）
- 项目结构：只列出简化后的文件树
- 常用命令：不变
- 编码规范：不变
- 环境变量：只保留 Slack + Claude 参数表
- 关键设计注意事项：移除 Jenkins/GitLab/Webhook 条目

**Step 2: Commit**

```bash
git add CLAUDE.md && git commit -m "docs: update CLAUDE.md to reflect simplified architecture"
```

---

### Task 10: 构建验证

**Step 1: 编译 TypeScript**

```bash
npm run build
```

Expected: 无报错，`dist/` 目录生成成功

**Step 2: 检查编译输出**

确认 `dist/` 目录不包含已删除的文件（no leftover .js files for deleted sources）：

```bash
ls dist/commands/ dist/services/ dist/webhooks/ 2>/dev/null
```

Expected: `dist/webhooks/` 不存在，`dist/commands/` 只有 `index.js` 和 `help.js`，`dist/services/` 只有 `claude.js`

**Step 3: 若有旧编译残留，清理并重新编译**

```bash
rm -rf dist && npm run build
```

**Step 4: Commit (如有变更)**

```bash
git add -A && git commit -m "build: clean rebuild after simplification"
```
