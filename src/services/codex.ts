import { Codex, type UserInput } from '@openai/codex-sdk';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getConfig } from '../config/index.js';
import type { ClaudeImage } from './claude.js';

export function codexPrompt(text: string): string {
  const prefixes: ReadonlyArray<readonly [string, string]> = [
    ['头脑风暴', '$grilling'],
    ['bug修复', '$diagnosing-bugs'],
    ['归纳总结', '$distill-rules'],
    ['压缩', '请总结当前会话的目标、已完成工作、关键决策和待办，作为后续工作的简明上下文。'],
  ];
  for (const [trigger, prompt] of prefixes) {
    if (text === trigger || text.startsWith(trigger + ' ')) return prompt + text.slice(trigger.length);
  }
  return text;
}

export async function* askCodex(
  text: string,
  images: ClaudeImage[],
  sessionId: string | undefined,
  controller: AbortController,
  onSession: (id: string) => Promise<void>,
): AsyncGenerator<string> {
  const codex = new Codex();
  const options = {
    workingDirectory: getConfig().claude.projectDir,
    approvalPolicy: 'never' as const,
    skipGitRepoCheck: true,
  };
  const thread = sessionId ? codex.resumeThread(sessionId, options) : codex.startThread(options);
  let imageDir: string | undefined;
  try {
    controller.signal.throwIfAborted();
    const input: UserInput[] = [{ type: 'text', text }];
    if (images.length) {
      imageDir = await mkdtemp(join(tmpdir(), 'gs-slack-codex-'));
      for (const [index, image] of images.entries()) {
        const path = join(imageDir, `${index}.png`);
        await writeFile(path, Buffer.from(image.data, 'base64'));
        input.push({ type: 'local_image', path });
      }
    }
    const { events } = await thread.runStreamed(input, { signal: controller.signal });
    let hasMessage = false;
    for await (const event of events) {
      if (event.type === 'thread.started') await onSession(event.thread_id);
      if (event.type === 'turn.failed') throw new Error(event.error.message);
      if (event.type === 'error') throw new Error(event.message);
      if (event.type === 'item.completed' && event.item.type === 'agent_message') {
        yield (hasMessage ? '\n\n' : '') + event.item.text;
        hasMessage = true;
      }
    }
  } finally {
    if (imageDir) await rm(imageDir, { recursive: true, force: true });
  }
}
