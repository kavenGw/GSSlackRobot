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
  // First validate that required environment variables exist
  validateRequiredEnvVars();

  config = {
    slack: {
      botToken: required('SLACK_BOT_TOKEN'),
      appToken: required('SLACK_APP_TOKEN'),
    },
    gitlab: {
      url: optional('GITLAB_URL', 'https://gitlab.example.com'),
      token: required('GITLAB_TOKEN'),
      defaultProject: optional('GITLAB_DEFAULT_PROJECT', 'namespace/project'),
      notify: {
        port: optionalInt('GITLAB_NOTIFY_PORT', 4567),
        secret: optional('GITLAB_NOTIFY_SECRET', ''),
        channel: optional('GITLAB_NOTIFY_CHANNEL', '#dev-notifications'),
        events: {
          push: optionalBool('GITLAB_NOTIFY_PUSH', true),
          mr: optionalBool('GITLAB_NOTIFY_MR', true),
          pipeline: optionalBool('GITLAB_NOTIFY_PIPELINE', true),
          issue: optionalBool('GITLAB_NOTIFY_ISSUE', true),
          note: optionalBool('GITLAB_NOTIFY_NOTE', false),
        },
      },
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
      anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL,
      anthropicAuthToken: process.env.ANTHROPIC_AUTH_TOKEN,
      projectDir: process.env.CLAUDE_PROJECT_DIR,
      dangerouslySkipPermissions: optionalBool('CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS', false),
    },
  };

  // Validate all config values for correctness
  validateConfig(config);

  return config;
}

export function getConfig(): AppConfig {
  if (!config) throw new Error('Config not loaded. Call loadConfig() first.');
  return config;
}
