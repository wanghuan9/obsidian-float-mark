# Reading Table Selection Anchors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Map reading-mode selections inside rendered Markdown table cells back to exact source offsets while preserving ambiguous-selection rejection.

**Architecture:** Extend the existing rendered-source index with a precomputed set of table-only syntax offsets. Table detection and pipe classification remain pure helpers in `reading-selection.ts`; the existing candidate search, scoring, and storage path stay unchanged.

**Tech Stack:** TypeScript, Node.js, JSDOM, esbuild, Obsidian plugin build tooling.

## Global Constraints

- Do not lower `MIN_CONTEXT_SCORE` or accept ambiguous candidates.
- Preserve every retained rendered character's absolute Markdown source offset.
- Do not change sidecar schema, anchor relocation, reading rendering, or editor rendering.
- Ignore unrelated untracked `.superpowers/` content.
- Prefix every shell command with `rtk`.

---

### Task 1: Reproduce Real Table-cell Selections

**Files:**
- Modify: `test/test-reading-selection.mjs`

**Interfaces:**
- Consumes: `findSourceRangeForReadingSelection(source, selectedText, scope)` and `getReadingSelectionContext(containers, range)`.
- Produces: Regression fixtures for reported, repeated, optional-outer-pipe, escaped-pipe, and inline-code-pipe table selections.

- [ ] **Step 1: Add the reported table selection fixture**

Create a JSDOM table whose source row is:

```markdown
| 回收商名称 | `partner_account` 主账号 `name`（`account_type=1`） | `recycle_order.partner_id` |
```

Select from the first inline-code text node through the closing Chinese parenthesis. Call `getReadingSelectionContext()` and assert that `findSourceRangeForReadingSelection()` returns the source slice:

```markdown
`partner_account` 主账号 `name`（`account_type=1`）
```

- [ ] **Step 2: Add table disambiguation and syntax fixtures**

Add assertions that:

```js
// The second repeated recycle_order.partner_id maps to the second source row.
assert.equal(source.slice(repeatedRange.from, repeatedRange.to), "`recycle_order.partner_id");

// A table without optional outer pipes still maps the selected cell.
assert.equal(source.slice(noOuterRange.from, noOuterRange.to), "`partner_account");

// Escaped and inline-code pipes remain visible rather than being treated as cell separators.
assert.equal(source.slice(escapedRange.from, escapedRange.to), "A\\|B");
assert.equal(source.slice(codePipeRange.from, codePipeRange.to), "`left|right");
```

- [ ] **Step 3: Run the focused test and verify failure**

Run: `rtk node test/test-reading-selection.mjs`

Expected: FAIL on the first new table assertion because the current source context still contains table pipes and the delimiter row.

---

### Task 2: Normalize Markdown Table Structure

**Files:**
- Modify: `src/reading-selection.ts`
- Test: `test/test-reading-selection.mjs`

**Interfaces:**
- Consumes: Markdown source passed to `buildRenderedSourceIndex(source, sourceStartOffset)`.
- Produces: `findTableSyntaxOffsets(source): Set<number>` used only by rendered-source indexing.

- [ ] **Step 1: Precompute ignored table syntax offsets**

At the start of `buildRenderedSourceIndex()`, calculate:

```ts
const tableSyntaxOffsets = findTableSyntaxOffsets(source);
```

Before marker and whitespace handling, skip offsets contained in that set:

```ts
if (tableSyntaxOffsets.has(index)) {
	index += 1;
	continue;
}
```

- [ ] **Step 2: Detect table blocks without parsing unrelated Markdown**

Implement pure helpers that split source into offset-bearing lines, identify a delimiter row whose cells match `^:?-{3,}:?$`, require a pipe-delimited header immediately above it, and collect the header plus contiguous following pipe-delimited rows.

```ts
interface SourceLine {
	startOffset: number;
	text: string;
}

interface TablePipeScan {
	structuralPipes: number[];
	escapedPipeBackslashes: number[];
}
```

Reject delimiter candidates inside fenced code blocks and lines indented as code. Mark every character in a confirmed delimiter row as ignored.

- [ ] **Step 3: Classify visible and structural pipes**

Scan each table row while tracking matching backtick-run lengths:

```ts
if (char === "|" && codeRunLength === 0) {
	if (isEscapedAt(line, index)) {
		escapedPipeBackslashes.push(index - 1);
	} else {
		structuralPipes.push(index);
	}
}
```

Ignore structural pipe offsets and only the escaping backslash for `\\|`. Preserve pipes inside inline code and preserve the pipe character of an escaped pipe.

- [ ] **Step 4: Run focused tests**

Run: `rtk node test/test-reading-selection.mjs`

Expected: PASS with `reading selection tests passed`.

- [ ] **Step 5: Run existing renderer and anchor regression tests**

Run:

```bash
rtk node test/test-reading-view-renderer.mjs
rtk node test/test-anchors.mjs
rtk node test/test-editor-table-renderer.mjs
```

Expected: all three commands pass without changed snapshots or anchor behavior.

---

### Task 3: Audit Similar Rendered/source Mismatches

**Files:**
- Inspect: `src/reading-selection.ts`
- Inspect: `test/test-reading-selection.mjs`

**Interfaces:**
- Consumes: the completed table-aware `findSourceRangeForReadingSelection()` behavior.
- Produces: a verified list of remaining supported and unsupported Markdown constructs; no speculative production changes.

- [ ] **Step 1: Probe common mismatch constructs**

Use JSDOM ranges and exact Markdown source for:

```text
Task list:       - [ ] 待处理内容
Markdown link:  [显示文本](https://example.com)
Autolink:       <https://example.com>
Escaped text:   \*字面星号\*
HTML entity:    A &amp; B
Fenced code:    ```ts ... ```
Callout:        > [!note] 标题
```

For each case, record whether the candidate is found, rejected by context score, or mapped to an incorrect source range.

- [ ] **Step 2: Classify findings**

Use these categories:

```text
Supported: exact source range and stable context.
False negative: valid unique selection returns null.
Mis-anchor risk: selection returns a different occurrence or excludes required Markdown syntax.
Not selectable: rendered element exposes no text range.
```

Do not alter production normalization for findings that are outside the approved table scope. Report concrete reproductions and recommended follow-up priority.

- [ ] **Step 3: Run complete verification**

Run:

```bash
rtk npm test
rtk npm run build
rtk npx tsc --noEmit
rtk git diff --check
python3 /Users/wanghuan/.skilldock/skills/code-standards/skills/code-standards/scripts/format-check.py --git-diff
```

Expected: tests, build, TypeScript compilation, diff check, and changed-line format check all pass.

- [ ] **Step 4: Review the final diff**

Confirm that only the approved plan, `src/reading-selection.ts`, and `test/test-reading-selection.mjs` changed, apart from generated `main.js` if the repository build intentionally updates it. Verify no unrelated `.superpowers/` files are staged.
