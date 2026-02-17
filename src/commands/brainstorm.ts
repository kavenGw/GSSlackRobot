import type { CommandContext } from './index.js';
import { brainstorm } from '../services/claude.js';
import { splitToBlocks } from '../utils/message.js';

const THROTTLE_MS = 500;
const MAX_MSG_LEN = 3800;

export async function handleBrainstorm({ match, channel, threadTs, client }: CommandContext) {
  const prompt = match[1].trim();

  // 发初始消息
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
      // 超长，分段发 thread
      const chunks = splitToBlocks(content);
      // 更新原消息为第一段
      await client.chat.update({
        channel,
        ts: msgTs,
        text: chunks[0],
      });
      // 后续段落发到 thread
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
    for await (const chunk of brainstorm(prompt)) {
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
