# Partial Mark Style Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent an existing full-range mark from being edited when the user has selected a shorter range inside it, while preserving normal click-to-edit behavior without a selection.

**Architecture:** Introduce a small shared click guard that converts editor or DOM selection state into one interaction decision. Apply it at the two old-mark click entry points, leaving mark creation and sidecar storage unchanged; overlapping appearance remains represented by one outer background mark and one inner text-color mark.

**Tech Stack:** TypeScript, CodeMirror 6, Obsidian plugin API, esbuild, Node.js test runner, JSDOM.

## Global Constraints

- Do not change the sidecar schema.
- Do not split an existing mark into multiple records.
- Do not change comment marks or Lark synchronization.
- Preserve click-to-edit when no text selection exists.
- All shell commands use the `rtk` prefix.

---

### Task 1: Add and test the shared mark-click guard

**Files:**
- Create: `src/mark-click-guard.ts`
- Create: `test/test-mark-click-guard.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `shouldOpenMarkForSelection(hasTextSelection: boolean): boolean`
- Produces: `hasNonEmptyDomSelection(selection: Selection | null): boolean`

- [x] **Step 1: Write the failing guard test**

Create a bundled browser test that asserts `shouldOpenMarkForSelection(true)` is false, `shouldOpenMarkForSelection(false)` is true, a collapsed JSDOM selection is false, and a selection containing `，避免污` is true.

- [x] **Step 2: Run the focused test and verify failure**

Run: `rtk node test/test-mark-click-guard.mjs`

Expected: FAIL because `src/mark-click-guard.ts` does not exist.

- [x] **Step 3: Implement the minimal guard**

```ts
export function shouldOpenMarkForSelection(hasTextSelection: boolean): boolean {
	return !hasTextSelection;
}

export function hasNonEmptyDomSelection(selection: Selection | null): boolean {
	return Boolean(selection && !selection.isCollapsed && selection.toString().trim());
}
```

- [x] **Step 4: Add the focused test to `npm test` and verify pass**

Run: `rtk node test/test-mark-click-guard.mjs`

Expected: `mark click guard tests passed`.

### Task 2: Guard editor and reading mark clicks

**Files:**
- Modify: `src/editor-extension.ts`
- Modify: `src/reading-view-renderer.ts`
- Modify: `test/test-reading-view-renderer.mjs`
- Generate: `main.js`

**Interfaces:**
- Consumes: `shouldOpenMarkForSelection(hasTextSelection: boolean): boolean`
- Consumes: `hasNonEmptyDomSelection(selection: Selection | null): boolean`

- [x] **Step 1: Add the screenshot-like overlap regression**

Use `不复用现有 @CheckPermission，避免污染现有权限语义` as rendered text, create an outer `red-light` background mark and an inner red-text/no-background mark for `，避免污`, then assert the inner wrapper is nested under the outer wrapper and only the inner wrapper has `side-mark--text-red`.

- [x] **Step 2: Add reading click behavior assertions**

Select `，避免污` in JSDOM and dispatch `click` on its wrapper; assert the callback count remains zero. Clear the selection, click again, and assert the callback count becomes one.

- [x] **Step 3: Implement the editor guard**

In `handleMarkClick()`, before `preventDefault()` and `openMark()`, return when:

```ts
!shouldOpenMarkForSelection(!this.view.state.selection.main.empty)
```

- [x] **Step 4: Implement the reading guard**

In the wrapper click handler, return when:

```ts
!shouldOpenMarkForSelection(hasNonEmptyDomSelection(wrapper.ownerDocument.getSelection()))
```

- [x] **Step 5: Run focused and full verification**

Run: `rtk npm test`

Expected: all test scripts print `passed`.

Run: `rtk npm run build`

Expected: TypeScript and production bundle complete without errors.

Run: `rtk git diff --check`

Expected: no output.

- [x] **Step 6: Install and verify in Obsidian**

Copy `main.js`, `manifest.json`, and `styles.css` to `/Users/wanghuan/Documents/obsidian/.obsidian/plugins/float-mark/`, reload Obsidian, and reproduce the design flow in both editor and reading modes. Confirm the full range keeps its background and only `，避免污` changes text color.
