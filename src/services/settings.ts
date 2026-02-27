import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { log } from '../utils/logger.js';

export const CLAUDE_MODELS = ['opus', 'sonnet', 'haiku'] as const;
export const EFFORT_LEVELS = ['max', 'high', 'medium', 'low'] as const;

export type ClaudeModel = typeof CLAUDE_MODELS[number];
export type EffortLevel = typeof EFFORT_LEVELS[number];

export interface ClaudeSettings {
  model: ClaudeModel;
  effort: EffortLevel;
}

interface Settings {
  claude: ClaudeSettings;
}

const SETTINGS_PATH = 'data/settings.json';
const DEFAULTS: Settings = { claude: { model: 'sonnet', effort: 'high' } };

let settings: Settings = structuredClone(DEFAULTS);

export async function loadSettings(): Promise<void> {
  try {
    const raw = await readFile(SETTINGS_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Settings;
    if (parsed.claude) {
      if (CLAUDE_MODELS.includes(parsed.claude.model)) settings.claude.model = parsed.claude.model;
      if (EFFORT_LEVELS.includes(parsed.claude.effort)) settings.claude.effort = parsed.claude.effort;
    }
    log.info(`Settings loaded: model=${settings.claude.model}, effort=${settings.claude.effort}`);
  } catch {
    log.info('No settings file found, using defaults');
  }
}

async function save(): Promise<void> {
  await mkdir(dirname(SETTINGS_PATH), { recursive: true });
  await writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

export function getClaudeSettings(): ClaudeSettings {
  return settings.claude;
}

export async function updateClaudeModel(model: ClaudeModel, effort?: EffortLevel): Promise<void> {
  settings.claude.model = model;
  if (effort) settings.claude.effort = effort;
  await save();
}

export async function updateClaudeEffort(effort: EffortLevel): Promise<void> {
  settings.claude.effort = effort;
  await save();
}

export function isValidModel(value: string): value is ClaudeModel {
  return CLAUDE_MODELS.includes(value as ClaudeModel);
}

export function isValidEffort(value: string): value is EffortLevel {
  return EFFORT_LEVELS.includes(value as EffortLevel);
}
