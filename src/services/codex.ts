import { Codex, type UserInput } from '@openai/codex-sdk';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getConfig } from '../config/index.js';
import { nextWithTimeout, TIMEOUT } from '../utils/async.js';
import type { ClaudeImage } from './claude.js';

export function codexPrompt(text: string): string {
  const prefixes: ReadonlyArray<readonly [string, string]> = [
    ['头脑风暴', '$grilling'],
    ['bug修复', '$diagnosing-bugs'],
    ['归纳总结', '$distill-rules'],
    ['规划', '$wayfinder'],
    ['收尾', '$finish-task'],
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
  // 独立 controller：空闲超时中断 Codex 时不误判为用户「终止」
  const run = new AbortController();
  const onAbort = () => run.abort();
  controller.signal.addEventListener('abort', onAbort);
  const { idleTimeoutMin } = getConfig().claude;
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
    const { events } = await thread.runStreamed(input, { signal: run.signal });
    const iterator = events[Symbol.asyncIterator]();
    let hasMessage = false;
    while (true) {
      const next = await nextWithTimeout(iterator, idleTimeoutMin * 60_000);
      if (next === TIMEOUT) throw new Error(`Codex ${idleTimeoutMin} 分钟无响应，已终止`);
      if (next.done) break;
      const event = next.value;
      if (event.type === 'thread.started') await onSession(event.thread_id);
      if (event.type === 'turn.failed') throw new Error(event.error.message);
      if (event.type === 'error') throw new Error(event.message);
      if (event.type === 'item.completed' && event.item.type === 'agent_message') {
        yield (hasMessage ? '\n\n' : '') + event.item.text;
        hasMessage = true;
      }
    }
  } finally {
    controller.signal.removeEventListener('abort', onAbort);
    run.abort();
    if (imageDir) await rm(imageDir, { recursive: true, force: true });
  }
}
