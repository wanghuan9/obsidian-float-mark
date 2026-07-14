# 阅读模式局部重绘实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让单个阅读标记变更只重绘相交的 preview sections，并在无法可靠筛选时回退全文重绘。

**Architecture:** 将可选的受影响 `SideMark` 从标记变更入口传到预览刷新入口。每个阅读视图先解析完整 sections，再使用 `getReadingMarksForSection` 判断受影响块；实际重绘仍传入该块的全部标记。未提供范围或筛选失败时保持现有全文流程。

**Tech Stack:** TypeScript、Obsidian MarkdownView API、Node.js 源码级断言、esbuild。

## Global Constraints

- 保持 sidecar 数据格式、锚点定位、编辑器装饰、重叠标记和多窗口行为不变。
- 只有持久化成功后才刷新正式颜色，不增加乐观上色。
- 不纳入无关的 `.superpowers/` 未跟踪目录。

---

### Task 1: 传递单标记刷新范围

**Files:**
- Modify: `src/main.ts`
- Test: `test/test-main-file-reference.mjs`

**Interfaces:**
- Consumes: `SideMark` anchors and existing mark mutation methods.
- Produces: `refreshMarkViews(filePath, affectedMark?)` and matching downstream optional parameters.

- [x] **Step 1: Add source-level assertions for range propagation**

Assert that creation, appearance update, color update, status update, deletion, and reading selection refresh pass a `SideMark` range into `refreshMarkViews`, while general refresh callers remain valid without it.

- [x] **Step 2: Implement optional range propagation**

Add an optional `affectedMark?: SideMark` parameter to `refreshMarkViews`, `renderPreviewMarksForFile`, and `renderPreviewMarksForView`. Pass the newly created mark after creation, and pass the pre-mutation mark for updates and deletion so the old DOM range is included.

- [x] **Step 3: Run the focused source test**

Run `rtk node test/test-main-file-reference.mjs`.

Expected: the new propagation assertions pass.

### Task 2: Filter and Render Only Affected Sections

**Files:**
- Modify: `src/main.ts`
- Test: `test/test-main-file-reference.mjs`

**Interfaces:**
- Consumes: optional `affectedMark` and `getReadingMarksForSection`.
- Produces: per-view local rendering with full-document mark input and full-render fallback.

- [x] **Step 1: Add source-level assertions for local rendering**

Assert that the renderer derives `affectedSections` by checking `getReadingMarksForSection` with the affected mark, renders `sectionsToRender`, passes `resolvedDocument.marks`, and uses all sections when no affected sections are found.

- [x] **Step 2: Implement local filtering**

After resolving the source, document, line starts, observer, and all sections, compute the affected sections only when a range is supplied. If the section list is empty or no affected section is found, use all sections. Keep generation checks and observer restoration unchanged.

- [x] **Step 3: Start preview refresh before sidebar refresh**

Keep both refreshes in `Promise.all`, but invoke `renderPreviewMarksForFile` before `refreshSidebar` so the reading DOM fast path starts first.

- [x] **Step 4: Run focused regression tests**

Run `rtk node test/test-main-file-reference.mjs && rtk node test/test-preview-sections.mjs && rtk node test/test-reading-view-renderer.mjs`.

Expected: all three suites pass.

### Task 3: Build and Verify

**Files:**
- Modify: `main.js` through the production build.

- [x] **Step 1: Run full test suite and production build**

Run `rtk npm test && rtk npm run build`.

- [x] **Step 2: Run diff and format checks**

Run `rtk proxy git diff --check` and `rtk python3 /Users/wanghuan/.skilldock/skills/code-standards/skills/code-standards/scripts/format-check.py --git-diff`.

- [x] **Step 3: Check TypeScript diagnostics**

Run `rtk npm run build`; the TypeScript phase must complete without new errors.

- [x] **Step 4: Review the final diff**

Run `rtk git diff --stat` and `rtk git status --short`; confirm only the design/plan docs, `src/main.ts`, test assertions, and generated `main.js` are changed, with `.superpowers/` still untracked and unstaged.
