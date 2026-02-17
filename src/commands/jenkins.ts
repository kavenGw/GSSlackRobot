import type { CommandContext } from './index.js';
import { triggerBuild } from '../services/jenkins.js';

export async function handleJenkins({ match, say, threadTs }: CommandContext) {
  const alias = match[1];
  const result = await triggerBuild(alias);

  let text = `Jenkins 构建已触发: *${result.jobAlias}* (${result.jobPath})`;
  if (result.queueUrl) text += `\n队列: ${result.queueUrl}`;

  await say({ text, thread_ts: threadTs });
}
