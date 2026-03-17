# 每日简报增加 Milestone 版本信息

## 概述

每日简报命令增加当前 GitLab milestone 的起止日期和描述信息，让团队一眼了解版本周期和目标。

## 改动范围

### 1. `src/services/gitlab.ts`

- `GitLabMilestone` 接口新增 `description: string | null` 字段
- `getLatestActiveMilestoneTitle()` → 重命名为 `getLatestActiveMilestone()`，返回 `GitLabMilestone`
- 新增 `getMilestoneByTitle(title: string): Promise<GitLabMilestone>` — 从活跃 milestones 按 title 查找，未找到时抛错

### 2. `src/commands/daily-report.ts`

- `generateDailyReport(title: string)` → `generateDailyReport(milestone: GitLabMilestone)`
- 标题行格式改为：`*每日简报 2026-03-17 (版本 10.32 | 03-03 ~ 03-17)*`
  - 无日期时：`*每日简报 2026-03-17 (版本 10.32 | 日期: 未设置)*`
- 标题下方新增一行：`描述: xxx` 或 `描述: (未设置)`
- `handleDailyReport`：无参时调用 `getLatestActiveMilestone()`，手动指定 title 时调用 `getMilestoneByTitle(title)`
- `handleResetDailyReport`：调用 `getLatestActiveMilestone()`

### 3. `src/scheduler/daily-report.ts`

- import 改为 `getLatestActiveMilestone`
- 调用改为 `const milestone = await getLatestActiveMilestone()`，传 `milestone` 给 `generateDailyReport`

## 输出示例

有完整信息时：

```
*每日简报 2026-03-17 (版本 10.32 | 03-03 ~ 03-17)*
描述: 新增PVP模式

*== 昨日进度 ==*
...
```

信息缺失时：

```
*每日简报 2026-03-17 (版本 10.32 | 日期: 未设置)*
描述: (未设置)

*== 当前状态 ==*
...
```

## 不变的部分

- 快照存储逻辑（仍以 milestone title 作为文件名 key）
- 昨日对比逻辑
- 未完成详情按 assignee 分组逻辑
- 调度触发逻辑
