import type { App, SayFn } from '@slack/bolt';
import type { WebClient } from '@slack/web-api';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { v5 as uuidv5 } from 'uuid';
import { handleHelp } from './help.js';
import { handleCommands } from './commands.js';
import { handleListMilestones } from './list-milestones.js';
import { handleListMilestoneIssues } from './list-milestone-issues.js';
import { handleCreateMilestone } from './create-milestone.js';
import { handleDailyReport, handleResetDailyReport } from './daily-report.js';
import { handleGemini } from './gemini.js';
import { handleGeminiDraw } from './gemini-draw.js';
import { askClaude, type ClaudeImage } from '../services/claude.js';
import { markdownToSlack, safePost, safeUpdate, createTracker } from '../utils/message.js';
import { log, saveConversationLog } from '../utils/logger.js';
import { getConfig } from '../config/index.js';

const SESSION_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const KNOWN_SESSIONS_PATH = 'data/known-sessions.json';
const activeSessions = new Set<string>();
const knownSessions = new Set<string>();

export async function loadKnownSessions(): Promise<void> {
  try {
    const raw = await readFile(KNOWN_SESSIONS_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as string[];
    if (Array.isArray(parsed)) {
      for (const id of parsed) knownSessions.add(id);
    }
    log.info(`Loaded ${knownSessions.size} known sessions`);
  } catch {
    // 文件不存在或损坏，从空 Set 开始
  }
}

async function saveKnownSessions(): Promise<void> {
  await mkdir('data', { recursive: true });
  await writeFile(KNOWN_SESSIONS_PATH, JSON.stringify([...knownSessions]));
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
const BRAINSTORM_TRIGGER = '头脑风暴';
const BRAINSTORM_SKILL = '/superpowers:brainstorming';

function threadToSessionId(threadTs: string): string {
  return uuidv5(threadTs, SESSION_NAMESPACE);
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

async function handleClaude({ text, channel, threadTs, client, files, userId }: CommandContext) {
  let prompt: string;
  if (text.startsWith(BRAINSTORM_TRIGGER + ' ')) {
    // 主动请求脑暴 skill：替换前缀并保持斜杠开头，跳过转义以真正触发
    prompt = BRAINSTORM_SKILL + text.slice(BRAINSTORM_TRIGGER.length);
  } else {
    prompt = text.startsWith('/') ? ` ${text}` : text;
  }

  let images: ClaudeImage[] = [];
  if (files?.length) {
    images = await downloadSlackImages(files, getConfig().slack.botToken);
  }
  const finalText = images.length && !prompt.trim() ? '请查看图片' : prompt;

  const startTime = Date.now();
  log.claudeStart(finalText.length);
  if (images.length) {
    log.info(`Sending ${images.length} image(s) to Claude (multimodal)`);
  }
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
  const maxBlockText = getConfig().slack.maxBlockText;
  const tracker = createTracker(msgTs, '思考中...');

  const flush = async (final = false) => {
    const now = Date.now();
    if (!final && now - lastUpdate < THROTTLE_MS) return;
    lastUpdate = now;
    const text = final ? markdownToSlack(content) : content;
    await safeUpdate(client, channel, text || '思考中...', threadTs, tracker, maxBlockText);
  };

  try {
    const resume = knownSessions.has(sessionId);
    for await (const chunk of askClaude(finalText, images, sessionId, resume)) {
      content += chunk;
      await flush();
    }
    await flush(true);
    if (!content) {
      await client.chat.update({ channel, ts: msgTs, text: 'Claude 未返回内容，请重试。' });
    }
    const durationMs = Date.now() - startTime;
    log.claudeDone(durationMs, content.length);
    const segments = tracker.segments.length;
    log.reply(segments);
    await saveConversationLog({
      prompt: finalText,
      reply: content,
      durationMs,
      sessionId,
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
  } finally {
    if (!knownSessions.has(sessionId)) {
      knownSessions.add(sessionId);
      saveKnownSessions().catch(err => log.error(`saveKnownSessions failed: ${err}`));
    }
    activeSessions.delete(sessionId);
  }
}

export function registerCommands(app: App) {
  app.event('app_mention', async ({ event, say, client }) => {
    const text = resolveAlias(event.text.replace(/<@[A-Z0-9]+>\s*/g, '').trim());
    const threadTs = event.thread_ts ?? event.ts;
    log.incoming(event.user ?? 'unknown', text);

    const files = (event as any).files as SlackFile[] | undefined;
    const ctx: CommandContext = { text, channel: event.channel, threadTs, say, client, files, userId: event.user };

    try {
      if (/^help$/i.test(text)) {
        log.help();
        await handleHelp(ctx);
      } else if (/^commands$/i.test(text)) {
        await handleCommands(ctx);
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
