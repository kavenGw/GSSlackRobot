import type { CommandContext } from './index.js';
import { createIssue } from '../services/gitlab.js';

export async function handleIssue({ match, say, threadTs }: CommandContext) {
  const title = match[1].trim();
  const issue = await createIssue(title);
  await say({
    text: `Issue 已创建: <${issue.web_url}|#${issue.iid} ${issue.title}>`,
    thread_ts: threadTs,
  });
}
