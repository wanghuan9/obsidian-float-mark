# Sidebar Inherited Background Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a mark's effective inherited background in the sidebar using the approved dashed-ring swatch and inherited label.

**Architecture:** Resolve the effective background with a pure function over same-document marks, preserving explicit child styles and sidecar data. Feed the resolved value into the existing sidebar preview and metadata, then distinguish inherited values with CSS and localized text.

**Tech Stack:** TypeScript, Obsidian DOM helpers, CSS, esbuild, Node.js tests.

## Global Constraints

- Do not change the sidecar schema.
- Do not copy inherited backgrounds into child marks.
- Do not change editor or reading-mode rendering.
- Only full-range containment produces a single inherited background.
- All shell commands use the `rtk` prefix.

---

### Task 1: Resolve and display inherited backgrounds

**Files:**
- Create: `src/mark-appearance.ts`
- Create: `test/test-mark-appearance.mjs`
- Modify: `src/sidebar-view.ts`
- Modify: `src/i18n.ts`
- Modify: `styles.css`
- Modify: `test/test-i18n.mjs`
- Modify: `package.json`
- Generate: `main.js`

**Interfaces:**
- Produces: `resolveMarkBackground(mark: SideMark, marks: SideMark[]): ResolvedMarkBackground`
- Produces: `{ color: MarkBackgroundColor; inherited: boolean }`

- [x] **Step 1: Write the failing effective-background test**

Create a bundled test using a blue-text child inside a `red-light` background mark. Assert inherited red, explicit-background precedence, nearest full container, and rejection of partial, inactive, comment, background-less, and cross-file candidates.

- [x] **Step 2: Run the focused test and verify failure**

Run: `rtk node test/test-mark-appearance.mjs`

Expected: FAIL because `src/mark-appearance.ts` does not exist.

- [x] **Step 3: Implement the pure resolver**

Return the mark's explicit background when present. Otherwise scan active same-file highlight marks that fully contain the current range, selecting the shortest candidate and the later document item on equal ranges.

- [x] **Step 4: Connect the resolver to the sidebar**

Pass all document marks into `renderMarkCard()`. Use the resolved color for the card background class, preview class, and background swatch. Add `is-inherited` to the swatch and render the localized inherited chip when applicable.

- [x] **Step 5: Add the approved visual treatment**

Add a 1px dashed outline around inherited swatches and a compact muted pill for the inherited label. Add Chinese and English inherited labels and tooltips.

- [x] **Step 6: Run complete verification**

Run `rtk npm test`, `rtk npm run build`, and `rtk git diff --check`; all commands must pass.

- [x] **Step 7: Install and verify in Obsidian**

Copy the final plugin assets to `/Users/wanghuan/Documents/obsidian/.obsidian/plugins/float-mark/`, reload Obsidian, and confirm the child card shows blue text, inherited red preview background, dashed red swatch, and the inherited label.
