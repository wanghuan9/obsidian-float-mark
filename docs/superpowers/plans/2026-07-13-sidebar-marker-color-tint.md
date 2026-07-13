# Sidebar Marker Color Tint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render every sidebar marker preview with a saturated left strip and a theme-aware light body through shared CSS variables.

**Architecture:** Existing highlight background selectors remain the single source of color values and expose reusable custom properties. The sidebar consumes those properties through two generic selectors, so editor and reading-mode backgrounds remain unchanged and new colors do not need sidebar-specific CSS blocks.

**Tech Stack:** CSS custom properties, CSS `color-mix()`, Node.js source-level regression tests, TypeScript/esbuild production build.

## Global Constraints

- Change only sidebar marker preview presentation.
- Preserve stored colors, swatches, editor rendering, reading-mode rendering, inheritance, and interactions.
- Keep the `none` background theme-neutral.
- Do not alter unrelated dirty worktree changes.

---

### Task 1: Add Generic Sidebar Marker Color Styling

**Files:**
- Modify: `styles.css`
- Test: `test/test-mark-appearance.mjs`

**Interfaces:**
- Consumes: Existing `side-mark--background-*`, `side-mark-marker-preview`, and `is-background-*` classes.
- Produces: `--side-mark-background-color` and optional `--side-mark-marker-accent-color` CSS variables for generic sidebar rendering.

- [x] **Step 1: Write the failing style regression assertions**

Add assertions that require every highlight background selector to declare `--side-mark-background-color`, require the sidebar preview body to use `color-mix()` with the shared accent, require the left strip to use the same accent, and reject per-color sidebar marker blocks.

```js
const backgroundColors = [
	"gray-light", "red-light", "orange-light", "yellow-light", "green-light", "blue-light", "purple-light",
	"gray", "red", "orange", "yellow", "green", "blue", "purple"
];
for (const color of backgroundColors) {
	assert.match(
		stylesSource,
		new RegExp(`\\.side-mark--highlight\\.side-mark--background-${color}\\s*\\{[^}]*--side-mark-background-color:`)
	);
}
assert.match(
	stylesSource,
	/\.side-mark-marker-card:not\(\.is-background-none\) \.side-mark-marker-preview\s*\{[^}]*color-mix\(in srgb, var\(--side-mark-marker-preview-accent\) 45%, var\(--background-primary\)\)/
);
assert.match(
	stylesSource,
	/\.side-mark-marker-card:not\(\.is-background-none\) \.side-mark-marker-preview::before\s*\{[^}]*background: var\(--side-mark-marker-preview-accent\)/
);
assert.doesNotMatch(stylesSource, /\.side-mark-marker-card\.is-background-(?!none)[\w-]+/);
```

- [x] **Step 2: Run the focused test to verify it fails**

Run: `rtk node test/test-mark-appearance.mjs`

Expected: FAIL because the shared variables and generic sidebar selectors do not exist yet.

- [x] **Step 3: Centralize color variables and add generic preview rules**

For each existing `.side-mark--highlight.side-mark--background-*` selector, place its existing background value in `--side-mark-background-color` and render the document background from that variable. Add `--side-mark-marker-accent-color` only where the saturated sidebar strip differs from the stored background color.

Use these exact values:

| Color class | Background | Sidebar accent override |
| --- | --- | --- |
| `gray-light` | `#f0f1f3` | `#a7adb8` |
| `red-light` | `#f8b8b8` | `#f45f5f` |
| `orange-light` | `#ffd8ad` | `#ff9f3a` |
| `yellow-light` | `#fff17a` | `#d9b900` |
| `green-light` | `#c8f0c4` | `#5fca50` |
| `blue-light` | `#cdd9ff` | `#91aaff` |
| `purple-light` | `#decaff` | `#b695f0` |
| `gray` | `#d7dadf` | `#a7adb8` |
| `red` | `#f45f5f` | use background fallback |
| `orange` | `#ff9f3a` | use background fallback |
| `yellow` | `#ffe11c` | `#d9b900` |
| `green` | `#5fca50` | use background fallback |
| `blue` | `#91aaff` | use background fallback |
| `purple` | `#b695f0` | use background fallback |

Replace all per-color `.side-mark-marker-card.is-background-*` blocks with:

```css
.side-mark-marker-card:not(.is-background-none) .side-mark-marker-preview {
	--side-mark-marker-preview-accent: var(--side-mark-marker-accent-color, var(--side-mark-background-color));
	background: color-mix(in srgb, var(--side-mark-marker-preview-accent) 45%, var(--background-primary));
}

.side-mark-marker-card:not(.is-background-none) .side-mark-marker-preview::before {
	background: var(--side-mark-marker-preview-accent);
}
```

- [x] **Step 4: Run the focused test to verify it passes**

Run: `rtk node test/test-mark-appearance.mjs`

Expected: PASS with `mark appearance tests passed`.

- [x] **Step 5: Run full verification**

Run: `rtk npm test`

Expected: all test scripts pass.

Run: `rtk npm run build`

Expected: TypeScript checking and the production esbuild bundle complete successfully.

Run: `rtk git diff --check`

Expected: no whitespace errors.

Run: `rtk python3 /Users/wanghuan/.skilldock/skills/code-standards/skills/code-standards/scripts/format-check.py --git-diff`

Expected: format check passes for changed lines.

- [x] **Step 6: Install and verify in both vaults**

Copy `main.js`, `styles.css`, and `manifest.json` into:

```text
/Users/wanghuan/Documents/obsidian/.obsidian/plugins/float-mark/
/Users/wanghuan/Documents/opt-knowledge/.obsidian/plugins/float-mark/
```

Expected: both plugin installations match the built workspace files, and blue/green previews visibly show a dark strip with a light body after FloatMark is reloaded.
