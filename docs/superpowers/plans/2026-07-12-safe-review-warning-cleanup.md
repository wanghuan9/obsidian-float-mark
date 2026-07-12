# Obsidian 审核告警安全优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变插件功能和第三方主题兼容行为的前提下，将 Obsidian 审核 Warning 从 49 条安全降低到预计 37 条。

**Architecture:** 运行时命令统一委托给已启用的 Feishu Lark CLI Sync 插件公开桥接，FloatMark 不再直接启动子进程；TypeScript 告警采用等价类型表达消除。文档恢复英文主入口，CSS 只删除被同一条 `background: ... !important` 完全覆盖的严格冗余声明，其余主题兼容规则保持原样。

**Tech Stack:** TypeScript、Node.js ESM 测试、esbuild、CSS、Markdown。

## Global Constraints

- 功能和现有主题兼容优先，不以 Warning 清零为目标。
- 不修改插件权限、同步开关、数据结构或用户操作流程。
- 保留 37 条承担 Cupertino、Primary 等第三方主题兼容职责的 `!important`。
- 所有 shell 命令以 `rtk` 开头，所有文件修改使用 `apply_patch`。
- 全量测试和生产构建必须通过。

---

### Task 1: 安全消除运行时与 TypeScript 告警

**Files:**
- Create: `test/test-review-warnings.mjs`
- Create: `src/lark-cli-bridge.ts`（计划偏差：首轮 review 要求增加可执行桥接契约测试）
- Modify: `package.json`
- Modify: `src/lark-bridge.ts:1-66, 529-624`
- Modify: `src/reading-view-renderer.ts:278-292, 621-630`
- Generated: `main.js`

**Interfaces:**
- Consumes: `LarkSyncPluginBridge.runLarkCliCommand(args: string[], options?: { cwd?: string }): Promise<LarkCliResult>`。
- Produces: `findLarkReplyIds` 继续返回 `Promise<string[]>`，命令参数和 `LarkCliResult.data.items` / `LarkCliResult.items` 解析规则不变。

- [x] **Step 1: 写入失败的静态契约测试**

