# Editor Table Precise Marks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render FloatMark annotations precisely inside both static and actively edited Obsidian Live Preview table cells.

**Architecture:** A focused editor-table renderer maps each mounted `.cm-table-widget` to its outer CodeMirror source range and renders static cells through the reading-mode renderer. Active cells are mapped by DOM row/column to a narrow Markdown cell source range and rendered through decorations installed into the nested cell `EditorView` retrieved by the public `EditorView.findFromDOM()` API.

**Tech Stack:** TypeScript, CodeMirror 6, Obsidian plugin APIs, JSDOM, Node.js assertions, esbuild.

## Global Constraints

- Preserve sidecar schema, anchor relocation, reading-mode behavior, normal editor decorations, and table editing behavior.
- Use public CodeMirror `EditorView.posAtDOM()` for source mapping.
- Use public CodeMirror `EditorView.findFromDOM()` for nested active-cell editors.
- Reuse `getReadingMarksForSection()` and `renderReadingMarks()` for precision and overlap behavior.
- Reuse `buildEditorDecorationLayers()` for active-cell appearance and click behavior.
- Do not use Obsidian private JavaScript APIs or add a general Markdown table parser.
- Do not modify or commit the unrelated `.superpowers/` directory.

---

### Task 1: Prove Precise Rendering in a Replaced Table Widget

