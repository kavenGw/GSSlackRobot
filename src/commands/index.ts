import type { App, SayFn } from '@slack/bolt';
import type { WebClient } from '@slack/web-api';
import { v5 as uuidv5 } from 'uuid';
import { handleHelp } from './help.js';
import { handleCommands } from './commands.js';
import { handleListMilestones } from './list-milestones.js';
import { handleListMilestoneIssues } from './list-milestone-issues.js';
import { handleCreateMilestone } from './create-milestone.js';
import { handleDailyReport, handleResetDailyReport } from './daily-report.js';
import { handleGemini } from './gemini.js';
import { handleGeminiDraw } from './gemini-draw.js';
import { handleModel, handleEffort } from './model.js';
import { askClaude } from '../services/claude.js';
import { isValidModel, isValidEffort } from '../services/settings.js';
import type { ClaudeModel, EffortLevel } from '../services/settings.js';
import { splitToBlocks } from '../utils/message.js';
import { log, saveConversationLog } from '../utils/logger.js';
import { getConfig } from '../config/index.js';

const SESSION_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const activeSessions = new Set<string>();
const knownSessions = new Set<string>();

export interface CommandContext {
  text: string;
  channel: string;
  threadTs: string;
  say: SayFn;
  client: WebClient;
}

const COMMAND_ALIASES: Record<string, string> = {
  h: 'help',
  command: 'commands',
  milestones: 'list-milestones',
  issues: 'list-issues',
  report: 'daily-report',
  'reset-report': 'reset-daily-report',
  create: 'create-milestone',
  gem: 'gemini',
  m: 'model',
  draw: 'gemini-draw',
};

function resolveAlias(input: string): string {
  const spaceIdx = input.indexOf(' ');
  const cmd = (spaceIdx === -1 ? input : input.slice(0, spaceIdx)).toLowerCase();
  const rest = spaceIdx === -1 ? '' : input.slice(spaceIdx);
  return COMMAND_ALIASES[cmd] ? COMMAND_ALIASES[cmd] + rest : input;
}

const THROTTLE_MS = 500;
const MAX_MSG_LEN = 3800;

function threadToSessionId(threadTs: string): string {
  return uuidv5(threadTs, SESSION_NAMESPACE);
}

function parseModelPrefix(text: string): { prompt: string; model?: ClaudeModel; effort?: EffortLevel } {
  const words = text.split(/\s+/);
  if (words.length < 2) return { prompt: text };

  const first = words[0].toLowerCase();
  if (!isValidModel(first)) return { prompt: text };

  const second = words[1].toLowerCase();
  if (isValidEffort(second)) {
    return { prompt: words.slice(2).join(' '), model: first as ClaudeModel, effort: second as EffortLevel };
  }
  return { prompt: words.slice(1).join(' '), model: first as ClaudeModel };
}

async function handleClaude({ text, channel, threadTs, client }: CommandContext) {
  const { prompt, model, effort } = parseModelPrefix(text);
  const startTime = Date.now();
  log.claudeStart(prompt.length);
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
    const resume = knownSessions.has(sessionId);
    for await (const chunk of askClaude(prompt, sessionId, resume, model, effort)) {
      content += chunk;
      await flush();
    }
    await flush(true);
    if (!content) {
      await client.chat.update({ channel, ts: msgTs, text: 'Claude 未返回内容，请重试。' });
    }
    const durationMs = Date.now() - startTime;
    log.claudeDone(durationMs, content.length);
    const segments = content.length <= MAX_MSG_LEN ? 1 : splitToBlocks(content).length;
    log.reply(segments);
    await saveConversationLog({ prompt, reply: content, durationMs, sessionId, resume, segments });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await client.chat.update({
      channel,
      ts: msgTs,
      text: content ? `${content}\n\n_（出错: ${errMsg}）_` : `出错: ${errMsg}`,
    });
  } finally {
    knownSessions.add(sessionId);
    activeSessions.delete(sessionId);
  }
}

export function registerCommands(app: App) {
  app.event('app_mention', async ({ event, say, client }) => {
    const text = resolveAlias(event.text.replace(/<@[A-Z0-9]+>\s*/g, '').trim());
    const threadTs = event.thread_ts ?? event.ts;
    log.incoming(event.user ?? 'unknown', text);

    const ctx: CommandContext = { text, channel: event.channel, threadTs, say, client };

    try {
      if (/^help$/i.test(text)) {
        log.help();
        await handleHelp(ctx);
      } else if (/^commands$/i.test(text)) {
        await handleCommands(ctx);
      } else if (/^model\b/i.test(text)) {
        await handleModel(ctx);
      } else if (/^effort\b/i.test(text)) {
        await handleEffort(ctx);
      } else if (/^(list-milestones|list-issues|daily-report|reset-daily-report|create-milestone)\b/i.test(text)) {
        if (!getConfig().gitlab) {
          await say({ text: 'GitLab 未配置，请设置 GITLAB_API_URL、GITLAB_TOKEN、GITLAB_PROJECT_ID 环境变量', thread_ts: threadTs });
        } else if (/^list-milestones$/i.test(text)) {
          await handleListMilestones(ctx);
        } else if (/^list-issues\b/i.test(text)) {
          await handleListMilestoneIssues(ctx);
        } else if (/^reset-daily-report$/i.test(text)) {
          await handleResetDailyReport(ctx);
        } else if (/^daily-report\b/i.test(text)) {
          await handleDailyReport(ctx);
        } else if (/^create-milestone\b/i.test(text)) {
          await handleCreateMilestone(ctx);
        }
      } else if (/^gemini-draw\b/i.test(text)) {
        if (!getConfig().gemini) {
          await say({ text: 'Gemini 未配置，请设置 GEMINI_API_KEY 环境变量', thread_ts: threadTs });
        } else {
          await handleGeminiDraw(ctx);
        }
      } else if (/^gemini\b/i.test(text)) {
        if (!getConfig().gemini) {
          await say({ text: 'Gemini 未配置，请设置 GEMINI_API_KEY 环境变量', thread_ts: threadTs });
        } else {
          await handleGemini(ctx);
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
