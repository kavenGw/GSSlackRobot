import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Codex, type Thread, type UserInput } from '@openai/codex-sdk';
import { registerCommands, loadKnownSessions } from '../src/commands/index.js';
import { loadConfig } from '../src/config/index.js';

test('Slack commands preserve built-ins, resume Codex and release the thread after stop or post failure', async () => {
  const originalDir = process.cwd();
  const dir = await mkdtemp(join(tmpdir(), 'gs-commands-test-'));
  process.chdir(dir);
  process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';
  process.env.SLACK_APP_TOKEN = 'xapp-test-token';
  loadConfig();
  const messages: string[] = [];
  const prompts: string[] = [];
  let handler: (args: any) => Promise<void>;
  let waitForAbort = false;
  let signal: AbortSignal | undefined;
  let notifyStarted: () => void = () => {};
  let failPost = false;
  const client = { chat: {
    async postMessage(args: { text: string }) {
      if (failPost) { failPost = false; throw new Error('post failed'); }
      messages.push(args.text);
      return { ts: 'reply' };
    },
    async update(args: { text: string }) { messages.push(args.text); return {}; },
  } };
  const thread = { async runStreamed(input: UserInput[], options: { signal: AbortSignal }) {
    prompts.push(input.filter(item => item.type === 'text').map(item => item.text).join(''));
    signal = options.signal;
    return { events: (async function* () {
      yield { type: 'thread.started', thread_id: 'codex-session' };
      if (waitForAbort) {
        notifyStarted();
        await new Promise<void>(resolve => options.signal.addEventListener('abort', () => resolve(), { once: true }));
        options.signal.throwIfAborted();
      }
      yield { type: 'item.completed', item: { id: 'a', type: 'agent_message', text: 'answer' } };
    })() };
  } } as Thread;
  const start = mock.method(Codex.prototype, 'startThread', () => thread);
  const resume = mock.method(Codex.prototype, 'resumeThread', (id: string) => {
    assert.equal(id, 'codex-session');
    return thread;
  });
  const send = (text: string) => handler({
    event: { text: `<@BOT> ${text}`, channel: 'C', ts: '1', user: 'U' }, client,
    say: async (args: { text: string }) => { messages.push(args.text); },
  });
  try {
    await loadKnownSessions();
    registerCommands({ event(_name: string, callback: typeof handler) { handler = callback; } } as any);
    await send('codex 头脑风暴 plan');
    assert.equal(prompts[0], '$grilling plan');
    await send('h');
    await send('list-milestones');
    assert.equal(prompts.length, 1);
    await send('继续');
    assert.equal(prompts[1], '继续');
    assert.equal(start.mock.callCount(), 1);
    assert.equal(resume.mock.callCount(), 1);
    waitForAbort = true;
    const started = new Promise<void>(resolve => { notifyStarted = resolve; });
    const running = send('long task');
    await started;
    await send('another task');
    assert.ok(messages.includes('上一条消息还在处理中，请稍后再试。'));
    await send('终止');
    await running;
    assert.equal(signal?.aborted, true);
    assert.ok(messages.includes('⏹️ 已终止'));
    waitForAbort = false;
    failPost = true;
    await send('post error');
    await send('retry');
    assert.equal(prompts.at(-1), 'retry');
    assert.ok(messages.includes('<@U> ✅'));
  } finally {
    start.mock.restore();
    resume.mock.restore();
    process.chdir(originalDir);
    await rm(dir, { recursive: true, force: true });
  }
});
