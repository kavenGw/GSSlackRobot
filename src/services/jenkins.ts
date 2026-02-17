import { getConfig } from '../config/index.js';

function getAuth() {
  const cfg = getConfig().jenkins;
  return Buffer.from(`${cfg.user}:${cfg.token}`).toString('base64');
}

function getJobUrl(jobPath: string) {
  const cfg = getConfig().jenkins;
  return `${cfg.url}/job/${jobPath.replace(/\//g, '/job/')}`;
}

export async function triggerBuild(jobAlias: string) {
  const cfg = getConfig().jenkins;
  const jobPath = cfg.jobs[jobAlias];
  if (!jobPath) {
    const available = Object.keys(cfg.jobs).join(', ');
    throw new Error(`未知的 job alias: ${jobAlias}，可用: ${available}`);
  }

  const url = `${getJobUrl(jobPath)}/build`;
  const auth = getAuth();

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

export interface BuildResult {
  buildNumber: number;
  result: string;
  duration: number;
  consoleOutput: string;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getBuildNumberFromQueue(queueUrl: string): Promise<number> {
  const auth = getAuth();
  const apiUrl = queueUrl.endsWith('/') ? `${queueUrl}api/json` : `${queueUrl}/api/json`;

  for (let i = 0; i < 60; i++) {
    const res = await fetch(apiUrl, {
      headers: { Authorization: `Basic ${auth}` },
    });

    if (res.ok) {
      const data = await res.json() as { executable?: { number: number } };
      if (data.executable?.number) {
        return data.executable.number;
      }
    }

    await sleep(2000);
  }

  throw new Error('等待 Jenkins 构建启动超时');
}

async function waitForBuildCompletion(jobPath: string, buildNumber: number): Promise<BuildResult> {
  const auth = getAuth();
  const buildUrl = `${getJobUrl(jobPath)}/${buildNumber}/api/json`;

  for (let i = 0; i < 180; i++) {
    const res = await fetch(buildUrl, {
      headers: { Authorization: `Basic ${auth}` },
    });

    if (res.ok) {
      const data = await res.json() as {
        building: boolean;
        result: string | null;
        duration: number;
        number: number;
      };

      if (!data.building && data.result) {
        const consoleUrl = `${getJobUrl(jobPath)}/${buildNumber}/consoleText`;
        const consoleRes = await fetch(consoleUrl, {
          headers: { Authorization: `Basic ${auth}` },
        });

        const consoleOutput = consoleRes.ok ? await consoleRes.text() : '';

        return {
          buildNumber: data.number,
          result: data.result,
          duration: data.duration,
          consoleOutput,
        };
      }
    }

    await sleep(5000);
  }

  throw new Error('等待 Jenkins 构建完成超时');
}

export async function triggerBuildAndWait(jobAlias: string): Promise<BuildResult> {
  const cfg = getConfig().jenkins;
  const jobPath = cfg.jobs[jobAlias];
  if (!jobPath) {
    const available = Object.keys(cfg.jobs).join(', ');
    throw new Error(`未知的 job alias: ${jobAlias}，可用: ${available}`);
  }

  const { queueUrl } = await triggerBuild(jobAlias);
  if (!queueUrl) {
    throw new Error('无法获取 Jenkins 队列 URL');
  }

  const buildNumber = await getBuildNumberFromQueue(queueUrl);
  return await waitForBuildCompletion(jobPath, buildNumber);
}

export async function getLastBuildOutput(jobAlias: string): Promise<BuildResult | null> {
  const cfg = getConfig().jenkins;
  const jobPath = cfg.jobs[jobAlias];
  if (!jobPath) {
    return null;
  }

  const auth = getAuth();
  const lastBuildUrl = `${getJobUrl(jobPath)}/lastBuild/api/json`;

  const res = await fetch(lastBuildUrl, {
    headers: { Authorization: `Basic ${auth}` },
  });

  if (!res.ok) {
    return null;
  }

  const data = await res.json() as {
    building: boolean;
    result: string | null;
    duration: number;
    number: number;
  };

  if (data.building || !data.result) {
    return null;
  }

  const consoleUrl = `${getJobUrl(jobPath)}/${data.number}/consoleText`;
  const consoleRes = await fetch(consoleUrl, {
    headers: { Authorization: `Basic ${auth}` },
  });

  const consoleOutput = consoleRes.ok ? await consoleRes.text() : '';

  return {
    buildNumber: data.number,
    result: data.result,
    duration: data.duration,
    consoleOutput,
  };
}
