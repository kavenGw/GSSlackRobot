import { getIssues } from '../services/gitlab.js';
import type { CommandContext } from './index.js';

const TESTING_LABELS = new Set(['待审核', '待审核未打包']);

export async function handleListMilestoneIssues({ text, say, threadTs }: CommandContext) {
  const title = text.replace(/^list-issues\s*/i, '').trim();
  if (!title) {
    await say({ text: '用法: `list-issues <milestone标题>`，例如: `list-issues 10.32`', thread_ts: threadTs });
    return;
  }

  const [opened, closed] = await Promise.all([
    getIssues(title, 'opened'),
    getIssues(title, 'closed'),
  ]);

  const incomplete = opened.filter(i => !i.labels.some(l => TESTING_LABELS.has(l)));
  const testing = opened.filter(i => i.labels.some(l => TESTING_LABELS.has(l)));

  const lines = [`*版本 ${title} 状态报告*`, ''];

  if (incomplete.length > 0) {
    const byAssignee = new Map<string, typeof incomplete>();
    for (const i of incomplete) {
      const name = i.assignee?.username ?? '未分配';
      if (!byAssignee.has(name)) byAssignee.set(name, []);
      byAssignee.get(name)!.push(i);
    }

    lines.push(`*== 未完成 (${incomplete.length}) ==*`, '');
    const sorted = [...byAssignee.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
    for (const [assignee, issues] of sorted) {
      lines.push(`*${assignee}* (${issues.length}):`);
      for (const i of issues) {
        const labels = i.labels.length > 0 ? ` | ${i.labels.join(',')}` : '';
        lines.push(`  #${i.iid} ${i.title}${labels}`);
      }
      lines.push('');
    }
  } else {
    lines.push('*== 未完成 (0) ==*', '所有 issue 已完成或进入测试阶段', '');
  }

  lines.push('*== 统计 ==*');
  lines.push(`未完成: ${incomplete.length} | 待测试: ${testing.length} | 已完成: ${closed.length}`);

  await say({ text: lines.join('\n'), thread_ts: threadTs });
}
