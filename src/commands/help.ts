import type { CommandContext } from './index.js';

const HELP_TEXT = `*GSSlackRobot 可用指令:*

• \`help\` (\`h\`) — 显示此帮助信息
• \`commands\` (\`command\`) — 列出所有 Claude 自定义 Commands
• \`list-milestones\` (\`milestones\`) — 列出活跃 GitLab milestones
• \`list-issues <版本>\` (\`issues\`) — 查看版本 issue 状态
• \`daily-report [版本]\` (\`report\`) — 生成每日简报
• \`reset-daily-report\` (\`reset-report\`) — 重置并重新生成今日简报
• \`create-milestone <版本>\` (\`create\`) — 创建 milestone + 杂项 issue
• \`gemini <问题>\` (\`gem\`) — 与 Google Gemini AI 对话
• \`gemini-draw <描述>\` (\`draw\`) — 用 Gemini 生成图片
• \`头脑风暴 <任意问题>\` — 让 Claude 追问拷打你的方案（mattpocock grilling）
• \`bug修复 <问题描述>\` — 与 Claude 系统化调试（mattpocock-skills:diagnosing-bugs）
• \`归纳总结 <任意说明>\` — 让 Claude 归纳总结并更新 CLAUDE.md（claude-md-management:claude-md-improver）
• \`压缩 [说明]\` — 压缩当前 thread 的 Claude 会话上下文（/compact）
• \`codex <任意问题>\` — 首次 @bot 时选择 Codex，后续消息无需前缀
• \`终止\` — 终止当前 thread 正在运行的 AI 任务
• \`<任意问题>\` — 默认与 Claude AI 对话

平台由 thread 第一次 @bot 决定，之后不能切换。内置命令保持不变。
Codex 线程也支持头脑风暴、bug修复、归纳总结；压缩会生成上下文摘要。`;

export async function handleHelp({ say, threadTs }: CommandContext) {
  await say({ text: HELP_TEXT, thread_ts: threadTs });
}
