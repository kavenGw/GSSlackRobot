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
      timeoutMs: optionalInt('CLAUDE_TIMEOUT_MS', 300000),
      anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL,
      anthropicAuthToken: process.env.ANTHROPIC_AUTH_TOKEN,
      projectDir: process.env.CLAUDE_PROJECT_DIR,
      dangerouslySkipPermissions: optionalBool('CLAUDE_DANGEROUSLY_SKIP_PERMISSIONS', false),
    },
  };

  validateConfig(config);

  return config;
}

export function getConfig(): AppConfig {
  if (!config) throw new Error('Config not loaded. Call loadConfig() first.');
  return config;
}
