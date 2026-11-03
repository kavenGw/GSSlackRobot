import type { App, SayFn } from '@slack/bolt';
import type { WebClient } from '@slack/web-api';
import sharp from 'sharp';
import { handleHelp } from './help.js';
import { handleCommands } from './commands.js';
import { handleListMilestones } from './list-milestones.js';
import { handleListMilestoneIssues } from './list-milestone-issues.js';
import { handleCreateMilestone } from './create-milestone.js';
import { handleDailyReport, handleResetDailyReport } from './daily-report.js';
import { handleGemini } from './gemini.js';
import { handleGeminiDraw } from './gemini-draw.js';
import { askClaude, type ClaudeImage } from '../services/claude.js';
import { askCodex, codexPrompt } from '../services/codex.js';
import { AgentSessions, claudeSessionId, type AgentSession } from '../services/agent-sessions.js';
import { markdownToSlack, safePost, safeUpdate, createTracker } from '../utils/message.js';
import { log, saveConversationLog } from '../utils/logger.js';
import { getConfig } from '../config/index.js';

const activeSessions = new Map<string, AbortController>();
const sessions = new AgentSessions();

export async function loadKnownSessions(): Promise<void> {
  await sessions.load();
}

interface SlackFile {
  url_private_download?: string;
  name?: string;
  mimetype?: string;
}

export interface CommandContext {
  text: string;
  channel: string;
  threadTs: string;
  say: SayFn;
  client: WebClient;
  files?: SlackFile[];
  userId?: string;
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
  draw: 'gemini-draw',
};

function resolveAlias(input: string): string {
  const spaceIdx = input.indexOf(' ');
  const cmd = (spaceIdx === -1 ? input : input.slice(0, spaceIdx)).toLowerCase();
  const rest = spaceIdx === -1 ? '' : input.slice(spaceIdx);
  return COMMAND_ALIASES[cmd] ? COMMAND_ALIASES[cmd] + rest : input;
}

const THROTTLE_MS = 500;
const STOPPED_TEXT = '⏹️ 已终止';

// 中文前缀 → skill / 内建命令：替换后保持斜杠开头，跳过转义以真正触发
const SKILL_PREFIXES: ReadonlyArray<readonly [string, string]> = [
  ['头脑风暴', '/mattpocock-skills:grilling'],
  ['bug修复', '/mattpocock-skills:diagnosing-bugs'],
  ['归纳总结', '/claude-md-management:claude-md-improver'],
  ['压缩', '/compact'],
];

function toPrompt(text: string): string {
  for (const [trigger, skill] of SKILL_PREFIXES) {
    if (text === trigger) return skill;
    if (text.startsWith(trigger + ' ')) return skill + text.slice(trigger.length);
  }
  return text.startsWith('/') ? ` ${text}` : text;
}

