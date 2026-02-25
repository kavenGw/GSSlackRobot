import type { CommandContext } from './index.js';

const HELP_TEXT = `*GSSlackRobot 可用指令:*

• \`help\` (\`h\`) — 显示此帮助信息
• \`commands\` (\`command\`) — 列出所有 Claude 自定义 Commands
• \`list-milestones\` (\`milestones\`) — 列出活跃 GitLab milestones
• \`list-issues <版本>\` (\`issues\`) — 查看版本 issue 状态
• \`daily-report [版本]\` (\`report\`) — 生成每日简报
• \`create-milestone <版本>\` (\`create\`) — 创建 milestone + 杂项 issue
• \`gemini <问题>\` (\`gem\`) — 与 Google Gemini AI 对话
• \`gemini-draw <描述>\` (\`draw\`) — 用 Gemini 生成图片
• \`<任意问题>\` — 直接与 Claude AI 对话`;

export async function handleHelp({ say, threadTs }: CommandContext) {
  await say({ text: HELP_TEXT, thread_ts: threadTs });
}
