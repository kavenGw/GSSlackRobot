import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const STATE_FILE = join(process.cwd(), 'data', 'scheduler-state.json');

async function loadState(): Promise<Record<string, string>> {
  try {
    return JSON.parse(await readFile(STATE_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

export async function hasRunToday(taskKey: string): Promise<boolean> {
  const state = await loadState();
  return state[taskKey] === new Date().toISOString().slice(0, 10);
}

export async function clearRunToday(taskKey: string): Promise<void> {
  const state = await loadState();
  delete state[taskKey];
  await mkdir(join(process.cwd(), 'data'), { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

export async function markRunToday(taskKey: string): Promise<void> {
  const state = await loadState();
  state[taskKey] = new Date().toISOString().slice(0, 10);
  await mkdir(join(process.cwd(), 'data'), { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}