创建 `test/test-review-warnings.mjs`：

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const larkBridgeSource = await readFile("src/lark-bridge.ts", "utf8");
assert.doesNotMatch(larkBridgeSource, /from ["']child_process["']/);
assert.doesNotMatch(larkBridgeSource, /runRawLarkCliViaSyncPlugin/);
assert.match(
	larkBridgeSource,
	/async function findLarkReplyIds[\s\S]*?await runLarkCliViaSyncPlugin\(plugin, \[/
);

const readingRendererSource = await readFile("src/reading-view-renderer.ts", "utf8");
assert.match(
	readingRendererSource,
	/new Array<Element \| null>\(textNodes\.length\)\.fill\(null\)/
);
assert.doesNotMatch(
	readingRendererSource,
	/prefixClosingStarts\.values\(\)\.next\(\)\.value as number \| undefined/
);

console.log("review warning tests passed");
```

在 `package.json` 的 `test` 命令末尾追加：

```json
" && node test/test-review-warnings.mjs"
```

- [x] **Step 2: 运行测试并确认按预期失败**

Run: `rtk node test/test-review-warnings.mjs`

Expected: FAIL，首先命中 `child_process` 断言。

- [x] **Step 3: 最小化修改飞书命令桥接**

在 `src/lark-bridge.ts` 中删除：

```ts
import { execFile } from "child_process";
import { promisify } from "util";
const execFileAsync = promisify(execFile);
```

将 `LarkSyncPluginBridge` 保持为已有公开执行接口：

```ts
interface LarkSyncPluginBridge {
	runLarkCliCommand?: (args: string[], options?: { cwd?: string }) => Promise<LarkCliResult>;
	runLarkCli?: (args: string[], options?: { cwd?: string }) => Promise<LarkCliResult>;
}
```

将 `findLarkReplyIds` 的调用改为：

```ts
const result = await runLarkCliViaSyncPlugin(plugin, [
	"drive",
	"file.comment.replys",
	"list",
	"--as",
	"user",
	"--file-token",
	extractDocumentToken(doc),
	"--file-type",
	"docx",
	"--comment-id",
	commentId,
	"--page-size",
	"100",
	"--json"
]);
```

完整删除 `runRawLarkCliViaSyncPlugin`；保留 `runLarkCliViaSyncPlugin`、`assertLarkCommandOk` 和错误转换逻辑。

- [x] **Step 4: 最小化修改 TypeScript 类型表达**

在 `src/reading-view-renderer.ts` 中使用显式数组泛型：

```ts
const nextContentBlocks = new Array<Element | null>(textNodes.length).fill(null);
```

删除冗余断言：

```ts
const prefixStart = truncatedRuns.prefixClosingStarts.values().next().value;
```

- [x] **Step 5: 运行任务测试和生产构建**

Run: `rtk node test/test-review-warnings.mjs`

Expected: PASS，输出 `review warning tests passed`。

Run: `rtk npm test`

Expected: 所有现有测试和新测试 PASS。

Run: `rtk npm run build`

Expected: TypeScript 检查和 esbuild 生产构建成功，生成的 `main.js` 不包含 `child_process`。

Run: `rtk rg -n 'child_process|runRawLarkCliViaSyncPlugin' main.js src/lark-bridge.ts`

Expected: 无匹配。

- [ ] **Step 6: 提交 Task 1**

```bash
rtk git add -- package.json src/lark-bridge.ts src/reading-view-renderer.ts test/test-review-warnings.mjs main.js
rtk git commit -m "fix:[review-warning-cleanup] 安全消除运行时审核告警" -m "- 飞书命令统一复用同步插件公开桥接
- 修复数组类型推断和冗余断言
- 增加审核告警静态契约测试"
```

---

### Task 2: 安全整理 README 与严格冗余 CSS

**Files:**
- Modify/rename: `README.md`
- Modify/rename: `README.en.md`
- Create by rename: `README.zh-CN.md`
- Modify: `styles.css:208-224, 427-438, 1300-1317`
- Modify: `test/test-review-warnings.mjs`

**Interfaces:**
- Consumes: Task 1 创建的 `test/test-review-warnings.mjs`。
- Produces: 英文根 README、中文 `README.zh-CN.md`、精确保留 37 个主题兼容 `!important`。

- [ ] **Step 1: 扩充失败的文档与 CSS 契约测试**

在 `test/test-review-warnings.mjs` 追加：

```js
const readmeSource = await readFile("README.md", "utf8");
const chineseReadmeSource = await readFile("README.zh-CN.md", "utf8");
assert.match(readmeSource, /FloatMark is an Obsidian plugin/);
assert.match(readmeSource, /\[简体中文\]\(\.\/README\.zh-CN\.md\)/);
assert.match(chineseReadmeSource, /FloatMark 是 Obsidian/);
assert.match(chineseReadmeSource, /\[English\]\(\.\/README\.md\)/);

const stylesSource = await readFile("styles.css", "utf8");
const importantCount = stylesSource.match(/!important/g)?.length || 0;
assert.equal(importantCount, 37);
assert.doesNotMatch(stylesSource, /background: transparent !important;\s*background-color:/);
assert.doesNotMatch(stylesSource, /background: transparent !important;\s*background-image:/);
assert.doesNotMatch(stylesSource, /background: (#[0-9a-f]+) !important;\s*background-color: \1/i);
```

- [ ] **Step 2: 运行测试并确认按预期失败**

Run: `rtk node test/test-review-warnings.mjs`

Expected: FAIL，原因是 `README.zh-CN.md` 尚不存在或 `!important` 数量仍为 45。

- [ ] **Step 3: 恢复英文主 README 和中文独立入口**

使用 `apply_patch` 将当前 `README.md` 移动为 `README.zh-CN.md`，将当前 `README.en.md` 移动为 `README.md`。两个文件开头统一为：

```markdown
[English](./README.md) | [简体中文](./README.zh-CN.md)
```

正文内容保持现有中英文版本不变。

- [ ] **Step 4: 只删除 8 条严格冗余 CSS 声明**

从对应规则中删除以下声明，不改动同规则中的 `background: ... !important`：

```css
background-color: transparent !important;
background-image: none !important;
```

两组菜单规则各删除一次，共 4 条；四种 `.side-mark-color-option` 规则各删除一条同色 `background-color`，共 4 条。不得改动剩余 37 个 `!important`。

- [ ] **Step 5: 运行任务测试、全量测试和构建**

Run: `rtk node test/test-review-warnings.mjs`

Expected: PASS，`!important` 精确为 37，双语 README 入口正确。

Run: `rtk npm test`

Expected: 全部测试 PASS。

Run: `rtk npm run build`

Expected: TypeScript 检查和生产构建成功。

Run: `rtk git diff --check`

Expected: 无空白错误。

Run: `rtk python3 /Users/wanghuan/.skilldock/skills/code-standards/skills/code-standards/scripts/format-check.py --git-diff`

Expected: 本次变更行格式检查通过。

- [ ] **Step 6: 提交 Task 2**

```bash
rtk git add -- README.md README.en.md README.zh-CN.md styles.css test/test-review-warnings.mjs
rtk git commit -m "chore:[review-warning-cleanup] 安全精简审核样式告警" -m "- 恢复英文主 README 和中文独立入口
- 删除八条严格冗余背景声明
- 保留第三方主题兼容样式"
```

---

## Final Verification

- [ ] Run: `rtk npm test`，Expected: 全量测试 PASS。
- [ ] Run: `rtk npm run build`，Expected: 生产构建成功。
- [ ] Run: `rtk rg -o '!important' styles.css | rtk wc -l`，Expected: `37`。
- [ ] Run: `rtk rg -n 'child_process|runRawLarkCliViaSyncPlugin' main.js src/lark-bridge.ts`，Expected: 无匹配。
- [ ] Run: `rtk git status --short --branch`，Expected: 工作区干净，位于 `feature/safe-review-warning-cleanup`。
