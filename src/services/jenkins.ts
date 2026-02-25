import { getConfig } from '../config/index.js';

export async function updateCommitMsg(value: string): Promise<string> {
  const cfg = getConfig().jenkins;
  if (!cfg) throw new Error('Jenkins 未配置');

  const script = `
import jenkins.model.*
import hudson.slaves.EnvironmentVariablesNodeProperty

def instance = Jenkins.getInstance()
def globalNodeProperties = instance.getGlobalNodeProperties()
def envVars = globalNodeProperties.getAll(EnvironmentVariablesNodeProperty.class)

def newValue = "${value.replace(/"/g, '\\"')}"

if (envVars.size() > 0) {
    envVars.get(0).getEnvVars().put('COMMIT_MSG', newValue)
} else {
    globalNodeProperties.add(new EnvironmentVariablesNodeProperty(
        new EnvironmentVariablesNodeProperty.Entry('COMMIT_MSG', newValue)
    ))
}
instance.save()
println('COMMIT_MSG updated to: ' + newValue)
`.trim();

  const auth = Buffer.from(`${cfg.username}:${cfg.apiToken}`).toString('base64');
  const res = await fetch(`${cfg.url}/scriptText`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `script=${encodeURIComponent(script)}`,
  });

  if (!res.ok) throw new Error(`Jenkins API ${res.status}: ${await res.text()}`);
  const result = await res.text();
  if (!result.includes('COMMIT_MSG updated to')) {
    throw new Error(`Jenkins 返回异常: ${result}`);
  }
  return result.trim();
}

export async function triggerJob(jobName: string): Promise<void> {
  const cfg = getConfig().jenkins;
  if (!cfg) throw new Error('Jenkins 未配置');

  const auth = Buffer.from(`${cfg.username}:${cfg.apiToken}`).toString('base64');
  const jobPath = jobName.split('/').map(encodeURIComponent).join('/job/');
  const res = await fetch(`${cfg.url}/job/${jobPath}/build`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
    },
  });

  if (!res.ok) throw new Error(`Jenkins trigger ${jobName} failed: ${res.status} ${await res.text()}`);
}
