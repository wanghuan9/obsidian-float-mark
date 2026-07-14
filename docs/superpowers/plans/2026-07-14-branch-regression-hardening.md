# Branch Regression Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix reviewed correctness and lifecycle regressions while preserving existing annotation behavior and data format.

**Architecture:** Reading selection merges exact and rendered candidates before scoring. Storage restores deterministic unique-text recovery and returns anchor-update change metadata. Main plugin state isolates debounced anchor saves per file and uses a non-destructive preview fallback.

**Tech Stack:** TypeScript, CodeMirror 6, Obsidian plugin APIs, Node.js assertions, JSDOM, esbuild.

## Global Constraints

- Preserve sidecar schema version 1.
- Preserve normal editor, reading renderer, table editor, sidebar ordering, and marker color behavior.
- Keep reading selection work within selected preview sections.
- Do not modify or commit `.superpowers/`.

---

### Task 1: Merge Reading Selection Candidates

**Files:**
- Modify: `src/reading-selection.ts`
- Modify: `test/test-reading-selection.mjs`

**Interfaces:**
- Consumes: exact source ranges, rendered source ranges, rendered offsets, context scores.
- Produces: one unique `{ from, to }` range or `null` for a tied top score.

- [x] Add a failing case where the intended `**foo** bar` is followed by plain `foo bar` in the same section.
- [x] Add a case proving exact and rendered forms of the same occurrence are deduplicated.
- [x] Run `rtk node test/test-reading-selection.mjs` and confirm the mixed-format case fails.
- [x] Merge both candidate sets, deduplicate by rendered occurrence, and preserve exact ranges when duplicated.
- [x] Run the focused test and confirm all reading-selection cases pass.

### Task 2: Restore Deterministic Persisted Anchors

**Files:**
- Modify: `src/storage.ts`
- Modify: `test/test-storage.mjs`

**Interfaces:**
- Consumes: `relocateAnchor()` contextual and unique-text fallback.
- Produces: persisted unique text restored as active; ambiguous text remains orphaned.

- [x] Add failing storage cases for a unique moved phrase and repeated moved phrase.
- [x] Run `rtk node test/test-storage.mjs` and confirm unique recovery fails.
- [x] Enable unique fallback only in persisted document relocation; keep live editor reconciliation strict.
- [x] Run storage and editor-anchor tests and confirm both policies pass.

### Task 3: Isolate Pending Saves Per File

**Files:**
- Modify: `src/storage.ts`
- Modify: `src/main.ts`
- Modify: `test/test-storage.mjs`
- Modify: `test/test-main-file-reference.mjs`

**Interfaces:**
- Produces: `MarkAnchorUpdateResult { document, changed, statusChanged }`.
- Maintains: one pending update map and debounce timer per file path.

- [x] Add tests proving no-op anchor batches avoid writes and status changes are reported.
- [x] Add source-level lifecycle assertions for per-file maps, rename migration, delete discard, and unload flush.
- [x] Run focused tests and confirm current global queue/no-op behavior fails.
- [x] Implement per-file update/timer state and rename/delete/unload handling.
- [x] Use update metadata to skip no-op refreshes and avoid sidebar rebuilding for offset-only changes.
- [x] Run storage, main-reference, and editor-anchor tests.

### Task 4: Preserve Marks When Preview Sections Are Missing

**Files:**
- Modify: `src/main.ts`
- Modify: `test/test-main-file-reference.mjs`

**Interfaces:**
- Consumes: optional internal preview section metadata.
- Produces: section rendering when available; no DOM-clearing fallback when unavailable.

- [x] Add a failing assertion that preview fallback must not call `renderReadingMarks(..., [])`.
- [x] Remove the destructive empty-render fallback and return without touching existing wrappers.
- [x] Run `rtk node test/test-main-file-reference.mjs`.
- [x] Run `rtk npm test`, `rtk npm run build`, `rtk git diff --check`, and the code-standards format check.
