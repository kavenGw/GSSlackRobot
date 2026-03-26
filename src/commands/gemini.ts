import type { CommandContext } from './index.js';
import { askGemini } from '../services/gemini.js';
import { markdownToSlack, safeUpdate } from '../utils/message.js';

export async function handleGemini({ text, channel, threadTs, client }: CommandContext) {
  const prompt = text.replace(/^gemini\s+/i, '').trim();
  if (!prompt) {
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: '请在 gemini 后输入你的问题，例如: `gemini 你好`',
    });
    return;
  }

  const initial = await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: '思考中...',
  });

  try {
    const reply = await askGemini(prompt, threadTs);
    await safeUpdate(client, channel, initial.ts!, markdownToSlack(reply), threadTs);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await client.chat.update({
      channel,
      ts: initial.ts!,
      text: `Gemini 出错: ${errMsg}`,
    });
  }
}
