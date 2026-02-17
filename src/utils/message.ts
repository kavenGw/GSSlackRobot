import type { Block, KnownBlock } from '@slack/types';

type SlackBlock = Block | KnownBlock;

const MAX_BLOCK_TEXT = 3000;

export function truncate(text: string, maxLen: number = MAX_BLOCK_TEXT): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

export function splitToBlocks(text: string, maxLen: number = MAX_BLOCK_TEXT): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    // 尝试在换行处分割
    let splitAt = remaining.lastIndexOf('\n', maxLen);
    if (splitAt < maxLen * 0.5) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  return chunks;
}

interface IssueItem {
  iid: number;
  title: string;
  state: string;
  labels: string[];
  web_url: string;
  assignee?: { name: string } | null;
}

export function formatIssueList(issues: IssueItem[], header: string): SlackBlock[] {
  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: header },
    },
  ];

  if (issues.length === 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '_无_' },
    });
    return blocks;
  }

  const lines = issues.map(i => {
    const labels = i.labels.length > 0 ? ` [${i.labels.join(', ')}]` : '';
    const assignee = i.assignee ? ` → ${i.assignee.name}` : '';
    return `• <${i.web_url}|#${i.iid}> ${i.title}${labels}${assignee}`;
  });

  // Slack section text 限制 3000 字符，分段
  for (const chunk of splitToBlocks(lines.join('\n'))) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: chunk },
    });
  }

  return blocks;
}
