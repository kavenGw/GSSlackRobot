# 单实例守护 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 启动时检测是否已有实例在运行，重复启动时警告并退出。

**Architecture:** 使用 TCP 端口占位检测。启动时尝试监听固定端口，`EADDRINUSE` 则说明已有实例。

**Tech Stack:** Node.js `net` 模块

---

### Task 1: 创建 singleton 模块

**Files:**
- Create: `src/utils/singleton.ts`

**Step 1: 创建 `src/utils/singleton.ts`**

```typescript
import net from 'node:net';
import { log } from './logger.js';

const DEFAULT_PORT = 19280;

export function ensureSingleInstance(port = Number(process.env.SINGLETON_PORT) || DEFAULT_PORT): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(port, '127.0.0.1', () => resolve());
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        log.error(`检测到已有实例在运行 (port ${port})，退出`);
        process.exit(1);
      }
      reject(err);
    });
  });
}
```

**Step 2: Commit**

```bash
git add src/utils/singleton.ts
git commit -m "feat: add singleton guard module"
```

---

### Task 2: 集成到 app.ts

**Files:**
- Modify: `src/app.ts:1-18`（在 loadConfig 之前调用）

**Step 1: 修改 `src/app.ts`**

在文件顶部 import 之后、`loadConfig()` 之前，添加：

```typescript
import { ensureSingleInstance } from './utils/singleton.js';

await ensureSingleInstance();
```

完整的 app.ts 顶部应为：

```typescript
import { App } from '@slack/bolt';
import { loadConfig, EnvValidationError } from './config/index.js';
import { registerCommands } from './commands/index.js';
import { log } from './utils/logger.js';
import { startWebhookServer } from './webhooks/server.js';
import { scheduleDailyReport } from './scheduler/daily-report.js';
import { scheduleJenkinsCronJobs } from './scheduler/jenkins-cron.js';
import { ensureSingleInstance } from './utils/singleton.js';

await ensureSingleInstance();

let config;
// ... rest unchanged
```

**Step 2: Commit**

```bash
git add src/app.ts
git commit -m "feat: integrate singleton guard at startup"
```

---

### Task 3: 更新文档

**Files:**
- Modify: `CLAUDE.md`
- Modify: `.env.example`（如存在）

**Step 1: 在 CLAUDE.md 可选参数表中添加 `SINGLETON_PORT`**

在可选参数表末尾添加一行：

| `SINGLETON_PORT` | `19280` | 单实例检测端口 |

**Step 2: 在 `.env.example` 中添加（如存在）**

```
SINGLETON_PORT=19280
```

**Step 3: Commit**

```bash
git add CLAUDE.md .env.example
git commit -m "docs: add SINGLETON_PORT config"
```
