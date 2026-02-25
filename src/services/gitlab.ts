import { getConfig } from '../config/index.js';

interface GitLabMilestone {
  id: number;
  iid: number;
  title: string;
  created_at: string;
  start_date: string | null;
  due_date: string | null;
  web_url: string;
  state: string;
}

interface GitLabIssue {
  id: number;
  iid: number;
  title: string;
  state: string;
  labels: string[];
  assignee: { username: string } | null;
}

function getGitLab() {
  const cfg = getConfig().gitlab;
  if (!cfg) throw new Error('GitLab 未配置');
  return cfg;
}

async function gitlabFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const cfg = getGitLab();
  const url = `${cfg.apiUrl}/projects/${encodeURIComponent(cfg.projectId)}/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'PRIVATE-TOKEN': cfg.token,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitLab API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function getActiveMilestones(): Promise<GitLabMilestone[]> {
  const data = await gitlabFetch<GitLabMilestone[]>('milestones?state=active');
  return data.sort((a, b) => b.title.localeCompare(a.title));
}

export async function getLatestActiveMilestoneTitle(): Promise<string> {
  const milestones = await getActiveMilestones();
  if (milestones.length === 0) throw new Error('没有活跃的 milestone');
  return milestones[0].title;
}

export async function getIssues(milestone: string, state: 'opened' | 'closed'): Promise<GitLabIssue[]> {
  return gitlabFetch<GitLabIssue[]>(
    `issues?milestone=${encodeURIComponent(milestone)}&state=${state}&per_page=100`
  );
}

export async function createMilestone(title: string, startDate: string, dueDate: string): Promise<GitLabMilestone> {
  return gitlabFetch<GitLabMilestone>('milestones', {
    method: 'POST',
    body: JSON.stringify({ title, start_date: startDate, due_date: dueDate }),
  });
}

export async function createIssue(
  title: string,
  description: string,
  milestoneId: number,
): Promise<GitLabIssue> {
  return gitlabFetch<GitLabIssue>('issues', {
    method: 'POST',
    body: JSON.stringify({ title, description, milestone_id: milestoneId }),
  });
}

export type { GitLabMilestone, GitLabIssue };
