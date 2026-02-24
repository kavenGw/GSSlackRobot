import type { App, SayFn } from '@slack/bolt';
import type { WebClient } from '@slack/web-api';
import { v5 as uuidv5 } from 'uuid';
import { handleHelp } from './help.js';
import { handleCommands } from './commands.js';
import { handleListMilestones } from './list-milestones.js';
import { handleListMilestoneIssues } from './list-milestone-issues.js';
import { handleCreateMilestone } from './create-milestone.js';
import { handleDailyReport } from './daily-report.js';
import { askClaude } from '../services/claude.js';
import { splitToBlocks } from '../utils/message.js';
import { log } from '../utils/logger.js';
import { getConfig } from '../config/index.js';

const SESSION_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const activeSessions = new Set<string>();

export interface CommandContext {
  text: string;
  channel: string;
  threadTs: string;
  say: SayFn;
  client: WebClient;
}

const THROTTLE_MS = 500;
const MAX_MSG_LEN = 3800;

function threadToSessionId(threadTs: string): string {
  return uuidv5(threadTs, SESSION_NAMESPACE);
}

async function handleClaude({ text, channel, threadTs, client }: CommandContext) {
  const startTime = Date.now();
  log.claudeStart(text.length);
  const sessionId = threadToSessionId(threadTs);

  if (activeSessions.has(sessionId)) {
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: '上一条消息还在处理中，请稍后再试。',
    });
    return;
  }

  activeSessions.add(sessionId);
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
    for await (const chunk of askClaude(text, sessionId)) {
      content += chunk;
      await flush();
    }
    await flush(true);
    log.claudeDone(Date.now() - startTime, content.length);
    const segments = content.length <= MAX_MSG_LEN ? 1 : splitToBlocks(content).length;
    log.reply(segments);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await client.chat.update({
      channel,
      ts: msgTs,
      text: content ? `${content}\n\n_（出错: ${errMsg}）_` : `出错: ${errMsg}`,
    });
  } finally {
    activeSessions.delete(sessionId);
  }
}

export function registerCommands(app: App) {
  app.event('app_mention', async ({ event, say, client }) => {
    const text = event.text.replace(/<@[A-Z0-9]+>\s*/g, '').trim();
    const threadTs = event.thread_ts ?? event.ts;
    log.incoming(event.user ?? 'unknown', text);

    const ctx: CommandContext = { text, channel: event.channel, threadTs, say, client };

    try {
      if (/^help$/i.test(text)) {
        log.help();
        await handleHelp(ctx);
      } else if (/^commands$/i.test(text)) {
        await handleCommands(ctx);
      } else if (/^(list-milestones|list-issues|daily-report|create-milestone)\b/i.test(text)) {
        if (!getConfig().gitlab) {
          await say({ text: 'GitLab 未配置，请设置 GITLAB_API_URL、GITLAB_TOKEN、GITLAB_PROJECT_ID 环境变量', thread_ts: threadTs });
        } else if (/^list-milestones$/i.test(text)) {
          await handleListMilestones(ctx);
        } else if (/^list-issues\b/i.test(text)) {
          await handleListMilestoneIssues(ctx);
        } else if (/^daily-report\b/i.test(text)) {
          await handleDailyReport(ctx);
        } else if (/^create-milestone\b/i.test(text)) {
          await handleCreateMilestone(ctx);
        }
      } else {
        await handleClaude(ctx);
      }
    } catch (err) {
      log.error(err instanceof Error ? err.message : String(err));
      await say({
        text: `执行出错: ${err instanceof Error ? err.message : String(err)}`,
        thread_ts: threadTs,
      });
    }
  });
}
