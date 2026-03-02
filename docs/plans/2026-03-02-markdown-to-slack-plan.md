# Markdown → Slack mrkdwn 转换层实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 Claude/Gemini 等返回的标准 Markdown 转换为 Slack mrkdwn 格式，让消息在 Slack 中正确渲染。

**Architecture:** 在 `src/utils/message.ts` 中新增 `markdownToSlack()` 函数。采用"占位符保护"策略：先提取代码块/行内代码替换为占位符，在非代码区域执行转换规则，最后恢复占位符。所有发往 Slack 的文本在 `splitToBlocks()` 之前统一调用此函数。

**Tech Stack:** TypeScript，纯字符串/正则处理，零外部依赖。

---

### Task 1: 实现 markdownToSlack 核心转换函数

**Files:**
- Modify: `src/utils/message.ts`

**Step 1: 在 `src/utils/message.ts` 中新增 `markdownToSlack` 函数**

在文件顶部（`splitToBlocks` 之前）添加：

```typescript
export function markdownToSlack(text: string): string {
  // 1. 提取代码块，替换为占位符
  const codeBlocks: string[] = [];
  let result = text.replace(/```[\w]*\n([\s\S]*?)```/g, (_, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push('```\n' + code + '```');
    return `\x00CODEBLOCK${idx}\x00`;
  });

  // 2. 提取行内代码，替换为占位符
  const inlineCodes: string[] = [];
  result = result.replace(/`([^`\n]+)`/g, (match) => {
    const idx = inlineCodes.length;
    inlineCodes.push(match);
    return `\x00INLINE${idx}\x00`;
  });

  // 3. 转换表格（必须在其他行级转换之前）
  result = convertTables(result);

  // 4. 标题：## text → *text*
  result = result.replace(/^#{1,6}\s+(.+)$/gm, '*$1*');

  // 5. 图片：![alt](url) → <url|alt>（必须在链接之前）
  result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<$2|$1>');

  // 6. 链接：[text](url) → <url|text>
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<$2|$1>');

  // 7. 粗体：**text** → *text*
  result = result.replace(/\*\*(.+?)\*\*/g, '*$1*');

  // 8. 斜体：单个 *text*（非粗体残留）→ _text_
  //    注意：此时 **已被转换，剩余的 *x* 如果不是 Slack 粗体就是斜体
  //    只转换 Markdown 斜体语法 _text_ 保持不变（Slack 也用 _）
  //    不处理单 * 斜体，因为 Slack 中 * 是粗体，会冲突

  // 9. 删除线：~~text~~ → ~text~
  result = result.replace(/~~(.+?)~~/g, '~$1~');

  // 10. 无序列表：行首 - 或 * → •（注意不匹配已转换的粗体 *text*）
  result = result.replace(/^(\s*)[-*]\s+/gm, '$1• ');

  // 11. 水平线：独立的 --- 或 *** → Unicode 线
  result = result.replace(/^[-*]{3,}\s*$/gm, '────────────────────');

  // 12. 恢复行内代码
  for (let i = 0; i < inlineCodes.length; i++) {
    result = result.replace(`\x00INLINE${i}\x00`, inlineCodes[i]);
  }

  // 13. 恢复代码块
  for (let i = 0; i < codeBlocks.length; i++) {
    result = result.replace(`\x00CODEBLOCK${i}\x00`, codeBlocks[i]);
  }

  return result;
}
```

**Step 2: 实现 convertTables 辅助函数**

在 `markdownToSlack` 函数之前添加：

```typescript
function convertTables(text: string): string {
  // 匹配连续的表格行（含 header、separator、data rows）
  const tableRegex = /(?:^\|.+\|\s*\n){2,}/gm;
  return text.replace(tableRegex, (table) => {
    const rows = table.trim().split('\n').map(row =>
      row.split('|').slice(1, -1).map(cell => cell.trim())
    );

    // 跳过分隔行（全是 -:）
    const dataRows = rows.filter(row =>
      !row.every(cell => /^[-:]+$/.test(cell))
    );

    if (dataRows.length === 0) return table;

    // 计算各列最大宽度
    const colCount = dataRows[0].length;
    const widths = Array.from({ length: colCount }, (_, col) =>
      Math.max(...dataRows.map(row => (row[col] ?? '').length))
    );

    // 格式化输出
    const lines: string[] = [];
    for (let i = 0; i < dataRows.length; i++) {
      const line = dataRows[i]
        .map((cell, col) => cell.padEnd(widths[col]))
        .join('  ');
      lines.push(line);
      // 在 header 后加分隔线
      if (i === 0) {
        lines.push(widths.map(w => '─'.repeat(w)).join('  '));
      }
    }

    return '```\n' + lines.join('\n') + '\n```\n';
  });
}
```

**Step 3: 验证构建通过**

Run: `npm run build`
Expected: 编译成功，无报错

**Step 4: Commit**

```bash
git add src/utils/message.ts
git commit -m "feat: 新增 markdownToSlack 转换函数"
```

---

### Task 2: 在 Claude 流式输出中集成转换

**Files:**
- Modify: `src/commands/index.ts`

**Step 1: 在 import 中添加 markdownToSlack**

将 `src/commands/index.ts` 第 17 行的 import 修改：

```typescript
// 改前
import { splitToBlocks } from '../utils/message.js';
// 改后
import { splitToBlocks, markdownToSlack } from '../utils/message.js';
```

**Step 2: 在 flush 函数中对 content 应用转换**

在 `handleClaude` 的 `flush` 函数中，发送前调用 `markdownToSlack`。修改 `flush` 函数体：

```typescript
const flush = async (final = false) => {
  const now = Date.now();
  if (!final && now - lastUpdate < THROTTLE_MS) return;
  lastUpdate = now;

  const converted = markdownToSlack(content);

  if (converted.length <= MAX_MSG_LEN) {
    await client.chat.update({
      channel,
      ts: msgTs,
      text: converted || '思考中...',
    });
  } else {
    const chunks = splitToBlocks(converted);
    await client.chat.update({
      channel,
      ts: msgTs,
      text: chunks[0],
    });
    for (let i = segmentIndex + 1; i < chunks.length; i++) {
      await client.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text: chunks[i],
      });
      segmentIndex = i;
    }
  }
};
```

注意：`content` 变量保持原始 Markdown（用于日志和长度统计），只在发送时转换。

**Step 3: 验证构建通过**

Run: `npm run build`
Expected: 编译成功

**Step 4: Commit**

```bash
git add src/commands/index.ts
git commit -m "feat: Claude 流式输出集成 markdownToSlack 转换"
```

---

### Task 3: 在 Gemini 回复中集成转换

**Files:**
- Modify: `src/commands/gemini.ts`

**Step 1: 添加 import 并在发送前调用转换**

```typescript
// 在 import 行修改
import { splitToBlocks, markdownToSlack } from '../utils/message.js';
```

在 `handleGemini` 的 try 块中，`splitToBlocks` 调用前加转换：

```typescript
// 改前
const blocks = splitToBlocks(reply);
// 改后
const blocks = splitToBlocks(markdownToSlack(reply));
```

**Step 2: 验证构建通过**

Run: `npm run build`
Expected: 编译成功

**Step 3: Commit**

```bash
git add src/commands/gemini.ts
git commit -m "feat: Gemini 回复集成 markdownToSlack 转换"
```

---

### Task 4: 手动测试验证

**Step 1: 启动开发模式**

Run: `npm run dev`

**Step 2: 在 Slack 中测试以下场景**

1. 发送一条请求让 Claude 回复包含标题、粗体、代码块的内容
2. 发送一条请求让 Claude 回复包含表格的内容
3. 发送 `help` 确认帮助信息未被破坏
4. 发送 `gemini 用markdown格式给我写一段示例` 测试 Gemini 转换

验证：标题变粗体、表格变等宽代码块、代码块保留、链接正确转换。

**Step 3: 如有问题，修复后再次验证**
