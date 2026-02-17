import type { AppConfig } from './schema.js';

let config: AppConfig;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optional(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

function optionalInt(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) throw new Error(`Invalid integer for ${name}: ${value}`);
  return parsed;
}

function optionalBool(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

function parseJenkinsJobs(envValue: string | undefined): Record<string, string> {
  if (!envValue) {
    return {
      Patch: 'MyProject/Patch_Build',
      Release: 'MyProject/Release_Build',
    };
  }
  try {
    return JSON.parse(envValue);
  } catch {
    throw new Error(`Invalid JSON for JENKINS_JOBS: ${envValue}`);
  }
}

export function loadConfig(): AppConfig {
  config = {
    slack: {
      botToken: required('SLACK_BOT_TOKEN'),
      appToken: required('SLACK_APP_TOKEN'),
    },
    gitlab: {
      url: optional('GITLAB_URL', 'https://gitlab.example.com'),
      token: required('GITLAB_TOKEN'),
      defaultProjectId: optionalInt('GITLAB_DEFAULT_PROJECT_ID', 1),
    },
    jenkins: {
      url: optional('JENKINS_URL', 'https://jenkins.example.com'),
      user: required('JENKINS_USER'),
      token: required('JENKINS_TOKEN'),
      jobs: parseJenkinsJobs(process.env.JENKINS_JOBS),
    },
    claude: {
      command: optional('CLAUDE_COMMAND', 'claude'),
      timeoutMs: optionalInt('CLAUDE_TIMEOUT_MS', 300000),
    },
    webhook: {
      port: optionalInt('WEBHOOK_PORT', 4567),
      gitlabSecret: optional('GITLAB_WEBHOOK_SECRET', ''),
      notifyChannel: optional('WEBHOOK_NOTIFY_CHANNEL', '#dev-notifications'),
      events: {
        push: optionalBool('WEBHOOK_EVENT_PUSH', true),
        merge_request: optionalBool('WEBHOOK_EVENT_MERGE_REQUEST', true),
        pipeline: optionalBool('WEBHOOK_EVENT_PIPELINE', true),
        issue: optionalBool('WEBHOOK_EVENT_ISSUE', true),
        note: optionalBool('WEBHOOK_EVENT_NOTE', false),
      },
    },
  };

  return config;
}

export function getConfig(): AppConfig {
  if (!config) throw new Error('Config not loaded. Call loadConfig() first.');
  return config;
}
