import type { App, SayFn } from '@slack/bolt';
import type { WebClient } from '@slack/web-api';
import { handleHelp } from './help.js';
import { handleIssue } from './issue.js';
import { handleBrainstorm } from './brainstorm.js';
import { handleVersionStatus } from './version-status.js';
import { handleJenkins } from './jenkins.js';
import { handleDailyReport } from './daily-report.js';

export interface CommandContext {
  text: string;
  match: RegExpMatchArray;
  channel: string;
  threadTs?: string;
  say: SayFn;
  client: WebClient;
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

export function registerCommands(app: App) {
  app.event('app_mention', async ({ event, say, client }) => {
    // 去掉 <@BOT_ID> 前缀
    const text = event.text.replace(/<@[A-Z0-9]+>\s*/g, '').trim();

    for (const cmd of commands) {
      const match = text.match(cmd.pattern);
      if (match) {
        try {
          await cmd.handler({
            text,
            match,
            channel: event.channel,
            threadTs: event.thread_ts ?? event.ts,
            say,
            client,
          });
        } catch (err) {
          console.error(`Command error [${cmd.pattern}]:`, err);
          await say({
            text: `执行出错: ${err instanceof Error ? err.message : String(err)}`,
            thread_ts: event.thread_ts ?? event.ts,
          });
        }
        return;
      }
    }

    await say({
      text: '未识别的指令，输入 `help` 查看可用命令。',
      thread_ts: event.thread_ts ?? event.ts,
    });
  });
}
