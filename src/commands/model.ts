import type { CommandContext } from './index.js';
import {
  getClaudeSettings, updateClaudeModel, updateClaudeEffort,
  isValidModel, isValidEffort,
  CLAUDE_MODELS, EFFORT_LEVELS,
  type ClaudeModel, type EffortLevel,
} from '../services/settings.js';

function validateMaxEffort(model: ClaudeModel, effort: EffortLevel): string | null {
  if (effort === 'max' && model !== 'opus') {
    return '`max` effort 仅 opus 模型可用';
  }
  return null;
}

export async function handleModel({ text, say, threadTs }: CommandContext) {
  const parts = text.replace(/^model\s*/i, '').trim().toLowerCase().split(/\s+/);

  if (!parts[0]) {
    const s = getClaudeSettings();
    await say({ text: `当前模型: *${s.model}* | effort: *${s.effort}*`, thread_ts: threadTs });
    return;
  }

  const modelArg = parts[0];
  const effortArg = parts[1];

  if (!isValidModel(modelArg)) {
    await say({ text: `无效模型 \`${modelArg}\`，可选: ${CLAUDE_MODELS.join(', ')}`, thread_ts: threadTs });
    return;
  }

  if (effortArg && !isValidEffort(effortArg)) {
    await say({ text: `无效 effort \`${effortArg}\`，可选: ${EFFORT_LEVELS.join(', ')}`, thread_ts: threadTs });
    return;
  }

  const effort = effortArg as EffortLevel | undefined;
  const errMsg = validateMaxEffort(modelArg, effort ?? getClaudeSettings().effort);
  if (errMsg) {
    await say({ text: errMsg, thread_ts: threadTs });
    return;
  }

  await updateClaudeModel(modelArg, effort);
  const s = getClaudeSettings();
  await say({ text: `已切换 → 模型: *${s.model}* | effort: *${s.effort}*`, thread_ts: threadTs });
}

export async function handleEffort({ text, say, threadTs }: CommandContext) {
  const effortArg = text.replace(/^effort\s*/i, '').trim().toLowerCase();

  if (!effortArg) {
    const s = getClaudeSettings();
    await say({ text: `当前 effort: *${s.effort}*`, thread_ts: threadTs });
    return;
  }

  if (!isValidEffort(effortArg)) {
    await say({ text: `无效 effort \`${effortArg}\`，可选: ${EFFORT_LEVELS.join(', ')}`, thread_ts: threadTs });
    return;
  }

  const errMsg = validateMaxEffort(getClaudeSettings().model, effortArg);
  if (errMsg) {
    await say({ text: errMsg, thread_ts: threadTs });
    return;
  }

  await updateClaudeEffort(effortArg);
  await say({ text: `已切换 effort → *${effortArg}*`, thread_ts: threadTs });
}
