import { getActiveMilestones } from '../services/gitlab.js';
import type { CommandContext } from './index.js';

export async function handleListMilestones({ say, threadTs }: CommandContext) {
  const milestones = await getActiveMilestones();
  if (milestones.length === 0) {
    await say({ text: '当前没有活跃的 milestone', thread_ts: threadTs });
    return;
  }

  const lines = ['*活跃 Milestones:*', ''];
  for (const m of milestones) {
    lines.push(`• *${m.title}* (iid: ${m.iid}, 创建: ${m.created_at.slice(0, 10)}) — ${m.web_url}`);
  }

  await say({ text: lines.join('\n'), thread_ts: threadTs });
}
