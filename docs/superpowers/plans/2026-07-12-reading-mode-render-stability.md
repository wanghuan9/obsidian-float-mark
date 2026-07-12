# Reading Mode Render Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate missing, corrupted, and invisible reading-mode annotations while preserving existing sidecar data and interactions.

**Architecture:** Replace cross-element Range extraction with a single render plan that splits every annotation into text-node-local fragments and builds overlapping wrappers deterministically. Clip anchors to each rendered section and protect preview rendering with observer-root tracking and generation checks.

**Tech Stack:** TypeScript, Obsidian Markdown post-processors, DOM Range/Text APIs, MutationObserver, Node.js tests with jsdom.

## Global Constraints

- Keep the current sidecar schema unchanged.
- Never place block elements inside annotation spans.
- Preserve click behavior and existing CSS classes.
- Do not add user-facing settings or change annotation creation behavior.

---

### Task 1: Reading-mode rendering root fix

**Files:**
- Modify: `src/reading-view-renderer.ts`
- Modify: `src/main.ts`
- Modify: `test/test-reading-view-renderer.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: existing `SideMark` anchors, Obsidian section line ranges, rendered Text nodes.
- Produces: stable `.side-mark-reading` wrappers confined to individual Text nodes.

- [ ] Install `jsdom` as a development dependency.
- [ ] Add failing DOM tests for cross-block, inline code, overlaps, repeated rendering, and clearing.
- [ ] Replace `extractContents()` with node-local fragment planning and deterministic nested wrappers.
- [ ] Add section anchor clipping tests and implementation.
- [ ] Track observer roots and render generations in `SideMarkPlugin`.
- [ ] Run `npm test`, `npm run build`, format checks, and code review.
- [ ] Install the build and repeat edit/reading mode switching in the real note.
