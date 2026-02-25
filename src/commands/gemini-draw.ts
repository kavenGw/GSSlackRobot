import type { CommandContext } from './index.js';
import { drawGemini } from '../services/gemini.js';

export async function handleGeminiDraw({ text, channel, threadTs, client }: CommandContext) {
  const prompt = text.replace(/^gemini-draw\s+/i, '').trim();
  if (!prompt) {
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: '请在 gemini-draw 后输入描述，例如: `gemini-draw 一只猫`',
    });
    return;
  }

  const initial = await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: '🎨 绘图中...',
  });

  try {
    const result = await drawGemini(prompt);

    if (result.imageBuffer) {
      await client.filesUploadV2({
        channel_id: channel,
        thread_ts: threadTs,
        file: result.imageBuffer,
        filename: 'gemini-draw.png',
        title: prompt,
      });
    }

    const updateText = result.text ?? (result.imageBuffer ? '图片已生成' : '未能生成图片');
    await client.chat.update({
      channel,
      ts: initial.ts!,
      text: updateText,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await client.chat.update({
      channel,
      ts: initial.ts!,
      text: `Gemini Draw 出错: ${errMsg}`,
    });
  }
}
