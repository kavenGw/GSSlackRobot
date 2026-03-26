import type { App } from '@slack/bolt';
import { getConfig } from '../config/index.js';
import { generateDailyReport } from '../commands/daily-report.js';
import { getLatestActiveMilestone } from '../services/gitlab.js';
import { hasRunToday, markRunToday } from '../utils/scheduler-guard.js';
import { safePost } from '../utils/message.js';
import { log } from '../utils/logger.js';

export function scheduleDailyReport(slackApp: App) {
  const cfg = getConfig();
  if (!cfg.gitlab || !cfg.gitlabNotify) return;
  const channel = cfg.gitlabNotify.channel;

  async function execute() {
    try {
      if (await hasRunToday('daily-report')) {
        log.info('daily-report 今天已执行，跳过');
        return;
      }
      const milestone = await getLatestActiveMilestone();
      const report = await generateDailyReport(milestone);
      await safePost(slackApp.client, channel, report);
      await markRunToday('daily-report');
      log.info('daily-report 已发送');
    } catch (err) {
      log.error(`daily-report 调度失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const now = new Date();
  const nine = new Date(now);
  nine.setHours(9, 0, 0, 0);

  if (now >= nine) {
    execute();
  } else {
    const delay = nine.getTime() - now.getTime();
    log.info(`daily-report 将在 ${Math.round(delay / 60000)} 分钟后执行`);
    setTimeout(execute, delay);
  }
}
