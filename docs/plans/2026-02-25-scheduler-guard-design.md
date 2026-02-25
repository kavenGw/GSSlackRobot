# 调度任务幂等守护设计

## 问题

jenkins-cron 在程序重启后会重复执行已过时间点的任务（`now >= target` 立即触发），缺少"今日已执行"检查。daily-report 虽有 `hasTodaySnapshot` 检查但属于业务层副产品，不具通用性。

## 方案

新增 `src/utils/scheduler-guard.ts`，提供通用的每日执行记录机制。

### 存储

`data/scheduler-state.json`，格式 `Record<string, string>`（taskKey → YYYY-MM-DD）。

### API

- `hasRunToday(taskKey: string): Promise<boolean>` — 检查 key 对应日期是否为今天
- `markRunToday(taskKey: string): Promise<void>` — 记录 key 今日已执行

文件不存在时视为从未执行。

### 改动

1. **新建** `src/utils/scheduler-guard.ts`
2. **修改** `src/scheduler/jenkins-cron.ts` — execute 前 `hasRunToday(jobName)`，执行后 `markRunToday(jobName)`
3. **修改** `src/scheduler/daily-report.ts` — 用 scheduler-guard 替代 `hasTodaySnapshot` 调用
4. **删除** `src/commands/daily-report.ts` 中的 `hasTodaySnapshot` 函数
