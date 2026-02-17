import type { WebClient } from '@slack/web-api';
import { getConfig } from '../config/index.js';

type EventHandler = (payload: Record<string, any>) => string | null;


function formatPush(payload: Record<string, any>): string | null {
  const branch = payload.ref?.replace('refs/heads/', '');
  const name = payload.user_name;
  const commits = payload.commits ?? [];
  if (commits.length === 0) return null;
  const commitLines = commits
    .slice(0, 5)
    .map((c: any) => `• <${c.url}|\`${c.id.slice(0, 8)}\`> ${c.title}`)
    .join('\n');
  const extra = commits.length > 5 ? `\n_...及其他 ${commits.length - 5} 个 commit_` : '';
  return `*${name}* pushed ${commits.length} commit(s) to \`${branch}\`\n${commitLines}${extra}`;
}

function formatMergeRequest(payload: Record<string, any>): string | null {
  const mr = payload.object_attributes;
  const action = mr.action;
  const author = payload.user?.name ?? mr.author_id;
  return `*${author}* ${action} MR <${mr.url}|!${mr.iid}> ${mr.title}\n\`${mr.source_branch}\` → \`${mr.target_branch}\``;
}

function formatPipeline(payload: Record<string, any>): string | null {
  const pipeline = payload.object_attributes;
  const status = pipeline.status;
  if (status === 'running') return null; // 只通知最终状态
  const icon = status === 'success' ? '✅' : status === 'failed' ? '❌' : '⚠️';
  const branch = pipeline.ref;
  return `${icon} Pipeline #${pipeline.id} on \`${branch}\`: *${status}*`;
}

function formatIssue(payload: Record<string, any>): string | null {
  const issue = payload.object_attributes;
  const action = issue.action;
  const author = payload.user?.name;
  return `*${author}* ${action} issue <${issue.url}|#${issue.iid}> ${issue.title}`;
}

function formatNote(payload: Record<string, any>): string | null {
  const note = payload.object_attributes;
  const author = payload.user?.name;
  const target = note.noteable_type;
  return `*${author}* commented on ${target} <${note.url}|${note.noteable_id}>:\n>${note.note?.slice(0, 200)}`;
}

const eventMap: Record<string, { key: string; format: EventHandler }> = {
  'Push Hook': { key: 'push', format: formatPush },
  'Merge Request Hook': { key: 'merge_request', format: formatMergeRequest },
  'Pipeline Hook': { key: 'pipeline', format: formatPipeline },
  'Issue Hook': { key: 'issue', format: formatIssue },
  'Note Hook': { key: 'note', format: formatNote },
};

export function handleGitLabEvent(
  eventType: string,
  payload: Record<string, any>,
  client: WebClient
) {
  const cfg = getConfig().webhook;
  const entry = eventMap[eventType];
  if (!entry) return;

  const enabled = cfg.events[entry.key as keyof typeof cfg.events];
  if (!enabled) return;

  const text = entry.format(payload);
  if (!text) return;

  client.chat.postMessage({
    channel: cfg.notifyChannel,
    text,
  }).catch(err => console.error('Failed to send webhook notification:', err));
}
