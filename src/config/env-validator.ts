import type { AppConfig } from './schema.js';

export interface ValidationError {
  param: string;
  message: string;
  value?: string;
}

export class EnvValidationError extends Error {
  public readonly errors: ValidationError[];

  constructor(errors: ValidationError[]) {
    const message = formatValidationErrors(errors);
    super(message);
    this.name = 'EnvValidationError';
    this.errors = errors;
  }
}

function formatValidationErrors(errors: ValidationError[]): string {
  const lines = [
    '',
    '╔══════════════════════════════════════════════════════════════════╗',
    '║          ENVIRONMENT VALIDATION FAILED                          ║',
    '╚══════════════════════════════════════════════════════════════════╝',
    '',
    `Found ${errors.length} validation error(s):`,
    '',
  ];

  errors.forEach((err, index) => {
    lines.push(`  ${index + 1}. [${err.param}]`);
    lines.push(`     ${err.message}`);
    if (err.value !== undefined) {
      const displayValue = err.value.length > 50
        ? err.value.substring(0, 47) + '...'
        : err.value;
      lines.push(`     Current value: "${displayValue}"`);
    }
    lines.push('');
  });

  lines.push('Please check your environment variables and try again.');
  lines.push('');

  return lines.join('\n');
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function isValidToken(token: string): boolean {
  if (typeof token !== 'string' || token.trim().length === 0) return false;

  const placeholders = [
    'your_token_here',
    'your-token-here',
    'xxx',
    'placeholder',
    '<token>',
    '${',
    'TODO',
    'FIXME',
  ];

  const lowerToken = token.toLowerCase();
  return !placeholders.some(p => lowerToken.includes(p.toLowerCase()));
}

export function validateConfig(config: AppConfig): void {
  const errors: ValidationError[] = [];

  // Slack validation
  if (!config.slack.botToken || !config.slack.botToken.trim()) {
    errors.push({
      param: 'SLACK_BOT_TOKEN',
      message: 'Slack Bot Token is required and cannot be empty',
    });
  } else if (!config.slack.botToken.startsWith('xoxb-')) {
    errors.push({
      param: 'SLACK_BOT_TOKEN',
      message: 'Slack Bot Token should start with "xoxb-"',
      value: config.slack.botToken.substring(0, 10) + '***',
    });
  }

  if (!config.slack.appToken || !config.slack.appToken.trim()) {
    errors.push({
      param: 'SLACK_APP_TOKEN',
      message: 'Slack App Token is required and cannot be empty',
    });
  } else if (!config.slack.appToken.startsWith('xapp-')) {
    errors.push({
      param: 'SLACK_APP_TOKEN',
      message: 'Slack App Token should start with "xapp-"',
      value: config.slack.appToken.substring(0, 10) + '***',
    });
  }

  // Claude validation
  if (config.claude.anthropicBaseUrl !== undefined &&
      config.claude.anthropicBaseUrl !== '' &&
      !isValidUrl(config.claude.anthropicBaseUrl)) {
    errors.push({
      param: 'ANTHROPIC_BASE_URL',
      message: 'Anthropic Base URL must be a valid HTTP/HTTPS URL if provided',
      value: config.claude.anthropicBaseUrl,
    });
  }

  if (config.claude.anthropicAuthToken !== undefined &&
      config.claude.anthropicAuthToken !== '' &&
      !isValidToken(config.claude.anthropicAuthToken)) {
    errors.push({
      param: 'ANTHROPIC_AUTH_TOKEN',
      message: 'Anthropic Auth Token cannot be a placeholder value if provided',
    });
  }

  if (config.gitlabNotify) {
    if (config.gitlabNotify.port < 1 || config.gitlabNotify.port > 65535) {
      errors.push({
        param: 'GITLAB_WEBHOOK_PORT',
        message: 'Webhook port must be between 1 and 65535',
        value: String(config.gitlabNotify.port),
      });
    }
    if (!config.gitlabNotify.channel.trim()) {
      errors.push({
        param: 'GITLAB_NOTIFY_CHANNEL',
        message: 'GitLab notify channel cannot be empty',
      });
    }
  }

  if (config.gitlab) {
    if (!isValidUrl(config.gitlab.apiUrl)) {
      errors.push({
        param: 'GITLAB_API_URL',
        message: 'GitLab API URL must be a valid HTTP/HTTPS URL',
        value: config.gitlab.apiUrl,
      });
    }
    if (!isValidToken(config.gitlab.token)) {
      errors.push({
        param: 'GITLAB_TOKEN',
        message: 'GitLab Token cannot be a placeholder value',
      });
    }
  }

  if (config.jenkins) {
    if (!isValidUrl(config.jenkins.url)) {
      errors.push({
        param: 'JENKINS_URL',
        message: 'Jenkins URL must be a valid HTTP/HTTPS URL',
        value: config.jenkins.url,
      });
    }
  }

  if (config.jenkins?.cronJobs) {
    for (const job of config.jenkins.cronJobs) {
      if (!job.jobName || !job.jobName.trim()) {
        errors.push({
          param: 'JENKINS_CRON_JOBS',
          message: 'Job name cannot be empty',
        });
        continue;
      }
      if (isNaN(job.hour) || job.hour < 0 || job.hour > 23 ||
          isNaN(job.minute) || job.minute < 0 || job.minute > 59) {
        errors.push({
          param: 'JENKINS_CRON_JOBS',
          message: `Invalid time for job "${job.jobName}": hour must be 0-23, minute must be 0-59`,
          value: `${job.hour}:${job.minute}`,
        });
      }
    }
  }

  if (errors.length > 0) {
    throw new EnvValidationError(errors);
  }
}

export function validateRequiredEnvVars(): void {
  const requiredVars = [
    'SLACK_BOT_TOKEN',
    'SLACK_APP_TOKEN',
  ];

  const missing = requiredVars.filter(v => !process.env[v]);

  if (missing.length > 0) {
    const errors: ValidationError[] = missing.map(param => ({
      param,
      message: `Required environment variable is not set`,
    }));
    throw new EnvValidationError(errors);
  }
}
