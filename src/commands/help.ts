import type { CommandContext } from './index.js';

const HELP_TEXT = `*GSSlackRobot 可用指令:*

• \`help\` — 显示此帮助信息
• \`创建一个单子：<标题>\` — 在 GitLab 创建 issue
• \`头脑风暴 <问题>\` — 用 Claude AI 进行头脑风暴
• \`当前版本状态：<里程碑>\` — 查看 milestone 下的 issue 状态
• \`jenkins <job别名>\` — 触发 Jenkins 构建
• \`每日简报\` 或 \`每日简报：<里程碑>\` — 生成每日简报（执行 Jenkins GetPlayfabData，用 Claude 分析数据，并查看 GitLab 版本状态）`;

export async function handleHelp({ say, threadTs }: CommandContext) {
  await say({ text: HELP_TEXT, thread_ts: threadTs });
}
