import type { CommandContext } from './index.js';

const HELP_TEXT = `*GSSlackRobot 可用指令:*

• \`help\` — 显示此帮助信息
• \`commands\` — 列出所有 Claude 自定义 Commands
• \`list-milestones\` — 列出活跃 GitLab milestones
• \`list-issues <版本>\` — 查看版本 issue 状态
• \`daily-report [版本]\` — 生成每日简报
• \`create-milestone <版本>\` — 创建 milestone + 杂项 issue
• \`<任意问题>\` — 直接与 Claude AI 对话`;

export async function handleHelp({ say, threadTs }: CommandContext) {
  await say({ text: HELP_TEXT, thread_ts: threadTs });
}
