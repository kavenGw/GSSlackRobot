# Jenkins 定时任务设计

## 概述

支持通过环境变量配置 Jenkins Job 的定时触发，复用 daily-report 的 setTimeout 调度模式。

## 环境变量

新增 `JENKINS_CRON_JOBS`，格式：`JobName HH:MM[,JobName2 HH:MM]`

```
JENKINS_CRON_JOBS=FetchAllStatistics 14:00,BuildReport 18:30
```

启用条件：Jenkins 三个必填变量 + `JENKINS_CRON_JOBS` 同时存在。

## 变更清单

### 1. schema.ts

`JenkinsConfig` 新增字段：

```typescript
cronJobs?: { jobName: string; hour: number; minute: number }[]
```

### 2. config/index.ts

解析 `JENKINS_CRON_JOBS`：按逗号分割，每项按空格分割为 jobName 和 HH:MM，再拆为 hour/minute。

### 3. env-validator.ts

验证 `JENKINS_CRON_JOBS` 每项格式：
- jobName 非空
- HH:MM 格式合法（0-23:0-59）

### 4. services/jenkins.ts

新增 `triggerJob(jobName: string): Promise<void>`：
- `POST ${url}/job/${jobName}/build`
- Basic Auth 认证

### 5. scheduler/jenkins-cron.ts（新文件）

导出 `scheduleJenkinsCronJobs()`：
- 读取 `config.jenkins.cronJobs`
- 每个 job：计算目标时间，过点立即执行，否则 setTimeout
- 失败只写日志，不通知 Slack

### 6. app.ts

在 `scheduleDailyReport(app)` 之后调用 `scheduleJenkinsCronJobs()`。
