import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getIssues, getLatestActiveMilestone, getMilestoneByTitle } from '../services/gitlab.js';
import type { GitLabMilestone, GitLabIssue } from '../services/gitlab.js';
import { clearRunToday } from '../utils/scheduler-guard.js';
import type { CommandContext } from './index.js';

const TESTING_LABELS = new Set(['待审核', '待审核未打包']);
const DATA_DIR = join(process.cwd(), 'data', 'milestone-daily');

interface IssueSnapshot {
  iid: number;
  title: string;
  labels?: string[];
  assignee?: string;
}

interface DailySnapshot {
  milestone: string;
  date: string;
  incomplete: IssueSnapshot[];
  testing: IssueSnapshot[];
  completed: IssueSnapshot[];
  counts: { incomplete: number; testing: number; completed: number };
}

function todayStr() { return new Date().toISOString().slice(0, 10); }

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function snapshotPath(title: string, date: string) {
  return join(DATA_DIR, `${title}-${date}.json`);
}

function toSnapshot(issue: GitLabIssue): IssueSnapshot {
  return {
    iid: issue.iid,
    title: issue.title,
    labels: issue.labels,
    assignee: issue.assignee?.username,
  };
}

export async function generateDailyReport(milestone: GitLabMilestone): Promise<string> {
  const [opened, closed] = await Promise.all([
    getIssues(milestone.title, 'opened'),
    getIssues(milestone.title, 'closed'),
  ]);

  const incomplete = opened.filter(i => !i.labels.some(l => TESTING_LABELS.has(l)));
  const testing = opened.filter(i => i.labels.some(l => TESTING_LABELS.has(l)));

  const today = todayStr();
  const todayData: DailySnapshot = {
    milestone: milestone.title,
    date: today,
    incomplete: incomplete.map(toSnapshot),
    testing: testing.map(toSnapshot),
    completed: closed.map(i => ({ iid: i.iid, title: i.title })),
    counts: { incomplete: incomplete.length, testing: testing.length, completed: closed.length },
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(snapshotPath(milestone.title, today), JSON.stringify(todayData, null, 2), 'utf-8');

  let yesterdayData: DailySnapshot | null = null;
  try {
    const raw = await readFile(snapshotPath(milestone.title, yesterdayStr()), 'utf-8');
    yesterdayData = JSON.parse(raw);
  } catch { /* 无昨日数据 */ }

  const dateRange = milestone.start_date && milestone.due_date
    ? `${milestone.start_date.slice(5)} ~ ${milestone.due_date.slice(5)}`
    : '日期: 未设置';
  const desc = milestone.description || '(未设置)';

  const lines: string[] = [
    `*每日简报 ${today} (版本 ${milestone.title} | ${dateRange})*`,
    `描述: ${desc}`,
    '',
  ];

  const tc = todayData.counts;

  if (yesterdayData) {
    const yc = yesterdayData.counts;
    const yesterdayAllIids = new Set([
      ...yesterdayData.incomplete.map(i => i.iid),
      ...yesterdayData.testing.map(i => i.iid),
      ...yesterdayData.completed.map(i => i.iid),
    ]);
    const todayAllIids = new Set([
      ...todayData.incomplete.map(i => i.iid),
      ...todayData.testing.map(i => i.iid),
      ...todayData.completed.map(i => i.iid),
    ]);
    const newIssues = [...todayAllIids].filter(id => !yesterdayAllIids.has(id));

    const yesterdayTestingIids = new Set(yesterdayData.testing.map(i => i.iid));
    const newlyTesting = testing.filter(i => !yesterdayTestingIids.has(i.iid));
    const yesterdayCompletedIids0 = new Set(yesterdayData.completed.map(i => i.iid));
    const newlyCompleted0 = closed.filter(i => !yesterdayCompletedIids0.has(i.iid));
    const shownIids = new Set([...newlyTesting.map(i => i.iid), ...newlyCompleted0.map(i => i.iid)]);
    const newIssueItems = [...incomplete, ...testing, ...closed].filter(i => newIssues.includes(i.iid) && !shownIids.has(i.iid));

    lines.push('*== 昨日进度 ==*');
    lines.push(`新完成: ${newlyCompleted0.length}`);
    for (const i of newlyCompleted0) lines.push(`  #${i.iid} ${i.title}`);
    lines.push(`新增待测试: ${newlyTesting.length}`);
    for (const i of newlyTesting) lines.push(`  #${i.iid} ${i.title}`);
    lines.push(`新增 issue: ${newIssueItems.length}`);
    for (const i of newIssueItems) lines.push(`  #${i.iid} ${i.title}`);
    lines.push('');

    lines.push('*== 当前状态 ==*');
    for (const [key, label] of [['incomplete', '未完成'], ['testing', '待测试'], ['completed', '已完成']] as const) {
      const diff = tc[key] - yc[key];
      const sign = diff >= 0 ? '+' : '';
      lines.push(`${label}: ${tc[key]} (昨日: ${yc[key]}, ${sign}${diff})`);
    }
  } else {
    lines.push('*== 当前状态 ==*');
    lines.push(`未完成: ${tc.incomplete}`);
    lines.push(`待测试: ${tc.testing}`);
    lines.push(`已完成: ${tc.completed}`);
    lines.push('');
    lines.push('(首次运行，无昨日数据可对比)');
  }

  lines.push('');

  if (incomplete.length > 0) {
    const byAssignee = new Map<string, GitLabIssue[]>();
    for (const i of incomplete) {
      const name = i.assignee?.username ?? '未分配';
      if (!byAssignee.has(name)) byAssignee.set(name, []);
      byAssignee.get(name)!.push(i);
    }

    lines.push(`*== 未完成详情 (${incomplete.length}) ==*`, '');
    const sorted = [...byAssignee.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
    for (const [assignee, issues] of sorted) {
      lines.push(`*${assignee}* (${issues.length}):`);
      for (const i of issues) {
        const labels = i.labels.length > 0 ? ` | ${i.labels.join(',')}` : '';
        lines.push(`  #${i.iid} ${i.title}${labels}`);
      }
      lines.push('');
    }
  }


  lines.push('');
  lines.push(`快照已保存: ${snapshotPath(milestone.title, today)}`);

  return lines.join('\n');
}

export async function handleResetDailyReport({ say, threadTs }: CommandContext) {
  const milestone = await getLatestActiveMilestone();
  const today = todayStr();
  const path = snapshotPath(milestone.title, today);

  try {
    const { unlink } = await import('node:fs/promises');
    await unlink(path);
  } catch { /* 文件不存在则忽略 */ }

  await clearRunToday('daily-report');
  await say({ text: `已清除今日快照，正在重新生成...`, thread_ts: threadTs });

  const report = await generateDailyReport(milestone);
  await say({ text: report, thread_ts: threadTs });
}

export async function handleDailyReport({ text, say, threadTs }: CommandContext) {
  const titleArg = text.replace(/^daily-report\s*/i, '').trim();
  const milestone = titleArg
    ? await getMilestoneByTitle(titleArg)
    : await getLatestActiveMilestone();

  const report = await generateDailyReport(milestone);
  await say({ text: report, thread_ts: threadTs });
}
