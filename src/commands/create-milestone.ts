import { createMilestone, createIssue } from '../services/gitlab.js';
import { updateCommitMsg } from '../services/jenkins.js';
import { getConfig } from '../config/index.js';
import type { CommandContext } from './index.js';

const MISC_ISSUE_DESCRIPTION = `# 正式包

 1. 版本号（playersetting、jenkins）
 2. Android Bundle Version Code
 3. 充值测试
 4. 广告测试
 5. 对战测试
 6. GM开关
 7. 新手引导
 8. symbol.zip
 9. Gitlab备份
10. 翻译表&字体 繁体、英文、阿拉伯语验证
11. traiversion确认
12. Jenkins patch、打包提交的单号
13. 安装包大小: AAB(88822) APK(97104)

# SteamDemo包

1. 关卡解锁
2. steam id
3. 主界面愿望单按钮`;

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function handleCreateMilestone({ text, say, threadTs }: CommandContext) {
  const args = text.replace(/^create-milestone\s*/i, '').trim().split(/\s+/);
  const version = args[0];
  if (!version) {
    await say({ text: '用法: `create-milestone <版本号> [结束日期YYYY-MM-DD]`，例如: `create-milestone 10.32` 或 `create-milestone 10.32 2026-03-11`', thread_ts: threadTs });
    return;
  }

  const today = new Date();
  const startDate = formatDate(today);
  const dueDate = args[1] || formatDate(new Date(today.getTime() + 14 * 86400000));

  const results: string[] = [];

  const milestone = await createMilestone(version, startDate, dueDate);
  results.push(`Milestone: *${version}* (已创建, 起止: ${startDate} ~ ${dueDate})`);

  const issueTitle = `${version}杂项`;
  const issue = await createIssue(issueTitle, MISC_ISSUE_DESCRIPTION, milestone.id);
  results.push(`Issue: *#${issue.iid} ${issueTitle}* (已创建)`);

  if (getConfig().jenkins) {
    const commitMsg = `ref #${issue.iid} ${issueTitle}`;
    await updateCommitMsg(commitMsg);
    results.push(`Jenkins COMMIT_MSG: \`${commitMsg}\` (已修改)`);
  } else {
    results.push('Jenkins 未配置，跳过 COMMIT_MSG 修改');
  }

  await say({ text: results.join('\n'), thread_ts: threadTs });
}
