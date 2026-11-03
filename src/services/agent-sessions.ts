import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { v5 as uuidv5 } from 'uuid';

export type AgentProvider = 'claude' | 'codex';
export interface AgentSession {
  provider: AgentProvider;
  sessionId?: string;
}

export function claudeSessionId(threadTs: string): string {
  return uuidv5(threadTs, '6ba7b810-9dad-11d1-80b4-00c04fd430c8');
}

export class AgentSessions {
  private sessions = new Map<string, AgentSession>();
  private legacy = new Set<string>();
  private pending: Promise<void> = Promise.resolve();

  constructor(private path = 'data/agent-sessions.json', private legacyPath = 'data/known-sessions.json') {}

  async load(): Promise<void> {
    try {
      const entries = JSON.parse(await readFile(this.path, 'utf8'));
      if (!Array.isArray(entries) || !entries.every(entry =>
        Array.isArray(entry) && typeof entry[0] === 'string' &&
        (entry[1]?.provider === 'claude' || entry[1]?.provider === 'codex') &&
        (entry[1].sessionId === undefined || typeof entry[1].sessionId === 'string'))) {
        throw new Error('Invalid agent sessions file');
      }
      this.sessions = new Map(entries);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
    try {
      const ids = JSON.parse(await readFile(this.legacyPath, 'utf8'));
      if (!Array.isArray(ids) || !ids.every(id => typeof id === 'string')) {
        throw new Error('Invalid legacy sessions file');
      }
      this.legacy = new Set(ids);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  select(channel: string, threadTs: string, input: string): { session: AgentSession; text: string } {
    const key = `${channel}:${threadTs}`;
    const text = input.trim();
    let session = this.sessions.get(key);
    if (session) return { session, text };
    const legacyId = claudeSessionId(threadTs);
    if (this.legacy.has(legacyId)) {
      session = { provider: 'claude', sessionId: legacyId };
    } else {
      session = { provider: /^codex(?:\s|$)/i.test(text) ? 'codex' : 'claude' };
    }
    this.sessions.set(key, session);
    return { session, text: session.provider === 'codex' ? text.replace(/^codex(?:\s+|$)/i, '') : text };
  }

  save(): Promise<void> {
    const snapshot = JSON.stringify([...this.sessions]);
    const operation = this.pending.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      await writeFile(`${this.path}.tmp`, snapshot);
      await rename(`${this.path}.tmp`, this.path);
    });
    this.pending = operation.catch(() => {});
    return operation;
  }
}