**Files:**
- Create: `test/test-editor-table-renderer.mjs`
- Create: `src/editor-table-renderer.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `EditorView`, `SideMark[]`, `buildSourceLineStarts()`, `getReadingMarksForSection()`, and `renderReadingMarks()`.
- Produces: `renderEditorTableMarks(view, source, lineStarts, marks, onClick): void`.

- [x] **Step 1: Add a failing CodeMirror widget fixture test**

Create an `EditorView` whose Markdown table range is replaced by a `WidgetType` DOM fixture using `.cm-embed-block.cm-table-widget.markdown-rendered > .table-wrapper > table.table-editor`. Add marks for plain text, bold text, inline code, comments, and overlapping ranges across formatted nodes in one cell.

- [x] **Step 2: Assert reading-mode parity**

Require exact wrapper text and classes, correct overlap nesting, click delegation, no changes outside the table, and complete cleanup when marks become empty.

- [x] **Step 3: Run the focused test and verify failure**

Run: `rtk node test/test-editor-table-renderer.mjs`

Expected: the `src/editor-table-renderer.ts` entry point or exported render function is absent.

- [x] **Step 4: Implement the pure table renderer**

Query mounted table widget hosts, map their start and end offsets with `view.posAtDOM()`, derive inclusive zero-based line bounds, clip marks with the existing reading helper, and render into the table element. Skip detached or unmappable widgets without mutating mark data.

- [x] **Step 5: Register the focused test**

Add `node test/test-editor-table-renderer.mjs` to the `npm test` script immediately after the existing editor-decoration test.

- [x] **Step 6: Run the focused test and verify success**

Run: `rtk node test/test-editor-table-renderer.mjs`

Expected: all precise table rendering assertions pass.

### Task 2: Integrate the Table Lifecycle with the Editor ViewPlugin

**Files:**
- Modify: `src/editor-table-renderer.ts`
- Modify: `src/editor-extension.ts`
- Modify: `test/test-main-file-reference.mjs`

**Interfaces:**
- Consumes: `renderEditorTableMarks()`, the editor view's current document, `plugin.currentDocument`, and `plugin.openMark()`.
- Produces: `EditorTableMarkRenderer.schedule()` and `EditorTableMarkRenderer.destroy()`.

- [x] **Step 1: Add failing lifecycle orchestration assertions**

Require the editor extension to construct one table renderer, schedule it after updates, and destroy it with the ViewPlugin. Require the controller to observe `view.dom`, disconnect during render, reuse a cached CodeMirror `Text` source snapshot, reconnect after render, and clear wrappers on destroy.

- [x] **Step 2: Run the main-file test and verify failure**

Run: `rtk node test/test-main-file-reference.mjs`

Expected: the table controller import and lifecycle calls are absent.

- [x] **Step 3: Implement the lifecycle controller**

Add a request-animation-frame scheduler, a subtree `MutationObserver`, cached document/source/line-start state, guarded render execution, and destroy cleanup. The mark callback returns an empty array when the editor file does not match `plugin.currentDocument`.

- [x] **Step 4: Connect the editor extension**

Construct the controller after the existing decoration layers, schedule it whenever the extension rebuilds layers, delegate clicks to `plugin.openMark()`, and destroy it before removing editor event listeners.

- [x] **Step 5: Run focused regression tests**

Run: `rtk node test/test-main-file-reference.mjs && rtk node test/test-editor-table-renderer.mjs && rtk node test/test-editor-decorations.mjs && rtk node test/test-reading-view-renderer.mjs`

Expected: all focused suites pass.

### Task 3: Render Marks in the Active Cell Editor

**Files:**
- Create: `src/editor-table-cell-renderer.ts`
- Modify: `src/editor-table-renderer.ts`
- Modify: `src/reading-view-renderer.ts`
- Modify: `test/test-editor-table-renderer.mjs`

**Interfaces:**
- Consumes: outer widget source range, `HTMLTableCellElement.rowIndex/cellIndex`, `EditorView.findFromDOM()`, and `buildEditorDecorationLayers()`.
- Produces: `renderActiveTableCellMarks(table, source, widgetRange, marks): SourceRange[]`; returned ranges identify marks excluded from static DOM rendering.

- [x] **Step 1: Add a failing active-cell fixture**

Create a nested `EditorView` inside `.table-cell-wrapper` for the R5 core-rule cell. Assert that rendering places `data-side-mark-id` decorations inside the nested editor, leaves no `data-side-mark-reading-id` wrappers in the active cell, and keeps static marks in R6/R7 visible.

- [x] **Step 2: Cover lifecycle and duplicate text**

Activate two cells containing identical text in sequence. Assert only the source row containing each mark is decorated. Add a mark while the nested editor remains active, schedule the controller, and assert it appears after the next animation frame without clicking outside.

- [x] **Step 3: Run the focused test and verify failure**

Run: `rtk node test/test-editor-table-renderer.mjs`

Expected: active-cell decoration assertions fail because the nested editor contains no FloatMark decorations.

- [x] **Step 4: Implement the narrow cell source mapper**

Map rendered row zero to the header source line and later rows to source line `rowIndex + 1`, skipping the Markdown separator line. Scan unescaped `|` delimiters, trim table padding, select `cellIndex`, and verify the nested editor document matches the resulting source slice before localizing marks.

- [x] **Step 5: Implement nested CodeMirror decoration state**

Install a `StateField<EditorDecorationLayers>` once per nested editor with `StateEffect.appendConfig`. Dispatch localized regular and outer layers only when the nested document or mark signature changes. Empty layers clear decorations during controller destruction.

- [x] **Step 6: Exclude active-cell DOM from static rendering**

Add an optional excluded-container selector to `renderReadingMarks()` and pass `.table-cell-wrapper .cm-editor` from the table renderer. Remove active-cell marks from the static mark list before calling the reading renderer.

- [x] **Step 7: Run focused regressions**

Run: `rtk node test/test-editor-table-renderer.mjs && rtk node test/test-editor-decorations.mjs && rtk node test/test-reading-view-renderer.mjs`

Expected: all focused suites pass.

### Task 4: Verify, Build, Install, and Inspect

**Files:**
- Modify: `main.js` through the production build.

**Interfaces:**
- Consumes: the completed source and tests.
- Produces: verified workspace artifacts and installed plugin copies.

- [x] **Step 1: Run full automated verification**

Run `rtk npm test`, `rtk npm run build`, `rtk proxy git diff --check`, and `rtk python3 /Users/wanghuan/.skilldock/skills/code-standards/skills/code-standards/scripts/format-check.py --git-diff`.

Expected: tests, TypeScript compilation, esbuild, diff check, and format check pass.

- [x] **Step 2: Install both vault copies**

Copy `main.js`, `styles.css`, and `manifest.json` into `.obsidian/plugins/float-mark/` under `/Users/wanghuan/Documents/obsidian` and `/Users/wanghuan/Documents/opt-knowledge`.

- [x] **Step 3: Verify installation checksums**

Run SHA-256 checks for the workspace and both installed copies.

Expected: each installed artifact matches the workspace artifact.

- [x] **Step 4: Verify the reported document in Obsidian**

Reload FloatMark, open `spec-B-留货直销单.md` in Live Preview, navigate to the R5-R7 table, and confirm `可从`, `§4.3.6`, and `查询接口` show their existing precise styles. Confirm clicking a marked fragment opens the existing mark interaction without breaking table cell selection or editing.
