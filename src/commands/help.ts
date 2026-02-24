import type { CommandContext } from './index.js';

const HELP_TEXT = `*GSSlackRobot 可用指令:*

• \`help\` — 显示此帮助信息
• \`commands\` — 列出所有 Claude 自定义 Commands
• \`<任意问题>\` — 直接与 Claude AI 对话`;

export async function handleHelp({ say, threadTs }: CommandContext) {
  await say({ text: HELP_TEXT, thread_ts: threadTs });
}
