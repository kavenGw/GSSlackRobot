import type { AppConfig } from './schema.js';
import { validateConfig, validateRequiredEnvVars, EnvValidationError } from './env-validator.js';

export { EnvValidationError } from './env-validator.js';

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

export function loadConfig(): AppConfig {
  validateRequiredEnvVars();

  config = {
    slack: {
      botToken: required('SLACK_BOT_TOKEN'),
      appToken: required('SLACK_APP_TOKEN'),
    },
    claude: {
      command: optional('CLAUDE_COMMAND', 'claude'),
      anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL,
      anthropicAuthToken: process.env.ANTHROPIC_AUTH_TOKEN,
      projectDir: process.env.CLAUDE_PROJECT_DIR,
      dangerouslySkipPermissions: optionalBool('CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS', false),
      httpProxy: process.env.CLAUDE_HTTP_PROXY,
      httpsProxy: process.env.CLAUDE_HTTPS_PROXY,
    },
    gitlabNotify: process.env.GITLAB_NOTIFY_CHANNEL ? {
      port: optionalInt('GITLAB_WEBHOOK_PORT', 3000),
      secret: optional('GITLAB_WEBHOOK_SECRET', ''),
      channel: required('GITLAB_NOTIFY_CHANNEL'),
      events: {
        push: optionalBool('GITLAB_EVENTS_PUSH', true),
        mr: optionalBool('GITLAB_EVENTS_MR', true),
        pipeline: optionalBool('GITLAB_EVENTS_PIPELINE', true),
        issue: optionalBool('GITLAB_EVENTS_ISSUE', true),
        note: optionalBool('GITLAB_EVENTS_NOTE', true),
      },
    } : undefined,
    gitlab: process.env.GITLAB_API_URL && process.env.GITLAB_TOKEN && process.env.GITLAB_PROJECT_ID ? {
      apiUrl: process.env.GITLAB_API_URL,
      token: process.env.GITLAB_TOKEN,
      projectId: process.env.GITLAB_PROJECT_ID,
    } : undefined,
    jenkins: process.env.JENKINS_URL && process.env.JENKINS_USERNAME && process.env.JENKINS_API_TOKEN ? {
      url: process.env.JENKINS_URL,
      username: process.env.JENKINS_USERNAME,
      apiToken: process.env.JENKINS_API_TOKEN,
      cronJobs: process.env.JENKINS_CRON_JOBS
        ? process.env.JENKINS_CRON_JOBS.split(',').map(entry => {
            const match = entry.trim().match(/^(.+)\s+(\d{1,2}):(\d{2})$/);
            if (!match) throw new Error(`JENKINS_CRON_JOBS 格式无效: "${entry.trim()}"，期望: "JobName HH:MM"`);
            return { jobName: match[1].trim(), hour: Number(match[2]), minute: Number(match[3]) };
          })
        : undefined,
    } : undefined,
    gemini: process.env.GEMINI_API_KEY ? {
      apiKey: process.env.GEMINI_API_KEY,
      model: optional('GEMINI_MODEL', 'gemini-2.0-flash'),
      imageModel: optional('GEMINI_IMAGE_MODEL', 'gemini-3-pro-image-preview'),
    } : undefined,
  };

  validateConfig(config);

  return config;
}

export function getConfig(): AppConfig {
  if (!config) throw new Error('Config not loaded. Call loadConfig() first.');
  return config;
}
