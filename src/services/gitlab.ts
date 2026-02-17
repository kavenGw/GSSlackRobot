import { getConfig } from '../config/index.js';

interface GitLabIssue {
  iid: number;
  title: string;
  state: string;
  labels: string[];
  web_url: string;
  assignee?: { name: string } | null;
}

interface GitLabMilestone {
  id: number;
  iid: number;
  title: string;
}

function api(path: string, init?: RequestInit) {
  const cfg = getConfig().gitlab;
  return fetch(`${cfg.url}/api/v4${path}`, {
    ...init,
    headers: {
      'PRIVATE-TOKEN': cfg.token,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
}

function projectPath() {
  return `/projects/${encodeURIComponent(getConfig().gitlab.defaultProject)}`;
}

export async function createIssue(title: string, description?: string) {
  const body: Record<string, string> = { title };
  if (description) body.description = description;

  const res = await api(`${projectPath()}/issues`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`GitLab API error: ${res.status} ${await res.text()}`);
  return (await res.json()) as GitLabIssue;
}

export async function getMilestoneIssues(milestoneTitle: string) {
  // 查找 milestone
  const msRes = await api(`${projectPath()}/milestones?title=${encodeURIComponent(milestoneTitle)}`);
  if (!msRes.ok) throw new Error(`GitLab API error: ${msRes.status}`);
  const milestones = (await msRes.json()) as GitLabMilestone[];
  if (milestones.length === 0) throw new Error(`未找到 milestone: ${milestoneTitle}`);

  const milestone = milestones[0];

  // 获取所有 issues
  const issuesRes = await api(
    `${projectPath()}/milestones/${milestone.id}/issues?per_page=100`
  );
  if (!issuesRes.ok) throw new Error(`GitLab API error: ${issuesRes.status}`);
  const issues = (await issuesRes.json()) as GitLabIssue[];

  // 按 state 分组
  const closed = issues.filter(i => i.state === 'closed');
  const opened = issues.filter(i => i.state === 'opened');

  return { milestone, closed, opened, total: issues.length };
}

export async function getActiveMilestones(): Promise<GitLabMilestone[]> {
  const msRes = await api(`${projectPath()}/milestones?state=active&per_page=10`);
  if (!msRes.ok) throw new Error(`GitLab API error: ${msRes.status}`);
  return (await msRes.json()) as GitLabMilestone[];
}
