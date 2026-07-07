# Obsidian Side Mark MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Obsidian plugin with a Feishu-like floating selection toolbar, local comments, and optional Lark comment sync through the existing Feishu Lark CLI Sync plugin state.

**Architecture:** The plugin owns annotation UX and sidecar storage. Lark sync is optional and reads `lark_doc_url` plus `.obsidian/plugins/feishu-lark-cli-sync/lark-sync-state.json`; comments sync to the first mapped remote block hit by the selected local range.

**Tech Stack:** Obsidian plugin API, CodeMirror 6, TypeScript, esbuild, Node test runner.

## Global Constraints

- Keep this as a separate plugin project under `/Users/wanghuan/data/ak3/obsidian-side-mark`.
- Do not modify `/Users/wanghuan/data/ak3/obsidian-feishu-lark-cli-sync`.
- Markdown-compatible style commands may edit the note; comments and visual marks stay in sidecar JSON.
- Lark sync is available only when the existing sync plugin has a document binding and block mapping.

---

### Task 1: Project Skeleton

**Files:**
- Create: `package.json`, `manifest.json`, `tsconfig.json`, `esbuild.config.mjs`
- Create: `src/main.ts`

**Interfaces:**
- Produces: buildable Obsidian plugin entry point `SideMarkPlugin`.

- [x] Create npm scripts for `build`, `dev`, and `test`.
- [x] Configure esbuild to bundle `src/main.ts` to `main.js`.
- [x] Add Obsidian manifest with plugin id `obsidian-side-mark`.

### Task 2: Local Annotation Model

**Files:**
- Create: `src/types.ts`
- Create: `src/storage.ts`
- Create: `src/anchors.ts`

**Interfaces:**
- Produces: `SideMarkStore`, `createTextAnchor`, and `relocateAnchor`.

- [x] Store per-file JSON documents under `.obsidian-side-marks/files/<hash>.json`.
- [x] Track selected text, offsets, context, note content, mark style, and optional remote sync state.
- [x] Relocate anchors by exact offset, contextual selected text, then unique exact text.

### Task 3: Editor UX

**Files:**
- Create: `src/editor-extension.ts`
- Create: `src/selection-toolbar.ts`
- Create: `src/comment-popover.ts`
- Create: `styles.css`

**Interfaces:**
- Produces: `createSideMarkEditorExtension(plugin)`.

- [x] Show a floating toolbar above non-empty selections.
- [x] Support bold, italic, strikethrough, inline code, highlight, and comment.
- [x] Render highlight decorations from sidecar marks.
- [x] Save comments through a compact popover.

### Task 4: Sidebar

**Files:**
- Create: `src/sidebar-view.ts`

**Interfaces:**
- Produces: Obsidian view type `side-mark-sidebar`.

- [x] Show current document comments.
- [x] Allow edit, delete, resolve, jump, and sync-to-Lark actions.

### Task 5: Lark Bridge

**Files:**
- Create: `src/lark-bridge.ts`
- Create: `src/block-map.ts`

**Interfaces:**
- Produces: `syncMarkToLark(file, source, mark)`.

- [x] Read `lark_doc_url`/`lark_doc_token` from frontmatter.
- [x] Read `lark-sync-state.json` from the existing sync plugin.
- [x] Map selected offset to the first local top-level block and remote block id.
- [x] Call `lark-cli drive +add-comment --block-id`.

### Task 6: Verification

**Files:**
- Create: `test/test-anchors.mjs`
- Create: `test/test-block-map.mjs`

**Interfaces:**
- Produces: repeatable tests for anchor relocation and block matching.

- [x] Run `npm test`.
- [x] Run `npm run build`.
