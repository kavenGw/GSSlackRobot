import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getConfig } from '../config/index.js';
import type { CommandContext } from './index.js';

async function listMdFiles(dir: string): Promise<string[]> {
  try {
    const files = await readdir(dir);
    return files
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace(/\.md$/, ''))
      .sort();
  } catch {
    return [];
  }
}

function formatSection(label: string, commands: string[]): string {
  if (commands.length === 0) return `${label}\n（无）`;
  return `${label}\n${commands.map(c => `• \`/${c}\``).join('\n')}`;
}

export async function handleCommands({ say, threadTs }: CommandContext) {
  const globalDir = join(homedir(), '.claude', 'commands');
  const globalCmds = await listMdFiles(globalDir);

  const projectDir = getConfig().claude.projectDir;
  let projectCmds: string[] = [];
  if (projectDir) {
    projectCmds = await listMdFiles(join(projectDir, '.claude', 'commands'));
  }

  const text = [
    '*Claude 自定义 Commands:*',
    '',
    formatSection('📂 全局命令 (~/.claude/commands/):', globalCmds),
    '',
    formatSection(
      `📂 项目命令 (${projectDir ? 'project' : '-'}/.claude/commands/):`,
      projectCmds,
    ),
  ].join('\n');

  await say({ text, thread_ts: threadTs });
}
