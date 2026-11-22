import { query, type Options, type SDKMessage, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { getConfig } from '../config/index.js';
import { nextWithTimeout, TIMEOUT } from '../utils/async.js';

const END_TURN_GRACE_MS = 30_000;

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

export interface ClaudeSessionMeta {
  model: string;
  effort: string;
}

export async function* askClaude(
  text: string,
  images: ClaudeImage[] = [],
  sessionId?: string,
  resume = false,
  abortController?: AbortController,
  onSession?: (id: string, meta: ClaudeSessionMeta) => Promise<void>,
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
    // user 启用 ~/.claude 已安装插件，project 启用工作目录 .claude/skills 的项目 skill；
    // 缺任一来源，对应的 /skill 会返回 Unknown skill
    settingSources: ['user', 'project'],
    abortController,
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
  const iterator: AsyncIterator<SDKMessage> = conversation[Symbol.asyncIterator]();
  const idleMs = cfg.idleTimeoutMin * 60_000;
  let hasContent = false;
  let turnEnded = false;

  try {
    while (true) {
      // end_turn 后 SDK 会等后台任务（如超时转后台的 Bash）结束才发 result，宽限期后主动关闭
      const next: IteratorResult<SDKMessage> | typeof TIMEOUT = await nextWithTimeout(iterator, turnEnded ? END_TURN_GRACE_MS : idleMs);
      if (next === TIMEOUT) {
        if (turnEnded) {
          yield '\n\n_（后台任务未结束，已终止）_';
          return;
        }
        throw new Error(`Claude ${cfg.idleTimeoutMin} 分钟无响应，已终止`);
      }
      if (next.done) break;
      const message: SDKMessage = next.value;
      if (message.type === 'system' && message.subtype === 'init') {
        await onSession?.(message.session_id, {
          model: message.model,
          effort: message.effort ?? process.env.CLAUDE_CODE_EFFORT_LEVEL ?? '默认',
        });
      }
      if (message.type === 'stream_event') {
        turnEnded = false;
        const event = message.event;
        if (event.type === 'content_block_start' && event.content_block.type === 'text' && hasContent) {
          yield '\n\n';
        } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          hasContent = true;
          yield event.delta.text;
        }
      } else if (message.type === 'assistant' && message.parent_tool_use_id === null) {
        turnEnded = message.message.stop_reason === 'end_turn';
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
