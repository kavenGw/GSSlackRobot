import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentSessions, claudeSessionId } from '../src/services/agent-sessions.js';

test('first mention selects provider and only consumes the initial codex prefix', () => {
  const sessions = new AgentSessions();
  assert.deepEqual(sessions.select('C', '1', '  CoDeX\n头脑风暴 test'), {
    session: { provider: 'codex' }, text: '头脑风暴 test',
  });
  assert.equal(sessions.select('C', '1', '继续').session.provider, 'codex');
  assert.equal(sessions.select('C', '1', 'claude switch').session.provider, 'codex');
  assert.equal(sessions.select('C', '1', 'codex again').text, 'codex again');
  assert.equal(sessions.select('C', '2', 'codexample test').session.provider, 'claude');
  assert.equal(sessions.select('C', '2', 'codex switch').session.provider, 'claude');
  assert.equal(sessions.select('C', '3', 'codex').text, '');
  assert.equal(sessions.select('C', '4', 'help').session.provider, 'claude');
  assert.equal(sessions.select('C', '4', 'codex switch').session.provider, 'claude');
  assert.equal(sessions.select('OTHER', '1', 'hello').session.provider, 'claude');
});

test('bindings, session IDs, concurrent writes and legacy Claude survive restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'gs-sessions-test-'));
  try {
    const path = join(dir, 'sessions.json');
    const legacy = join(dir, 'legacy.json');
    await writeFile(legacy, JSON.stringify([claudeSessionId('old')]));
    const sessions = new AgentSessions(path, legacy);
    await sessions.load();
    const previous = sessions.select('C', 'old', 'codex switch');
    assert.deepEqual(previous.session, { provider: 'claude', sessionId: claudeSessionId('old') });
    assert.equal(previous.text, 'codex switch');
    const firstSave = sessions.save();
    sessions.select('C', 'new', 'codex test').session.sessionId = 'codex-thread-id';
    await Promise.all([firstSave, sessions.save()]);
    const restored = new AgentSessions(path, legacy);
    await restored.load();
    assert.deepEqual(restored.select('C', 'new', 'continue').session, {
      provider: 'codex', sessionId: 'codex-thread-id',
    });
    await writeFile(path, 'corrupt');
    await assert.rejects(new AgentSessions(path, legacy).load());
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
