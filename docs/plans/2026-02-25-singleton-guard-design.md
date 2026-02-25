# 单实例守护设计

## 目标

启动时检测是否已有实例在运行，避免重复启动导致异常。

## 方案

TCP 端口占用检测。启动时尝试监听一个固定端口，成功则正常启动，失败（`EADDRINUSE`）则警告并退出。

## 实现

- 新增 `src/utils/singleton.ts`，导出 `ensureSingleInstance(port)` 函数
- 内部创建 `net.createServer()` 并监听指定端口
- 监听成功 → 返回（server 保持运行作为占位）
- 监听失败 `EADDRINUSE` → 打印警告日志并 `process.exit(1)`
- `app.ts` 在 `loadConfig()` 之前调用

## 配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `SINGLETON_PORT` | `19280` | 单实例检测端口 |
