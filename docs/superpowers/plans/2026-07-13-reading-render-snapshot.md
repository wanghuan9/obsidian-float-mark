# Reading Render Snapshot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Share reading-mode source and anchor work across Markdown sections while keeping no-op relocation outside the mutation queue and preserving concurrent sidecar updates.

**Architecture:** `SideMarkPlugin` owns a versioned per-file snapshot promise containing source, relocated sidecar data, and line starts. `SideMarkStore` performs a stable read and pure relocation before entering its existing global mutation queue, then rereads and recalculates only when a write may be required.

**Tech Stack:** TypeScript, Obsidian plugin APIs, Node.js assertions, esbuild.

## Global Constraints

- Preserve all current anchor matching and orphan recovery rules.
- Preserve comment, color, status, sidebar, editor, and preview behavior.
- Keep the existing global mutation queue for actual writes, rename, delete, and vault-wide loading.
- Keep existing preview and container generation guards.
- Do not modify or commit the unrelated `.superpowers/` directory.

---

### Task 1: Prove the Relocation Fast Path

**Files:**
- Modify: `test/test-storage.mjs`
- Modify: `src/storage.ts`

**Interfaces:**
- Consumes: `SideMarkStore.relocateDocument(filePath, source)` and the existing mutation queue.
- Produces: `SideMarkStore.getRevision()`, `readStableDocument()`, and pure relocation calculation.

- [x] **Step 1: Add a failing no-op queue test**

Block the sidecar read performed by `relocateDocument()`, append a `saveDocument()` write after that read starts, and assert the later write resolves before the relocation read is released.

- [x] **Step 2: Run the focused storage test and verify failure**

Run: `rtk node test/test-storage.mjs`

Expected: the later write remains pending because the current implementation puts relocation into `mutationTail` before reading.

- [x] **Step 3: Add a failing concurrent-change preservation test**

Start relocation that requires an anchor move, append a blocked color update, then verify the final relocated document contains both the moved anchor and the new color.

- [x] **Step 4: Implement stable read and two-phase relocation**

Add `getRevision()`, retrying `readStableDocument()`, and a private relocation calculation that returns `{ marks, changed }`. Return no-op relocation outside the queue; for changed relocation, reread and recalculate inside `enqueueMutation()` before `writeDocument()`.

- [x] **Step 5: Run the storage test and verify success**

Run: `rtk node test/test-storage.mjs`

Expected: all storage tests pass.

### Task 2: Share Reading Render Work

**Files:**
- Modify: `test/test-main-file-reference.mjs`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `TFile.stat`, `SideMarkStore.getRevision()`, `SideMarkStore.relocateDocument()`, and `getSourceLineStarts()`.
- Produces: `getReadingRenderSnapshot(file)`, `loadReadingRenderSnapshot(file)`, and `invalidateReadingRenderSnapshot(filePath)`.

- [x] **Step 1: Add failing orchestration assertions**

Require `renderReadingModeMarks()` to obtain one snapshot, require cache reuse by file version and store revision, require failed-load eviction, and require the snapshot to contain source, document, and line starts.

- [x] **Step 2: Add failing invalidation assertions**

Require Markdown modify, rename, delete, mark refresh, and unload paths to invalidate the relevant snapshot entries.

- [x] **Step 3: Run the focused main-file test and verify failure**

Run: `rtk node test/test-main-file-reference.mjs`

Expected: the snapshot methods and invalidation calls are absent.

- [x] **Step 4: Implement the per-file snapshot cache**

Add the snapshot types and map, build the source version from mtime and size, reuse a matching promise, update the entry revision after a successful relocation, and remove a failed matching entry.

- [x] **Step 5: Use snapshots in reading postprocessors**

Replace direct source read, relocation, and line-start lookup in `renderReadingModeMarks()` with one snapshot await while retaining the existing container generation checks and section filtering.

- [x] **Step 6: Add explicit invalidation**

Invalidate on Markdown modify, rename, delete, visual mark refresh, editor anchor persistence, and plugin unload.

- [x] **Step 7: Run focused tests and verify success**

Run: `rtk node test/test-main-file-reference.mjs && rtk node test/test-storage.mjs`

Expected: both focused suites pass.

### Task 3: Verify and Install

**Files:**
- Modify: `main.js` through the production build.

**Interfaces:**
- Consumes: the completed source and tests.
- Produces: verified plugin artifacts in the workspace and both configured vaults.

- [x] **Step 1: Run full tests and production build**

Run: `rtk npm test` and `rtk npm run build`

Expected: all tests pass and TypeScript/esbuild complete without errors.

- [x] **Step 2: Run repository checks**

Run: `rtk proxy git diff --check` and `rtk python3 /Users/wanghuan/.skilldock/skills/code-standards/skills/code-standards/scripts/format-check.py --git-diff`

Expected: both checks pass.

- [x] **Step 3: Install both vault copies**

Copy `main.js`, `styles.css`, and `manifest.json` into `.obsidian/plugins/float-mark/` under `/Users/wanghuan/Documents/obsidian` and `/Users/wanghuan/Documents/opt-knowledge`.

- [x] **Step 4: Verify artifact checksums**

Run SHA-256 checks for the workspace and both installed copies.

Expected: each installed artifact matches the workspace artifact.
