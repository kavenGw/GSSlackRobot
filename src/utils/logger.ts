import chalk from 'chalk';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export function isDebug(): boolean {
  return process.env.DEBUG_CLAUDE === 'true';
}

function ts(): string {
  return chalk.gray(`[${new Date().toLocaleTimeString('en-GB', { hour12: false })}]`);
}

interface ConversationLogParams {
  prompt: string;
  reply: string;
  durationMs: number;
  sessionId: string;
  resume: boolean;
  segments: number;
  model?: string;
  effort?: string;
}

export async function saveConversationLog(params: ConversationLogParams): Promise<void> {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = now.getFullYear();
  const m = pad(now.getMonth() + 1);
  const d = pad(now.getDate());
  const H = pad(now.getHours());
  const M = pad(now.getMinutes());
  const S = pad(now.getSeconds());

  const dateStr = `${y}-${m}-${d}`;
  const timeStr = `${H}:${M}:${S}`;
  const fileName = `${dateStr}_${H}-${M}-${S}.log`;
  const logsDir = join(process.cwd(), 'logs');
  const filePath = join(logsDir, fileName);

  const sec = (params.durationMs / 1000).toFixed(1);
  const content = `# Claude 对话日志
- 时间: ${dateStr} ${timeStr}
- 会话ID: ${params.sessionId}
- 续对话: ${params.resume ? '是' : '否'}
- 耗时: ${sec}s
- 提问长度: ${params.prompt.length} chars
- 回复长度: ${params.reply.length} chars
- 回复段数: ${params.segments}
${params.model ? `- 模型: ${params.model}\n` : ''}${params.effort ? `- effort: ${params.effort}\n` : ''}
## 用户提问
${params.prompt}

## Claude 回复
${params.reply}
`;

  try {
    await mkdir(logsDir, { recursive: true });
    await writeFile(filePath, content, 'utf-8');
    log.logSaved(fileName);
  } catch (err) {
    log.error(`保存对话日志失败: ${err instanceof Error ? err.message : String(err)}`);
  }
}

interface RawLogParams {
  args: string[];
  sessionId?: string;
  resume: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export async function saveRawLog(params: RawLogParams): Promise<void> {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = now.getFullYear();
  const m = pad(now.getMonth() + 1);
  const d = pad(now.getDate());
  const H = pad(now.getHours());
  const M = pad(now.getMinutes());
  const S = pad(now.getSeconds());

  const dateStr = `${y}-${m}-${d}`;
  const timeStr = `${H}:${M}:${S}`;
  const fileName = `${dateStr}_${H}-${M}-${S}_claude_raw.log`;
  const logsDir = join(process.cwd(), 'logs');
  const filePath = join(logsDir, fileName);

  const content = `# Claude CLI Raw Log
- 时间: ${dateStr} ${timeStr}
- 参数: ${params.args.join(' ')}
- 会话ID: ${params.sessionId ?? 'N/A'}
- 续对话: ${params.resume ? '是' : '否'}
- 退出码: ${params.exitCode}

## STDOUT
${params.stdout}

## STDERR
${params.stderr || '(empty)'}
`;

  try {
    await mkdir(logsDir, { recursive: true });
    await writeFile(filePath, content, 'utf-8');
    log.info(`Raw log saved: logs/${fileName}`);
  } catch (err) {
    log.error(`保存原始日志失败: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export const log = {
  startup() {
    console.log(`${ts()} ${chalk.blue('✦')} GSSlackRobot is running`);
  },

  incoming(user: string, text: string) {
    const preview = text.length > 60 ? text.slice(0, 60) + '...' : text;
    console.log(`${ts()} ${chalk.cyan('←')} @${user}: ${preview}`);
  },

  claudeStart(promptLen: number) {
    console.log(`${ts()} ${chalk.yellow('↻')} Claude 调用开始 (${promptLen} chars)`);
  },

  claudeDone(ms: number, chars: number) {
    const sec = (ms / 1000).toFixed(1);
    console.log(`${ts()} ${chalk.green('✓')} Claude 完成 (${sec}s, ${chars} chars)`);
  },

  reply(segments: number) {
    console.log(`${ts()} ${chalk.green('→')} 已发送回复 (${segments} 条消息)`);
  },

  help() {
    console.log(`${ts()} ${chalk.green('→')} 发送帮助信息`);
  },

  webhook(event: string, chars: number) {
    console.log(`${ts()} ${chalk.magenta('⚡')} GitLab ${event} (${chars} chars) → Slack`);
  },

  webhookServer(port: number) {
    console.log(`${ts()} ${chalk.blue('🔗')} Webhook server listening on port ${port}`);
  },

  info(msg: string) {
    console.log(`${ts()} ${chalk.blue('ℹ')} ${msg}`);
  },

  logSaved(fileName: string) {
    console.log(`${ts()} ${chalk.blue('📄')} 对话日志已保存: logs/${fileName}`);
  },

  error(msg: string) {
    const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
    console.error(chalk.red(`[ERROR ${time}] ✘ ${msg}`));
  },
};
