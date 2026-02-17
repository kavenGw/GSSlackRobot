import { getConfig } from '../config/index.js';

export async function triggerBuild(jobAlias: string) {
  const cfg = getConfig().jenkins;
  const jobPath = cfg.jobs[jobAlias];
  if (!jobPath) {
    const available = Object.keys(cfg.jobs).join(', ');
    throw new Error(`未知的 job alias: ${jobAlias}，可用: ${available}`);
  }

  const url = `${cfg.url}/job/${jobPath.replace(/\//g, '/job/')}/build`;
  const auth = Buffer.from(`${cfg.user}:${cfg.token}`).toString('base64');

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}` },
  });

  if (!res.ok && res.status !== 201) {
    throw new Error(`Jenkins API error: ${res.status} ${await res.text()}`);
  }

  const queueUrl = res.headers.get('Location');
  return { jobAlias, jobPath, queueUrl };
}
