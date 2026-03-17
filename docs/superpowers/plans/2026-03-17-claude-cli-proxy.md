# Claude CLI 代理支持实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 askClaude() 子进程支持通过 `CLAUDE_HTTP_PROXY` / `CLAUDE_HTTPS_PROXY` 环境变量配置 HTTP 代理。

**Architecture:** 在 ClaudeConfig 增加两个可选字段，loadConfig() 读取环境变量，askClaude() 将其作为 `http_proxy` / `https_proxy` 注入子进程 env。

**Tech Stack:** TypeScript, Node.js child_process

**Spec:** `docs/superpowers/specs/2026-03-17-claude-cli-proxy-design.md`

---

### Task 1: ClaudeConfig 增加代理字段

**Files:**
- Modify: `src/config/schema.ts:6-12`

- [ ] **Step 1: 在 ClaudeConfig 接口增加 httpProxy 和 httpsProxy 字段**

```typescript
export interface ClaudeConfig {
  command: string;
  anthropicBaseUrl?: string;
  anthropicAuthToken?: string;
  projectDir?: string;
  dangerouslySkipPermissions?: boolean;
  httpProxy?: string;
  httpsProxy?: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/config/schema.ts
git commit -m "feat: ClaudeConfig 增加 httpProxy/httpsProxy 字段"
```

---

### Task 2: loadConfig() 读取代理环境变量

**Files:**
- Modify: `src/config/index.ts:40-46`

- [ ] **Step 1: 在 claude 配置块末尾增加两行**

在 `dangerouslySkipPermissions` 之后添加：

```typescript
httpProxy: process.env.CLAUDE_HTTP_PROXY,
httpsProxy: process.env.CLAUDE_HTTPS_PROXY,
```

- [ ] **Step 2: Commit**

```bash
git add src/config/index.ts
git commit -m "feat: loadConfig() 读取 CLAUDE_HTTP_PROXY/CLAUDE_HTTPS_PROXY"
```

---

### Task 3: askClaude() 注入代理环境变量到子进程

**Files:**
- Modify: `src/services/claude.ts:9-14`

- [ ] **Step 1: 在现有 ANTHROPIC_AUTH_TOKEN 注入之后添加代理注入**

在第 14 行 `}` 之后添加：

```typescript
if (cfg.httpProxy) {
  env.http_proxy = cfg.httpProxy;
}
if (cfg.httpsProxy) {
  env.https_proxy = cfg.httpsProxy;
}
```

- [ ] **Step 2: 编译验证**

Run: `npm run build`
Expected: 编译成功，无错误

- [ ] **Step 3: Commit**

```bash
git add src/services/claude.ts
git commit -m "feat: askClaude() 注入 http_proxy/https_proxy 到子进程"
```

---

### Task 4: 文档同步

**Files:**
- Modify: `.env.example`
- Modify: `CLAUDE.md`
- Check: `docs/setup-guide.md`

- [ ] **Step 1: .env.example 增加代理配置示例**

在 `ANTHROPIC_AUTH_TOKEN` 行之后、`# GitLab Webhook` 注释之前添加：

```bash
# Claude CLI 代理
# CLAUDE_HTTP_PROXY=http://proxy.example.com:8080
# CLAUDE_HTTPS_PROXY=http://proxy.example.com:8080
```

- [ ] **Step 2: CLAUDE.md 可选参数表增加两行**

在 `ANTHROPIC_AUTH_TOKEN` 行之后添加：

```markdown
| `CLAUDE_HTTP_PROXY` | 无 | Claude CLI HTTP 代理地址 |
| `CLAUDE_HTTPS_PROXY` | 无 | Claude CLI HTTPS 代理地址 |
```

- [ ] **Step 3: 核查 docs/setup-guide.md**

检查 Claude 配置章节，该文件环境变量部分仅示例了必填的 Slack 和 Claude 基础配置，未列出 Claude 可选参数明细，无需修改。

- [ ] **Step 4: Commit**

```bash
git add .env.example CLAUDE.md
git commit -m "docs: 同步代理配置到 .env.example 和 CLAUDE.md"
```
