import type { CommandContext } from './index.js';
import { triggerBuildAndWait, getLastBuildOutput, type BuildResult } from '../services/jenkins.js';
import { getMilestoneIssues, getActiveMilestones } from '../services/gitlab.js';
import { brainstorm } from '../services/claude.js';
import { splitToBlocks } from '../utils/message.js';

const THROTTLE_MS = 500;
const MAX_MSG_LEN = 3800;
const JENKINS_JOB_ALIAS = 'GetPlayfabData';

export async function handleDailyReport({ match, channel, threadTs, client, say }: CommandContext) {
  const milestoneTitle = match[1]?.trim();

  // 发初始消息
  const initial = await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: ':hourglass_flowing_sand: 正在生成每日简报...',
  });
  const msgTs = initial.ts!;

  const updateMessage = async (text: string) => {
    await client.chat.update({
      channel,
      ts: msgTs,
      text,
    });
  };

  try {
    // Step 1: 执行 Jenkins GetPlayfabData job
    await updateMessage(':gear: 正在执行 Jenkins GetPlayfabData 任务...');

    let buildResult: BuildResult | null = null;
    try {
      buildResult = await triggerBuildAndWait(JENKINS_JOB_ALIAS);
    } catch (err) {
      // 如果触发失败，尝试获取最近一次构建的输出
      await updateMessage(':warning: 无法触发新构建，尝试获取最近构建数据...');
      buildResult = await getLastBuildOutput(JENKINS_JOB_ALIAS);
    }

    if (!buildResult) {
      throw new Error(`无法获取 ${JENKINS_JOB_ALIAS} 构建数据`);
    }

    const playfabData = buildResult.consoleOutput;

    // Step 2: 获取 GitLab 版本状态
    await updateMessage(':mag: 正在获取 GitLab 版本状态...');

    let gitlabStatus = '';
    try {
      let targetMilestone = milestoneTitle;

      // 如果没有指定 milestone，获取当前活跃的 milestone
      if (!targetMilestone) {
        const activeMilestones = await getActiveMilestones();
        if (activeMilestones.length > 0) {
          targetMilestone = activeMilestones[0].title;
        }
      }

      if (targetMilestone) {
        const { milestone, closed, opened, total } = await getMilestoneIssues(targetMilestone);
        const completionRate = total > 0 ? ((closed.length / total) * 100).toFixed(1) : '0';

        gitlabStatus = `## GitLab 版本状态: ${milestone.title}\n`;
        gitlabStatus += `- 完成进度: ${closed.length}/${total} (${completionRate}%)\n`;
        gitlabStatus += `- 已完成: ${closed.length} 个单子\n`;
        gitlabStatus += `- 进行中: ${opened.length} 个单子\n\n`;

        if (opened.length > 0) {
          gitlabStatus += `### 进行中的单子:\n`;
          for (const issue of opened.slice(0, 10)) {
            const assignee = issue.assignee?.name || '未分配';
            gitlabStatus += `- #${issue.iid}: ${issue.title} (${assignee})\n`;
          }
          if (opened.length > 10) {
            gitlabStatus += `- ... 还有 ${opened.length - 10} 个单子\n`;
          }
        }
      } else {
        gitlabStatus = '未找到活跃的 milestone\n';
      }
    } catch (err) {
      gitlabStatus = `获取 GitLab 状态失败: ${err instanceof Error ? err.message : String(err)}\n`;
    }

    // Step 3: 使用 Claude 分析数据
    await updateMessage(':brain: 正在使用 Claude 分析数据...');

    const analysisPrompt = `你是一个项目数据分析助手。请根据以下数据生成一份简洁的每日简报。

## PlayFab 数据 (来自 Jenkins 构建输出):
\`\`\`
${playfabData.slice(-8000)}
\`\`\`

## GitLab 版本进度:
${gitlabStatus}

请生成一份简洁的每日简报，包含:
1. 关键数据指标摘要（如果 PlayFab 数据中包含玩家活跃数、收入等数据）
2. 版本开发进度总结
3. 需要关注的风险或问题（如果有）
4. 今日建议事项

请用中文回答，保持简洁明了。`;

    let analysisContent = '';
    let lastUpdate = 0;

    const flushAnalysis = async (final = false) => {
      const now = Date.now();
      if (!final && now - lastUpdate < THROTTLE_MS) return;
      lastUpdate = now;

      const displayText = analysisContent || ':brain: 正在分析中...';

      if (displayText.length <= MAX_MSG_LEN) {
        await client.chat.update({
          channel,
          ts: msgTs,
          text: `:clipboard: *每日简报*\n\n${displayText}`,
        });
      } else {
        const chunks = splitToBlocks(displayText);
        await client.chat.update({
          channel,
          ts: msgTs,
          text: `:clipboard: *每日简报*\n\n${chunks[0]}`,
        });

        for (let i = 1; i < chunks.length; i++) {
          await client.chat.postMessage({
            channel,
            thread_ts: threadTs,
            text: chunks[i],
          });
        }
      }
    };

    for await (const chunk of brainstorm(analysisPrompt)) {
      analysisContent += chunk;
      await flushAnalysis();
    }

    await flushAnalysis(true);

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await updateMessage(`:x: 生成每日简报失败: ${errMsg}`);
  }
}
