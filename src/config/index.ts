import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';
import merge from 'lodash.merge';
import type { AppConfig, ChannelOverride } from './schema.js';

let config: AppConfig;

function loadYaml(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) return {};
  return yaml.load(readFileSync(filePath, 'utf8')) as Record<string, unknown>;
}

export function loadConfig(): AppConfig {
  const root = resolve(import.meta.dirname, '../../');
  const defaults = loadYaml(resolve(root, 'config/default.yaml'));
  const local = loadYaml(resolve(root, 'config/local.yaml'));

  const merged = merge({}, defaults, local) as unknown as AppConfig;

  // 环境变量覆盖敏感值
  const env = process.env;
  if (env.SLACK_BOT_TOKEN) merged.slack.botToken = env.SLACK_BOT_TOKEN;
  if (env.SLACK_APP_TOKEN) merged.slack.appToken = env.SLACK_APP_TOKEN;
  if (env.GITLAB_TOKEN) merged.gitlab.token = env.GITLAB_TOKEN;
  if (env.JENKINS_USER) merged.jenkins.user = env.JENKINS_USER;
  if (env.JENKINS_TOKEN) merged.jenkins.token = env.JENKINS_TOKEN;
  if (env.GITLAB_WEBHOOK_SECRET) merged.webhook.gitlabSecret = env.GITLAB_WEBHOOK_SECRET;

  config = merged;
  return config;
}

export function getConfig(): AppConfig {
  if (!config) throw new Error('Config not loaded. Call loadConfig() first.');
  return config;
}

export function getChannelConfig(channelId: string): AppConfig {
  const base = getConfig();
  const override = base.channels?.[channelId];
  if (!override) return base;
  return merge({}, base, override) as AppConfig;
}
