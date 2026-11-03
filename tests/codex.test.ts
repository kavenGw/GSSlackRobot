import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { Codex, type Thread, type ThreadEvent, type UserInput } from '@openai/codex-sdk';
import { askCodex, codexPrompt } from '../src/services/codex.js';
import { loadConfig } from '../src/config/index.js';

process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';
process.env.SLACK_APP_TOKEN = 'xapp-test-token';
loadConfig();

test('Codex shortcuts use skills rather than Claude slash commands', () => {
  assert.equal(codexPrompt('头脑风暴 plan'), '$grilling plan');
  assert.equal(codexPrompt('bug修复'), '$diagnosing-bugs');
  assert.equal(codexPrompt('归纳总结 rules'), '$distill-rules rules');
  assert.ok(!codexPrompt('压缩').includes('/compact'));
  assert.equal(codexPrompt('normal prompt'), 'normal prompt');
});

test('Codex streams assistant messages, persists ID, resumes, cleans images and forwards cancellation', async () => {
  let imagePath = '';
  let resumed = '';
  const controller = new AbortController();
  const fakeThread = {
    async runStreamed(input: UserInput[], options: { signal: AbortSignal }) {
      assert.equal(options.signal, controller.signal);
      const image = input.find(item => item.type === 'local_image');
      if (image?.type === 'local_image') {
        imagePath = image.path;
        assert.equal(await readFile(imagePath, 'utf8'), 'image-bytes');
      }
      return { events: (async function* (): AsyncGenerator<ThreadEvent> {
        yield { type: 'thread.started', thread_id: 'persisted-id' };
        yield { type: 'item.completed', item: { id: 'r', type: 'reasoning', text: 'hidden' } };
        yield { type: 'item.completed', item: { id: 'a', type: 'agent_message', text: 'first' } };
        yield { type: 'item.completed', item: { id: 'b', type: 'agent_message', text: 'second' } };
      })() };
    },
  } as unknown as Thread;
  const start = mock.method(Codex.prototype, 'startThread', () => fakeThread);
  const resume = mock.method(Codex.prototype, 'resumeThread', (id: string) => { resumed = id; return fakeThread; });
  try {
    let saved = '';
    let reply = '';
    for await (const chunk of askCodex('hello', [{ mediaType: 'image/png', data: Buffer.from('image-bytes').toString('base64') }], undefined, controller, async id => { saved = id; })) reply += chunk;
    assert.equal(saved, 'persisted-id');
    assert.equal(reply, 'first\n\nsecond');
    await assert.rejects(access(imagePath));
    for await (const _ of askCodex('continue', [], saved, controller, async () => {})) {}
    assert.equal(resumed, saved);
    controller.abort();
    await assert.rejects(async () => {
      for await (const _ of askCodex('cancelled', [], saved, controller, async () => {})) {}
    }, { name: 'AbortError' });
  } finally {
    start.mock.restore();
    resume.mock.restore();
  }
});

test('Codex failure events surface as errors', async () => {
  const start = mock.method(Codex.prototype, 'startThread', () => ({
    async runStreamed() {
      return { events: (async function* () {
        yield { type: 'turn.failed', error: { message: 'test failure' } };
      })() };
    },
  }) as Thread);
  try {
    await assert.rejects(async () => {
      for await (const _ of askCodex('test', [], undefined, new AbortController(), async () => {})) {}
    }, /test failure/);
  } finally {
    start.mock.restore();
  }
});
