# Editor Continuous Background Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate editor-mode background gaps around spaces and inline code without changing text-color or click behavior.

**Architecture:** Build regular and outer CodeMirror decoration sets from the same mark list. Explicit highlight backgrounds use `EditorView.outerDecorations`; regular decorations retain interaction metadata and foreground styles.

**Tech Stack:** TypeScript, CodeMirror 6, esbuild, Node.js tests, Obsidian 1.12.7.

## Global Constraints

- Do not change reading-mode rendering or persisted mark data.
- Do not expand any mark beyond its stored half-open source range.
- Keep the implementation limited to decoration construction and registration.

---

### Task 1: Split editor decoration layers

**Files:**
- Create: `src/editor-decorations.ts`
- Modify: `src/editor-extension.ts`
- Create: `test/test-editor-decorations.mjs`
- Modify: `package.json`
- Generate: `main.js`

**Interfaces:**
- Produces: `buildEditorDecorationLayers(marks, docLength, pendingSelection)` returning regular and outer `DecorationSet` values.
- Consumes: existing `SideMark` ranges and CodeMirror `Decoration` APIs.

- [x] Write tests asserting explicit backgrounds are outer-only while text color and `data-side-mark-id` remain regular.
- [x] Add cases for spaces with multiple inline-code source ranges, overlapping local text color, partial selection, line breaks, comments and pending comments.
- [x] Run the new test and confirm it fails before implementation.
- [x] Implement the minimal pure decoration-layer builder.
- [x] Register the outer set through `EditorView.outerDecorations` and keep the regular set in the existing plugin decoration provider.
- [x] Run targeted and full automated tests, TypeScript, build, diff and format checks.
- [x] Complete two-reviewer code review and close all findings.
- [x] Install verified artifacts and test editor and reading modes in Obsidian.
