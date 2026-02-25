# Milestone 日期功能设计

## 需求

1. 创建 milestone 时以当前日期作为 start_date，支持可选 due_date（默认+14天）
2. 列出 milestone 时显示起止日期

## 命令格式

```
create-milestone <版本号> [结束日期]
```

- `create-milestone 10.32` → start_date=今天, due_date=今天+14天
- `create-milestone 10.32 2026-03-15` → start_date=今天, due_date=指定日期

## 修改点

### services/gitlab.ts

- `GitLabMilestone` 增加 `start_date`、`due_date`（`string | null`）
- `createMilestone(title, startDate, dueDate)` 传日期参数给 API

### commands/create-milestone.ts

- 解析可选结束日期参数
- 计算 start_date（今天）和 due_date（用户指定或+14天）
- 显示日期信息

### commands/list-milestones.ts

- 显示 start_date 和 due_date，格式：`起止: 2026-02-25 ~ 2026-03-11`
