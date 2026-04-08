import { query, type Options } from '@anthropic-ai/claude-agent-sdk';
import { getConfig } from '../config/index.js';
import { getClaudeSettings } from './settings.js';

const MODEL_MAP: Record<string, string> = {
  opus: 'claude-opus-4-6',
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5',
};

function resolveModel(shortName: string): string {
  return MODEL_MAP[shortName] ?? shortName;
}

export async function* askClaude(prompt: string, sessionId?: string, resume = false, model?: string, effort?: string): AsyncGenerator<string> {
  const cfg = getConfig().claude;
  const env: Record<string, string | undefined> = { ...process.env };
  if (cfg.anthropicBaseUrl) {
    env.ANTHROPIC_BASE_URL = cfg.anthropicBaseUrl;
  }
  if (cfg.anthropicAuthToken) {
    env.ANTHROPIC_AUTH_TOKEN = cfg.anthropicAuthToken;
  }
  if (cfg.httpProxy) {
    env.http_proxy = cfg.httpProxy;
  }
  if (cfg.httpsProxy) {
    env.https_proxy = cfg.httpsProxy;
  }

  const claudeSettings = getClaudeSettings();
  const options: Options = {
    model: resolveModel(model ?? claudeSettings.model),
    effort: (effort ?? claudeSettings.effort) as Options['effort'],
    env,
    includePartialMessages: true,
  };

  if (cfg.projectDir) {
    options.cwd = cfg.projectDir;
  }
  if (sessionId) {
    if (resume) {
      options.resume = sessionId;
    } else {
      options.sessionId = sessionId;
    }
  }
  if (cfg.dangerouslySkipPermissions) {
    options.permissionMode = 'bypassPermissions';
    options.allowDangerouslySkipPermissions = true;
  }

  const conversation = query({ prompt, options });
  let hasContent = false;

  try {
    for await (const message of conversation) {
      if (message.type === 'stream_event' && message.event.type === 'content_block_delta') {
        const delta = message.event.delta;
        if (delta.type === 'text_delta') {
          hasContent = true;
          yield delta.text;
        }
      } else if (message.type === 'result') {
        if (message.subtype === 'success') {
          if (!hasContent) {
            yield message.result;
          }
        } else {
          throw new Error(message.errors[0] ?? `Claude SDK error: ${message.subtype}`);
        }
      }
    }
  } finally {
    conversation.close();
  }
}
