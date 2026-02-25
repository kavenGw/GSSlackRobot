import { getConfig } from '../config/index.js';
import { triggerJob } from '../services/jenkins.js';
import { hasRunToday, markRunToday } from '../utils/scheduler-guard.js';
import { log } from '../utils/logger.js';

export async function scheduleJenkinsCronJobs() {
  const cfg = getConfig();
  if (!cfg.jenkins?.cronJobs?.length) return;

  for (const job of cfg.jenkins.cronJobs) {
    const now = new Date();
    const target = new Date(now);
    target.setHours(job.hour, job.minute, 0, 0);

    const execute = async () => {
      try {
        await triggerJob(job.jobName);
        await markRunToday(job.jobName);
        log.info(`jenkins-cron: ${job.jobName} 已触发`);
      } catch (err) {
        log.error(`jenkins-cron: ${job.jobName} 触发失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    };

    if (now >= target) {
      if (await hasRunToday(job.jobName)) {
        log.info(`jenkins-cron: ${job.jobName} 今天已执行，跳过`);
      } else {
        log.info(`jenkins-cron: ${job.jobName} 已过 ${job.hour}:${String(job.minute).padStart(2, '0')}，立即执行`);
        await execute();
      }
    } else {
      const delay = target.getTime() - now.getTime();
      log.info(`jenkins-cron: ${job.jobName} 将在 ${Math.round(delay / 60000)} 分钟后执行`);
      setTimeout(execute, delay);
    }
  }
}
