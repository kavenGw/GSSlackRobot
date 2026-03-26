import { getActiveMilestones } from '../services/gitlab.js';
import { safePost } from '../utils/message.js';
import type { CommandContext } from './index.js';

export async function handleListMilestones({ client, channel, threadTs }: CommandContext) {
  const milestones = await getActiveMilestones();
  if (milestones.length === 0) {
    await client.chat.postMessage({ channel, text: '当前没有活跃的 milestone', thread_ts: threadTs });
    return;
  }

  const lines = ['*活跃 Milestones:*', ''];
  for (const m of milestones) {
    const dateInfo = m.start_date && m.due_date
      ? `起止: ${m.start_date} ~ ${m.due_date}`
      : m.start_date
        ? `开始: ${m.start_date}`
        : `创建: ${m.created_at.slice(0, 10)}`;
    lines.push(`• *${m.title}* (iid: ${m.iid}, ${dateInfo}) — ${m.web_url}`);
  }

  await safePost(client, channel, lines.join('\n'), threadTs);
}
