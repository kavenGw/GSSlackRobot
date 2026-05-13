import type { App, SayFn } from '@slack/bolt';
import type { WebClient } from '@slack/web-api';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
import { handleModel, handleEffort } from './model.js';
import { askClaude } from '../services/claude.js';
import { isValidModel, isValidEffort, getClaudeSettings } from '../services/settings.js';
import type { ClaudeModel, EffortLevel } from '../services/settings.js';
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

async function downloadSlackImages(files: SlackFile[], token: string): Promise<string[]> {
  const paths: string[] = [];
  for (const file of files) {
    if (!file.url_private_download || !file.mimetype?.startsWith('image/')) continue;
    try {
      const resp = await fetch(file.url_private_download, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) continue;
      const raw = Buffer.from(await resp.arrayBuffer());
      const buf = await sharp(raw)
        .resize(1568, 1568, { fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();
      const p = join(tmpdir(), `slack-${Date.now()}-${file.name?.replace(/\.[^.]+$/, '') || 'image'}.png`);
      await writeFile(p, buf);
      paths.push(p);
    } catch {
      // 下载或图片处理失败跳过
    }
  }
  return paths;
}

async function handleClaude({ text, channel, threadTs, client, files }: CommandContext) {
  const { prompt, model, effort } = parseModelPrefix(text);

  let imagePaths: string[] = [];
  if (files?.length) {
    imagePaths = await downloadSlackImages(files, getConfig().slack.botToken);
  }
  const finalPrompt = imagePaths.length
    ? `${prompt || '请查看图片'}\n\n[用户发送了${imagePaths.length}张图片: ${imagePaths.join(', ')}]`
    : prompt;

  const startTime = Date.now();
  log.claudeStart(finalPrompt.length);
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
    for await (const chunk of askClaude(finalPrompt, sessionId, resume, model, effort)) {
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
    const settings = getClaudeSettings();
    await saveConversationLog({ prompt: finalPrompt, reply: content, durationMs, sessionId, resume, segments, model: model ?? settings.model, effort: effort ?? settings.effort });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (!content) {
      await client.chat.update({ channel, ts: msgTs, text: `出错: ${errMsg}` });
    } else {
      await safePost(client, channel, `_（出错: ${errMsg}）_`, threadTs, getConfig().slack.maxBlockText);
    }
  } finally {
    if (!knownSessions.has(sessionId)) {
      knownSessions.add(sessionId);
      saveKnownSessions().catch(err => log.error(`saveKnownSessions failed: ${err}`));
    }
    activeSessions.delete(sessionId);
    for (const p of imagePaths) unlink(p).catch(() => {});
  }
}

export function registerCommands(app: App) {
  app.event('app_mention', async ({ event, say, client }) => {
    const text = resolveAlias(event.text.replace(/<@[A-Z0-9]+>\s*/g, '').trim());
    const threadTs = event.thread_ts ?? event.ts;
    log.incoming(event.user ?? 'unknown', text);

    const files = (event as any).files as SlackFile[] | undefined;
    const ctx: CommandContext = { text, channel: event.channel, threadTs, say, client, files };

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
