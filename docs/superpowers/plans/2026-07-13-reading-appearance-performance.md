# Reading Appearance Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove redundant appearance work and reuse fresh persisted data so reading-mode color changes and reset actions refresh faster without changing their results.

**Architecture:** A shared new-mark style session coalesces choices made during initial creation. Storage maintains an already-loaded vault cache incrementally, while preview refresh accepts a fresh document snapshot and renders it with `MarkdownView.data` in parallel with the sidebar.

**Tech Stack:** TypeScript, Obsidian plugin APIs, Node.js assertions, esbuild.

## Global Constraints

- Preserve color, reset, overlap, anchor, editor, reading, and sidebar behavior.
- Persist before refreshing the visible result.
- Keep observer-driven preview rendering on the relocation path.
- Do not commit the unrelated `.superpowers/` directory.

---

### Task 1: Preserve the Loaded Vault Cache After Writes

**Files:**
- Modify: `src/storage.ts`
- Test: `test/test-storage.mjs`

**Interfaces:**
- Consumes: `SideMarkStore.writeDocument()` and the existing all-document cache.
- Produces: `updateAllDocumentsCache(document: SideMarkDocument): void`.

- [x] **Step 1: Change the cache regression test to require incremental reuse**

After loading all documents, save `new.md`, load all documents again, assert the list count is unchanged, and assert `new.md` is present.

- [x] **Step 2: Run `rtk node test/test-storage.mjs` and verify failure**

Expected: the current implementation lists the sidecar directory again.

- [x] **Step 3: Update the loaded cache after a successful write**

Add a private method that increments the revision, clears an in-flight load reference, and replaces or appends the written document in a sorted cache when one exists. Call it from `writeDocument` instead of invalidating the entire cache.

- [x] **Step 4: Run `rtk node test/test-storage.mjs` and verify success**

Expected: storage tests pass without a second sidecar listing.

### Task 2: Remove Duplicate Selection Appearance Updates

**Files:**
- Modify: `src/main.ts`
- Test: `test/test-main-file-reference.mjs`

**Interfaces:**
- Consumes: `MarkStylePopover.show()`, `createMarkFromOffsets()`, and `createReadingMark()`.
- Produces: `showMarkStylePopoverForNewMark(rect, createMark)` and `isSameHighlightAppearance(left, right)`.

- [x] **Step 1: Add failing orchestration assertions**

Require both selection entry points to call the shared session helper. Require the helper to track `latestChoice`, avoid starting a second creation while `createPromise` exists, delete after a pending reset, and update only when the created and latest appearances differ.

- [x] **Step 2: Run `rtk node test/test-main-file-reference.mjs` and verify failure**

Expected: the shared session helper is absent.

- [x] **Step 3: Implement the shared session**

Move the duplicated editor/reading creation coordination into one helper. Start one creation, coalesce choices while it is pending, and perform at most one follow-up update when the latest choice changed.

- [x] **Step 4: Run `rtk node test/test-main-file-reference.mjs` and verify success**

Expected: main-file orchestration tests pass.

### Task 3: Reuse Fresh Documents and Parallelize Refresh

**Files:**
- Modify: `src/main.ts`
- Test: `test/test-main-file-reference.mjs`

**Interfaces:**
- Consumes: `currentDocument`, `MarkdownView.data`, preview generation guards, and `renderPreviewMarksForView()`.
- Produces: optional fresh-document parameters for preview rendering and parallel refresh orchestration.

- [x] **Step 1: Add failing fast-path assertions**

Require `refreshMarkViews` to run sidebar and preview refresh through `Promise.all`, require the fresh-document path to use `view.data`, and require a matching supplied document to bypass `store.relocateDocument` while the fallback keeps the Vault read.

- [x] **Step 2: Run `rtk node test/test-main-file-reference.mjs` and verify failure**

Expected: refresh remains serial and preview rereads the vault file.

- [x] **Step 3: Implement the fresh-document preview path**

Pass `currentDocument` to mark-triggered preview refresh, use `view.data` only when its path matches the view file, keep the Vault read and relocation as the fallback, and render matching preview leaves concurrently.

- [x] **Step 4: Reuse `refreshMarkViews` from mark creation flows**

Replace the separate sidebar/editor/preview sequence after editor and reading mark creation with the shared parallel refresh.

- [x] **Step 5: Run focused tests**

Run: `rtk node test/test-main-file-reference.mjs && rtk node test/test-storage.mjs`

Expected: both focused suites pass.

### Task 4: Verify, Build, and Install

**Files:**
- Modify: `main.js` through the production build.

- [x] **Step 1: Run full verification**

Run `rtk npm test`, `rtk npm run build`, `rtk proxy git diff --check`, and the code-standards format checker.

- [x] **Step 2: Install to both vaults**

Copy `main.js`, `styles.css`, and `manifest.json` to the FloatMark plugin directories under `/Users/wanghuan/Documents/obsidian` and `/Users/wanghuan/Documents/opt-knowledge`.

- [x] **Step 3: Verify installation checksums**

Expected: each installed file matches the workspace artifact.
