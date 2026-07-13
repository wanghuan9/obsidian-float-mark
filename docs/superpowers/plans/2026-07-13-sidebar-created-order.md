# Sidebar Created Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display comments and marks in creation order, with the earliest created item first.

**Architecture:** Add one pure creation-time sorter in `sidebar-logic.ts` and reuse it in current-document and vault sidebar paths. Keep sidecar persistence and anchor-position ordering unchanged.

**Tech Stack:** TypeScript, Obsidian DOM helpers, esbuild, Node.js tests.

## Global Constraints

- Only change sidebar display order.
- Sort by `mark.note.createdAt` ascending.
- Preserve existing relative order when timestamps are equal or invalid.
- Do not change the sidecar schema, storage ordering, anchors, editor rendering, or reading-mode rendering.
- All shell commands use the `rtk` prefix.

---

### Task 1: Sort sidebar cards by creation time

**Files:**
- Modify: `src/sidebar-logic.ts`
- Modify: `src/sidebar-view.ts`
- Test: `test/test-sidebar-vault.mjs`
- Generate: `main.js`

**Interfaces:**
- Produces: `sortMarksByCreatedAt(marks: SideMark[]): SideMark[]`
- Consumes: `SideMark.note.createdAt`

- [x] **Step 1: Write failing sorting tests**

Add marks whose array order and anchor order differ from their creation time. Assert ascending creation order, stable equal-time order, current-document helper behavior, and vault group behavior.

- [x] **Step 2: Run the focused test and verify failure**

Run: `rtk node test/test-sidebar-vault.mjs`

Expected: FAIL because sidebar results still preserve storage order.

- [x] **Step 3: Implement the pure display sorter**

Return a cloned array sorted by valid `createdAt` timestamps ascending. Return comparator equality for equal or invalid timestamps so JavaScript's stable sort preserves the existing relative order.

- [x] **Step 4: Apply the sorter to both sidebar scopes**

Sort filtered current-document cards in `getFilteredMarks()` and each vault document group in `summarizeVaultDocuments()`. Do not sort `allMarks`, because background inheritance and mark rendering still consume the stored collection.

- [x] **Step 5: Run complete verification**

Run `rtk npm test`, `rtk npm run build`, `rtk git diff --check`, and the code-standards format checker. All commands must pass.

- [x] **Step 6: Install and verify in Obsidian**

Copy `main.js` to `/Users/wanghuan/Documents/obsidian/.obsidian/plugins/float-mark/` and `/Users/wanghuan/Documents/opt-knowledge/.obsidian/plugins/float-mark/`, reload third-party plugins, and confirm the earliest comment and mark appear first.
