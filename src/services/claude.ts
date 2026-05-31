import { query, type Options, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { getConfig } from '../config/index.js';

export type ClaudeImageMediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

export interface ClaudeImage {
  data: string;
  mediaType: ClaudeImageMediaType;
}

async function* buildMultimodalPrompt(
  text: string,
  images: ClaudeImage[],
  sessionId: string,
): AsyncIterable<SDKUserMessage> {
  yield {
    type: 'user',
    parent_tool_use_id: null,
    session_id: sessionId,
    message: {
      role: 'user',
      content: [
        { type: 'text', text },
        ...images.map(img => ({
          type: 'image' as const,
          source: { type: 'base64' as const, media_type: img.mediaType, data: img.data },
        })),
      ],
    },
  };
}

export async function* askClaude(
  text: string,
  images: ClaudeImage[] = [],
  sessionId?: string,
  resume = false,
): AsyncGenerator<string> {
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

  const options: Options = {
    env,
    includePartialMessages: true,
    // 加载 user 级设置以启用 ~/.claude 已安装插件（含 superpowers），
    // 否则 SDK 处于隔离模式，/superpowers:xxx 会返回 Unknown skill
    settingSources: ['user'],
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

  const prompt =
    images.length && sessionId
      ? buildMultimodalPrompt(text, images, sessionId)
      : text;

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
