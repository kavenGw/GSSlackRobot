import type { App } from '@slack/bolt';
import { getConfig } from '../config/index.js';
import { log } from '../utils/logger.js';

const SUBTYPE_BLOCKLIST = new Set(['message_changed', 'message_deleted']);

export async function registerJenkinsMention(app: App): Promise<void> {
  const cfg = getConfig().jenkinsMention;
  if (!cfg) return;

  let selfBotId: string | undefined;
  try {
    const auth = await app.client.auth.test();
    selfBotId = auth.bot_id as string | undefined;
  } catch (err) {
    log.error(`jenkins-mention: auth.test 失败，跳过注册: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  app.event('message', async ({ event, client }) => {
    try {
      const ev = event as any;

      if (ev.channel !== cfg.channel) return;
      if (selfBotId && ev.bot_id === selfBotId) return;
      if (ev.subtype && SUBTYPE_BLOCKLIST.has(ev.subtype)) return;
      if (ev.thread_ts && ev.thread_ts !== ev.ts) return;

      const text = typeof ev.text === 'string' ? ev.text.trim() : '';
      if (text === '<!channel>') return;

      await client.chat.postMessage({
        channel: cfg.channel,
        text: '<!channel>',
        link_names: true,
      });
    } catch (err) {
      log.warn(`jenkins-mention: 处理失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  log.info(`jenkins-mention: 已启用，监听频道 ${cfg.channel}`);
}
