import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getIssues, getLatestActiveMilestoneTitle } from '../services/gitlab.js';
import type { GitLabIssue } from '../services/gitlab.js';
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

export async function generateDailyReport(title: string): Promise<string> {
  const [opened, closed] = await Promise.all([
    getIssues(title, 'opened'),
    getIssues(title, 'closed'),
  ]);

  const incomplete = opened.filter(i => !i.labels.some(l => TESTING_LABELS.has(l)));
  const testing = opened.filter(i => i.labels.some(l => TESTING_LABELS.has(l)));

  const today = todayStr();
  const todayData: DailySnapshot = {
    milestone: title,
    date: today,
    incomplete: incomplete.map(toSnapshot),
    testing: testing.map(toSnapshot),
    completed: closed.map(i => ({ iid: i.iid, title: i.title })),
    counts: { incomplete: incomplete.length, testing: testing.length, completed: closed.length },
  };

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(snapshotPath(title, today), JSON.stringify(todayData, null, 2), 'utf-8');

  let yesterdayData: DailySnapshot | null = null;
  try {
    const raw = await readFile(snapshotPath(title, yesterdayStr()), 'utf-8');
    yesterdayData = JSON.parse(raw);
  } catch { /* 无昨日数据 */ }

  const lines: string[] = [`*每日简报 ${today} (版本 ${title})*`, ''];

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

    lines.push('*== 今日进度 ==*');
    lines.push(`新完成: ${Math.max(0, tc.completed - yc.completed)}`);
    lines.push(`新增待测试: ${Math.max(0, tc.testing - yc.testing)}`);
    lines.push(`新增 issue: ${newIssues.length}`);
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

  if (yesterdayData) {
    const yesterdayCompletedIids = new Set(yesterdayData.completed.map(i => i.iid));
    const newlyCompleted = closed.filter(i => !yesterdayCompletedIids.has(i.iid));
    const yesterdayAllIids2 = new Set([
      ...yesterdayData.incomplete.map(i => i.iid),
      ...yesterdayData.testing.map(i => i.iid),
      ...yesterdayData.completed.map(i => i.iid),
    ]);
    const newlyAdded = [...incomplete, ...testing].filter(i => !yesterdayAllIids2.has(i.iid));

    if (newlyCompleted.length > 0 || newlyAdded.length > 0) {
      lines.push('*== 昨日变更 ==*');
      if (newlyCompleted.length > 0) {
        const items = newlyCompleted.slice(0, 10).map(i => `#${i.iid} ${i.title}`).join(', ');
        lines.push(`已完成: ${items}`);
      }
      if (newlyAdded.length > 0) {
        const items = newlyAdded.slice(0, 10).map(i => `#${i.iid} ${i.title}`).join(', ');
        lines.push(`新增: ${items}`);
      }
    }
  }

  lines.push('');
  lines.push(`快照已保存: ${snapshotPath(title, today)}`);

  return lines.join('\n');
}

export async function handleDailyReport({ text, say, threadTs }: CommandContext) {
  let title = text.replace(/^daily-report\s*/i, '').trim();
  if (!title) {
    title = await getLatestActiveMilestoneTitle();
  }

  const report = await generateDailyReport(title);
  await say({ text: report, thread_ts: threadTs });
}
