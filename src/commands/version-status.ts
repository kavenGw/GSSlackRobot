import type { CommandContext } from './index.js';
import { getMilestoneIssues } from '../services/gitlab.js';
import { formatIssueList } from '../utils/message.js';

export async function handleVersionStatus({ match, say, threadTs }: CommandContext) {
  const milestoneTitle = match[1].trim();
  const { milestone, closed, opened, total } = await getMilestoneIssues(milestoneTitle);

  const blocks = [
    ...formatIssueList(closed, `已完成 (${closed.length}/${total})`),
    { type: 'divider' as const },
    ...formatIssueList(opened, `进行中 (${opened.length}/${total})`),
  ];

  await say({
    text: `Milestone "${milestone.title}" 状态: ${closed.length}/${total} 已完成`,
    blocks,
    thread_ts: threadTs,
  });
}
