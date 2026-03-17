# 每日简报版本完成状态设计

## 目标

在每日简报中增加版本进度概览和成员进度，帮助快速了解当前版本的整体完成情况。

## 修改范围

仅修改 `src/commands/daily-report.ts`。

## 设计详情

### 1. 版本整体进度概览

在标题/描述之后、昨日进度之前，新增 `*== 版本进度 ==*` 区块。

**输出示例：**

```
*== 版本进度 ==*
完成+待测试: 48/63 (76.2%) | 纯完成: 45/63 (71.4%)
时间进度: 第 10/14 天 (71.4%)
📊 进度正常
```

**计算逻辑：**

- `total = incomplete.length + testing.length + closed.length`
- 完成+待测试 = `(testing.length + closed.length) / total`
- 纯完成 = `closed.length / total`
- 时间进度 = `(今天 - start_date + 1) / (due_date - start_date + 1)`，两端包含
- 状态判断：`(完成+待测试) / total >= 时间进度比例` → "进度正常"，否则 → "进度落后"

**无日期时：** 不显示时间进度行和状态判断行，只显示完成率。

### 2. 成员进度

在现有"未完成详情"区域，为每个成员增加完成率统计。

**输出示例：**

```
*== 未完成详情 (15) ==*

*张三* (未完成 8 / 总 20, 完成率 60.0%):
  #130 [特性] 新功能开发 | 高优
  #131 [修复] 常见bug | 低优

*李四* (未完成 5 / 总 12, 完成率 58.3%):
  #140 [特性] 排行榜 | 中优
```

**计算逻辑：**

- 将 incomplete、testing、closed 三个数组都按 assignee 分组
- 每人总数 = 该人的 incomplete + testing + completed
- 每人完成率 = (testing + completed) / 总数
- 排序不变：按未完成数量倒序

### 3. 数据修复

当前 closed issues 的 snapshot 只保存了 `{ iid, title }`，缺少 assignee。需改为也使用 `toSnapshot()` 以保留 assignee 信息，用于按人统计。

## 实现要点

1. 所有改动集中在 `generateDailyReport()` 函数内
2. 无需新增 API 调用，数据已在 opened/closed 中
3. 时间计算使用本地日期字符串解析，与现有 `todayStr()` 一致
4. 百分比保留一位小数
