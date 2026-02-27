import { spawn } from 'node:child_process';
import { getConfig } from '../config/index.js';
import { log, isDebug, saveRawLog } from '../utils/logger.js';
import { getClaudeSettings } from './settings.js';

export async function* askClaude(prompt: string, sessionId?: string, resume = false, model?: string, effort?: string): AsyncGenerator<string> {
  const cfg = getConfig().claude;
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  if (cfg.anthropicBaseUrl) {
    env.ANTHROPIC_BASE_URL = cfg.anthropicBaseUrl;
  }
  if (cfg.anthropicAuthToken) {
    env.ANTHROPIC_AUTH_TOKEN = cfg.anthropicAuthToken;
  }

  // Build command arguments
  // --verbose is required when using -p with --output-format stream-json
  const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose'];
  const claudeSettings = getClaudeSettings();
  args.push('--model', model ?? claudeSettings.model);
  args.push('--effort', effort ?? claudeSettings.effort);
  if (sessionId) {
    if (resume) {
      args.push('--resume', sessionId);
    } else {
      args.push('--session-id', sessionId);
    }
  }
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

  const debug = isDebug();
  let rawStdout = '';
  let stderrOutput = '';
  proc.stderr?.on('data', (data: Buffer) => {
    const text = data.toString().trim();
    stderrOutput += text + '\n';
    log.error(text);
  });

  const exitCodePromise = new Promise<number | null>((resolve) => {
    proc.on('close', (code) => resolve(code));
  });

  const timeout = setTimeout(() => {
    proc.kill('SIGTERM');
  }, cfg.timeoutMs);

  let hasContent = false;
  try {
    let buffer = '';
    for await (const chunk of proc.stdout) {
      buffer += chunk.toString();
      if (debug) rawStdout += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop()!;

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          if (data.type === 'content_block_delta' && data.delta?.text) {
            hasContent = true;
            yield data.delta.text;
          } else if (data.type === 'result' && data.result) {
            hasContent = true;
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
          hasContent = true;
          yield data.delta.text;
        } else if (data.type === 'result' && data.result) {
          hasContent = true;
          yield data.result;
        }
      } catch {
        // 忽略
      }
    }

    // 空回复检测：检查退出码和 stderr
    if (!hasContent) {
      const exitCode = await exitCodePromise;
      const errInfo = stderrOutput.trim();
      if (exitCode !== 0 && exitCode !== null) {
        throw new Error(`Claude CLI 退出码 ${exitCode}${errInfo ? `: ${errInfo}` : ''}`);
      }
      if (errInfo) {
        throw new Error(`Claude 未返回内容: ${errInfo}`);
      }
    }
  } finally {
    clearTimeout(timeout);
    if (!proc.killed) proc.kill('SIGTERM');
    if (debug) {
      const exitCode = await exitCodePromise;
      saveRawLog({ args, sessionId, resume, stdout: rawStdout, stderr: stderrOutput, exitCode })
        .catch(err => log.error(`saveRawLog failed: ${err}`));
    }
  }
}
