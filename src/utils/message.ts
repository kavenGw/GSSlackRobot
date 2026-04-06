import type { WebClient } from '@slack/web-api';

function strWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0x1100 && (
      cp <= 0x115F || cp >= 0x2E80 && cp <= 0xA4CF ||
      cp >= 0xAC00 && cp <= 0xD7A3 || cp >= 0xF900 && cp <= 0xFAFF ||
      cp >= 0xFE30 && cp <= 0xFE4F || cp >= 0xFF00 && cp <= 0xFF60 ||
      cp >= 0xFFE0 && cp <= 0xFFE6 || cp >= 0x20000 && cp <= 0x2FA1F
    )) {
      w += 2;
    } else {
      w += 1;
    }
  }
  return w;
}

function convertTables(text: string): string {
  const tableRegex = /(?:^\|.+\|\s*\n){2,}/gm;
  return text.replace(tableRegex, (table) => {
    const rows = table.trim().split('\n').map(row =>
      row.split('|').slice(1, -1).map(cell => cell.trim())
    );
    const dataRows = rows.filter(row =>
      !row.every(cell => /^[-:]+$/.test(cell))
    );
    if (dataRows.length === 0) return table;
    const colCount = dataRows[0].length;
    const widths = Array.from({ length: colCount }, (_, col) =>
      Math.max(...dataRows.map(row => strWidth(row[col] ?? '')))
    );
    const lines: string[] = [];
    for (let i = 0; i < dataRows.length; i++) {
      const line = dataRows[i]
        .map((cell, col) => cell + ' '.repeat(Math.max(0, widths[col] - strWidth(cell))))
        .join('  ');
      lines.push(line);
      if (i === 0) {
        lines.push(widths.map(w => '─'.repeat(w)).join('  '));
      }
    }
    return '```\n' + lines.join('\n') + '\n```\n';
  });
}

export function markdownToSlack(text: string): string {
  const codeBlocks: string[] = [];
  let result = text.replace(/```[\w]*\n([\s\S]*?)```/g, (_, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push('```\n' + code + '```');
    return `\x00CODEBLOCK${idx}\x00`;
  });

  const inlineCodes: string[] = [];
  result = result.replace(/`([^`\n]+)`/g, (match) => {
    const idx = inlineCodes.length;
    inlineCodes.push(match);
    return `\x00INLINE${idx}\x00`;
  });

  result = convertTables(result);

  // 标题
  result = result.replace(/^#{1,6}\s+(.+)$/gm, '*$1*');

  // 图片
  result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) =>
    alt ? `<${url}|${alt}>` : url
  );

  // 链接
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<$2|$1>');

  // 粗体
  result = result.replace(/\*\*(.+?)\*\*/g, '*$1*');

  // 删除线
  result = result.replace(/~~(.+?)~~/g, '~$1~');

  // 水平线（必须在无序列表之前，避免 `* * *` 格式被误匹配）
  result = result.replace(/^[-*]{3,}\s*$/gm, '────────────────────');

  // 无序列表
  result = result.replace(/^(\s*)[-*]\s+/gm, '$1• ');

  for (let i = 0; i < inlineCodes.length; i++) {
    result = result.replaceAll(`\x00INLINE${i}\x00`, () => inlineCodes[i]);
  }

  for (let i = 0; i < codeBlocks.length; i++) {
    result = result.replaceAll(`\x00CODEBLOCK${i}\x00`, () => codeBlocks[i]);
  }

  return result;
}

const MAX_BLOCK_TEXT = 3000;

function splitToBlocks(text: string, maxLen: number = MAX_BLOCK_TEXT): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf('\n', maxLen);
    if (splitAt < maxLen * 0.5) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  return chunks;
}

export async function safePost(
  client: WebClient,
  channel: string,
  text: string,
  threadTs?: string,
): Promise<void> {
  if (!text) return;
  const chunks = splitToBlocks(text);
  for (const chunk of chunks) {
    await client.chat.postMessage({ channel, text: chunk, thread_ts: threadTs });
  }
}

export async function postBlocks(
  client: WebClient,
  channel: string,
  blocks: object[],
  threadTs?: string,
): Promise<void> {
  if (blocks.length === 0) return;
  const MAX_BLOCKS = 50;
  for (let i = 0; i < blocks.length; i += MAX_BLOCKS) {
    const chunk = blocks.slice(i, i + MAX_BLOCKS);
    await client.chat.postMessage({ channel, text: '每日简报', blocks: chunk as any, thread_ts: threadTs });
  }
}

export async function safeUpdate(
  client: WebClient,
  channel: string,
  ts: string,
  text: string,
  threadTs?: string,
  lastSegment = 0,
): Promise<number> {
  if (!text) {
    await client.chat.update({ channel, ts, text: '' });
    return lastSegment;
  }
  const chunks = splitToBlocks(text);
  await client.chat.update({ channel, ts, text: chunks[0] });
  for (let i = lastSegment + 1; i < chunks.length; i++) {
    await client.chat.postMessage({ channel, text: chunks[i], thread_ts: threadTs });
  }
  return Math.max(lastSegment, chunks.length - 1);
}
