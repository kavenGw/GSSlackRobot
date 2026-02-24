import type { App, SayFn } from '@slack/bolt';
import type { WebClient } from '@slack/web-api';
import { handleHelp } from './help.js';
import { handleCommands } from './commands.js';
import { askClaude } from '../services/claude.js';
import { splitToBlocks } from '../utils/message.js';

export interface CommandContext {
  text: string;
  channel: string;
  threadTs: string;
  say: SayFn;
  client: WebClient;
}

const THROTTLE_MS = 500;
const MAX_MSG_LEN = 3800;

async function handleClaude({ text, channel, threadTs, client }: CommandContext) {
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
    for await (const chunk of askClaude(text)) {
      content += chunk;
      await flush();
    }
    await flush(true);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await client.chat.update({
      channel,
      ts: msgTs,
      text: content ? `${content}\n\n_（出错: ${errMsg}）_` : `出错: ${errMsg}`,
    });
  }
}

export function registerCommands(app: App) {
  app.event('app_mention', async ({ event, say, client }) => {
    const text = event.text.replace(/<@[A-Z0-9]+>\s*/g, '').trim();
    const threadTs = event.thread_ts ?? event.ts;

    const ctx: CommandContext = { text, channel: event.channel, threadTs, say, client };

    try {
      if (/^help$/i.test(text)) {
        await handleHelp(ctx);
      } else if (/^commands$/i.test(text)) {
        await handleCommands(ctx);
      } else {
        await handleClaude(ctx);
      }
    } catch (err) {
      console.error('Command error:', err);
      await say({
        text: `执行出错: ${err instanceof Error ? err.message : String(err)}`,
        thread_ts: threadTs,
      });
    }
  });
}
