# Claude CLI 代理支持设计

## 背景

用户需要在特定网络环境下通过 HTTP 代理访问 Claude API。当前 `askClaude()` 通过 `spawn` 调用 Claude CLI 子进程，需要将代理配置通过环境变量传递给子进程。

## 设计

### 新增环境变量

| 变量 | 说明 | 必填 |
|------|------|------|
| `CLAUDE_HTTP_PROXY` | Claude CLI 使用的 HTTP 代理地址 | 否 |
| `CLAUDE_HTTPS_PROXY` | Claude CLI 使用的 HTTPS 代理地址 | 否 |

格式示例：`http://proxy.example.com:8080`、`socks5://proxy:1080`

### 变更文件

#### 1. `src/config/schema.ts` — ClaudeConfig 增加字段

```typescript
export interface ClaudeConfig {
  command: string;
  anthropicBaseUrl?: string;
  anthropicAuthToken?: string;
  projectDir?: string;
  dangerouslySkipPermissions?: boolean;
  httpProxy?: string;   // 新增
  httpsProxy?: string;  // 新增
}
```

#### 2. `src/config/index.ts` — loadConfig() 读取环境变量

```typescript
claude: {
  // ...existing fields...
  httpProxy: process.env.CLAUDE_HTTP_PROXY,
  httpsProxy: process.env.CLAUDE_HTTPS_PROXY,
}
```

#### 3. `src/services/claude.ts` — askClaude() 注入子进程环境变量

在构建 `env` 对象时，将 `httpProxy` / `httpsProxy` 映射为 `http_proxy` / `https_proxy`：

```typescript
if (cfg.httpProxy) {
  env.http_proxy = cfg.httpProxy;
}
if (cfg.httpsProxy) {
  env.https_proxy = cfg.httpsProxy;
}
```

#### 4. 文档同步

- `.env.example` — 增加 `CLAUDE_HTTP_PROXY` / `CLAUDE_HTTPS_PROXY` 注释示例
- `CLAUDE.md` — 可选参数表增加两行
- `docs/setup-guide.md` — Claude 配置章节无需变更（该文件未列出 Claude 可选参数明细）

### 不涉及的变更

- 无需验证：代理地址格式多样（http/socks5/带认证等），不做格式校验
- 不影响其他服务（GitLab、Jenkins、Gemini、Slack）
- 不影响 `env-validator.ts`
