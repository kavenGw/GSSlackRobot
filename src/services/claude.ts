import { spawn } from 'node:child_process';
import { getConfig } from '../config/index.js';

export async function* brainstorm(prompt: string): AsyncGenerator<string> {
  const cfg = getConfig().claude;
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  if (cfg.anthropicBaseUrl) {
    env.ANTHROPIC_BASE_URL = cfg.anthropicBaseUrl;
  }
  if (cfg.anthropicAuthToken) {
    env.ANTHROPIC_AUTH_TOKEN = cfg.anthropicAuthToken;
  }

  // Build command arguments
  const args = ['-p', prompt, '--output-format', 'stream-json'];
  if (cfg.dangerouslySkipPermissions) {
    args.push('--dangerously-skip-permissions');
  }

  // Build spawn options
  const spawnOptions: { stdio: ['ignore', 'pipe', 'pipe']; env: Record<string, string>; cwd?: string } = {
    stdio: ['ignore', 'pipe', 'pipe'],
    env,
  };
  if (cfg.projectDir) {
    spawnOptions.cwd = cfg.projectDir;
  }

  const proc = spawn(cfg.command, args, spawnOptions);

  const timeout = setTimeout(() => {
    proc.kill('SIGTERM');
  }, cfg.timeoutMs);

  try {
    let buffer = '';
    for await (const chunk of proc.stdout) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop()!;

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          // stream-json 输出: {"type":"assistant","content":[{"type":"text","text":"..."}]}
          // 逐行可能是 {"type":"content_block_delta","delta":{"type":"text_delta","text":"..."}}
          if (data.type === 'content_block_delta' && data.delta?.text) {
            yield data.delta.text;
          } else if (data.type === 'result' && data.result) {
            yield data.result;
          }
        } catch {
          // 非 JSON 行，跳过
        }
      }
    }

    // 处理残余
    if (buffer.trim()) {
      try {
        const data = JSON.parse(buffer);
        if (data.type === 'content_block_delta' && data.delta?.text) {
          yield data.delta.text;
        } else if (data.type === 'result' && data.result) {
          yield data.result;
        }
      } catch {
        // 忽略
      }
    }
  } finally {
    clearTimeout(timeout);
    if (!proc.killed) proc.kill('SIGTERM');
  }
}
