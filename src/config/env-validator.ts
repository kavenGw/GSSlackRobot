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

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

function isValidToken(token: string): boolean {
  // Token should not be empty, whitespace-only, or contain obvious placeholders
  if (!isNonEmptyString(token)) return false;

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
  if (!isNonEmptyString(config.slack.botToken)) {
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

  if (!isNonEmptyString(config.slack.appToken)) {
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

  // GitLab validation
  if (!isValidUrl(config.gitlab.url)) {
    errors.push({
      param: 'GITLAB_URL',
      message: 'GitLab URL must be a valid HTTP/HTTPS URL',
      value: config.gitlab.url,
    });
  }

  if (!isValidToken(config.gitlab.token)) {
    errors.push({
      param: 'GITLAB_TOKEN',
      message: 'GitLab Token is required and cannot be a placeholder value',
    });
  }

  if (config.gitlab.defaultProjectId <= 0) {
    errors.push({
      param: 'GITLAB_DEFAULT_PROJECT_ID',
      message: 'GitLab Default Project ID must be a positive integer',
      value: String(config.gitlab.defaultProjectId),
    });
  }

  // Jenkins validation
  if (!isValidUrl(config.jenkins.url)) {
    errors.push({
      param: 'JENKINS_URL',
      message: 'Jenkins URL must be a valid HTTP/HTTPS URL',
      value: config.jenkins.url,
    });
  }

  if (!isNonEmptyString(config.jenkins.user)) {
    errors.push({
      param: 'JENKINS_USER',
      message: 'Jenkins User is required and cannot be empty',
    });
  }

  if (!isValidToken(config.jenkins.token)) {
    errors.push({
      param: 'JENKINS_TOKEN',
      message: 'Jenkins Token is required and cannot be a placeholder value',
    });
  }

  if (Object.keys(config.jenkins.jobs).length === 0) {
    errors.push({
      param: 'JENKINS_JOBS',
      message: 'At least one Jenkins job must be configured',
    });
  }

  // Claude validation (optional but if provided, must be valid)
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

  if (config.claude.timeoutMs <= 0) {
    errors.push({
      param: 'CLAUDE_TIMEOUT_MS',
      message: 'Claude timeout must be a positive number (milliseconds)',
      value: String(config.claude.timeoutMs),
    });
  }

  if (config.claude.timeoutMs > 3600000) {
    errors.push({
      param: 'CLAUDE_TIMEOUT_MS',
      message: 'Claude timeout cannot exceed 1 hour (3600000ms)',
      value: String(config.claude.timeoutMs),
    });
  }

  // Webhook validation
  if (!isValidPort(config.webhook.port)) {
    errors.push({
      param: 'WEBHOOK_PORT',
      message: 'Webhook port must be a valid port number (1-65535)',
      value: String(config.webhook.port),
    });
  }

  // If any errors found, throw exception
  if (errors.length > 0) {
    throw new EnvValidationError(errors);
  }
}

export function validateRequiredEnvVars(): void {
  const requiredVars = [
    'SLACK_BOT_TOKEN',
    'SLACK_APP_TOKEN',
    'GITLAB_TOKEN',
    'JENKINS_USER',
    'JENKINS_TOKEN',
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