async function downloadSlackImages(files: SlackFile[], token: string): Promise<ClaudeImage[]> {
  const results: ClaudeImage[] = [];
  for (const file of files) {
    if (!file.url_private_download || !file.mimetype?.startsWith('image/')) continue;
    try {
      const resp = await fetch(file.url_private_download, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) {
        log.warn(`Slack image fetch failed: status=${resp.status} ${resp.statusText}`);
        continue;
      }
      const raw = Buffer.from(await resp.arrayBuffer());
      const ctype = resp.headers.get('content-type') ?? '';
      if (!ctype.startsWith('image/')) {
        log.warn(`Slack image download returned non-image (ctype=${ctype}) — bot token likely missing files:read scope`);
        continue;
      }
      const buf = await sharp(raw)
        .resize(1568, 1568, { fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();
      results.push({ data: buf.toString('base64'), mediaType: 'image/png' });
    } catch (e) {
      log.warn(`Slack image processing failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return results;
}

async function handleAgent({ text, channel, threadTs, client, files, userId }: CommandContext, session: AgentSession) {
  const provider = session.provider === 'codex' ? 'Codex' : 'Claude';
  const prompt = session.provider === 'codex' ? codexPrompt(text) : toPrompt(text);
  const sessionId = `${channel}:${threadTs}`;

  if (activeSessions.has(sessionId)) {
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: '上一条消息还在处理中，请稍后再试。',
    });
    return;
  }

  const controller = new AbortController();
  activeSessions.set(sessionId, controller);
  try {
    const images = files?.length ? await downloadSlackImages(files, getConfig().slack.botToken) : [];
    const finalText = images.length && !prompt.trim() ? '请查看图片' : prompt;
    const startTime = Date.now();
    log.agentStart(provider, finalText.length);
    const initial = await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: '思考中...',
    });
    const msgTs = initial.ts!;

    let content = '';
    let lastUpdate = 0;
    const maxBlockText = getConfig().slack.maxBlockText;
    const tracker = createTracker(msgTs, '思考中...');

    const flush = async (final = false) => {
      const now = Date.now();
      if (!final && now - lastUpdate < THROTTLE_MS) return;
      lastUpdate = now;
      const text = final ? markdownToSlack(content) : content;
      await safeUpdate(client, channel, text || '思考中...', threadTs, tracker, maxBlockText);
    };

    const reportStopped = async () => {
      if (content) {
        await flush(true);
        await client.chat.postMessage({ channel, thread_ts: threadTs, text: STOPPED_TEXT });
      } else {
        await client.chat.update({ channel, ts: msgTs, text: STOPPED_TEXT });
      }
    };

    try {
      controller.signal.throwIfAborted();
      const resume = Boolean(session.sessionId);
      const onSession = async (id: string) => {
        session.sessionId = id;
        await sessions.save();
      };
      const response = session.provider === 'codex'
        ? askCodex(finalText, images, session.sessionId, controller, onSession)
        : askClaude(finalText, images, session.sessionId ?? claudeSessionId(threadTs), resume, controller, onSession);
      for await (const chunk of response) {
        // abort 后 SDK 仍会继续吐缓冲内容数秒，主动 break 才能立即停止
        if (controller.signal.aborted) break;
        content += chunk;
        await flush();
      }
      if (controller.signal.aborted) {
        await reportStopped();
        return;
      }
      await flush(true);
      if (!content) {
        await client.chat.update({ channel, ts: msgTs, text: `${provider} 未返回内容，请重试。` });
      }
      const durationMs = Date.now() - startTime;
      log.agentDone(provider, durationMs, content.length);
      const segments = tracker.segments.length;
      log.reply(segments);
      await saveConversationLog({
        prompt: finalText,
        reply: content,
        durationMs,
        provider,
        sessionId: session.sessionId ?? sessionId,
        resume,
        segments,
        imageCount: images.length,
      });
      if (userId) {
        try {
          await client.chat.postMessage({
            channel,
            thread_ts: threadTs,
            text: `<@${userId}> ✅`,
          });
        } catch (notifyErr) {
          log.warn(`mention sender (success) failed: ${notifyErr instanceof Error ? notifyErr.message : String(notifyErr)}`);
        }
      }
    } catch (err) {
      if (controller.signal.aborted) {
        await reportStopped();
        return;
      }
      const errMsg = err instanceof Error ? err.message : String(err);
      if (!content) {
        await client.chat.update({ channel, ts: msgTs, text: `出错: ${errMsg}` });
      } else {
        await safePost(client, channel, `_（出错: ${errMsg}）_`, threadTs, getConfig().slack.maxBlockText);
      }
      if (userId) {
        try {
          await client.chat.postMessage({
            channel,
            thread_ts: threadTs,
            text: `<@${userId}> ❌`,
          });
        } catch (notifyErr) {
          log.warn(`mention sender (error) failed: ${notifyErr instanceof Error ? notifyErr.message : String(notifyErr)}`);
        }
      }
    }
  } finally {
    activeSessions.delete(sessionId);
  }
}

async function handleStop({ channel, threadTs, client }: CommandContext) {
  const controller = activeSessions.get(`${channel}:${threadTs}`);
  if (!controller) {
    await client.chat.postMessage({ channel, thread_ts: threadTs, text: '当前 thread 没有正在运行的 AI 任务。' });
    return;
  }
  controller.abort();
}

export function registerCommands(app: App) {
  app.event('app_mention', async ({ event, say, client }) => {
    const input = event.text.replace(/<@[A-Z0-9]+>\s*/g, '').trim();
    const threadTs = event.thread_ts ?? event.ts;
    log.incoming(event.user ?? 'unknown', input);
    const { session, text: routedText } = sessions.select(event.channel, threadTs, input);
    const text = resolveAlias(routedText);

    const files = (event as any).files as SlackFile[] | undefined;
    const ctx: CommandContext = { text, channel: event.channel, threadTs, say, client, files, userId: event.user };

    try {
      await sessions.save();
      if (/^help$/i.test(text)) {
        log.help();
        await handleHelp(ctx);
      } else if (/^commands$/i.test(text)) {
        await handleCommands(ctx);
      } else if (text === '终止') {
        await handleStop(ctx);
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
        await handleAgent(ctx, session);
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
