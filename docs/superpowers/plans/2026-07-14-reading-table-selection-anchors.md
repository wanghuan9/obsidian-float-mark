# Reading Table Selection Anchors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Map reading-mode selections across common rendered/source Markdown differences back to exact source offsets while preserving ambiguous-selection rejection.

**Architecture:** Extend the rendered-source index with table syntax offsets and explicit source end offsets for multi-character escapes and entities. Keep the existing context scorer for multiple candidates, with a bounded nearby fallback only when the confirmed preview section contains one candidate.

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

- [x] **Step 1: Add the reported table selection fixture**

Create a JSDOM table whose source row is:

```markdown
| 回收商名称 | `partner_account` 主账号 `name`（`account_type=1`） | `recycle_order.partner_id` |
```

Select from the first inline-code text node through the closing Chinese parenthesis. Call `getReadingSelectionContext()` and assert that `findSourceRangeForReadingSelection()` returns the source slice:

```markdown
`partner_account` 主账号 `name`（`account_type=1`）
```

- [x] **Step 2: Add table disambiguation and syntax fixtures**

Add assertions that:

```js
// The second repeated recycle_order.partner_id maps to the second source row.
assert.equal(source.slice(repeatedRange.from, repeatedRange.to), "recycle_order.partner_id");

// A table without optional outer pipes still maps the selected cell.
assert.equal(source.slice(noOuterRange.from, noOuterRange.to), "partner_account");

// Escaped and inline-code pipes remain visible rather than being treated as cell separators.
assert.equal(source.slice(escapedRange.from, escapedRange.to), "A\\|B");
assert.equal(source.slice(codePipeRange.from, codePipeRange.to), "left|right");
```

- [x] **Step 3: Run the focused test and verify failure**

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

- [x] **Step 1: Precompute ignored table syntax offsets**

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

- [x] **Step 2: Detect table blocks without parsing unrelated Markdown**

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

- [x] **Step 3: Classify visible and structural pipes**

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

- [x] **Step 4: Run focused tests**

Run: `rtk node test/test-reading-selection.mjs`

Expected: PASS with `reading selection tests passed`.

- [x] **Step 5: Run existing renderer and anchor regression tests**

Run:

```bash
rtk node test/test-reading-view-renderer.mjs
rtk node test/test-anchors.mjs
rtk node test/test-editor-table-renderer.mjs
```

Expected: all three commands pass without changed snapshots or anchor behavior.

---

### Task 3: Handle and Audit Similar Rendered/source Mismatches

**Files:**
- Modify: `src/reading-selection.ts`
- Modify: `test/test-reading-selection.mjs`

**Interfaces:**
- Consumes: the completed table-aware `findSourceRangeForReadingSelection()` behavior.
- Produces: verified handling for nearby unique candidates, escaped punctuation, HTML entities, inline-code literals, headings, links, autolinks, inline HTML, task lists, fenced code, and Callout content.

- [x] **Step 1: Probe common mismatch constructs**

Use JSDOM ranges and exact Markdown source for:

```text
Task list:       - [x] 待处理内容
Markdown link:  [显示文本](https://example.com)
Autolink:       <https://example.com>
Escaped text:   \*字面星号\*
HTML entity:    A &amp; B
Fenced code:    ```ts ... ```
Callout:        > [!note] 标题
```

For each case, record whether the candidate is found, rejected by context score, or mapped to an incorrect source range.

- [x] **Step 2: Classify findings**

Use these categories:

```text
Supported: exact source range and stable context.
False negative: valid unique selection returns null.
Mis-anchor risk: selection returns a different occurrence or excludes required Markdown syntax.
Not selectable: rendered element exposes no text range.
```

Use explicit source end offsets for escapes and entities. Accept a single candidate only when its normalized rendered distance is at most eight characters; keep the context threshold and unique-best-score requirement for multiple candidates.

- [x] **Step 3: Run complete verification**

Run:

```bash
rtk npm test
rtk npm run build
rtk npx tsc --noEmit
rtk git diff --check
python3 /Users/wanghuan/.skilldock/skills/code-standards/skills/code-standards/scripts/format-check.py --git-diff
```

Expected: tests, build, TypeScript compilation, diff check, and changed-line format check all pass.

- [x] **Step 4: Review the final diff**

Confirm that only the approved plan, `src/reading-selection.ts`, and `test/test-reading-selection.mjs` changed, apart from generated `main.js` if the repository build intentionally updates it. Verify no unrelated `.superpowers/` files are staged.

---

### Task 4: Accept Unique Exact-source Candidates with Incompatible DOM Context

**Files:**
- Modify: `src/reading-selection.ts`
- Test: `test/test-reading-selection.mjs`

**Interfaces:**
- Consumes: direct substring ranges and rendered-source ranges produced by `findSourceCandidates()`.
- Produces: `SourceCandidate.isExactSource`, preserving exact-source provenance through rendered-offset deduplication.

- [x] **Step 1: Add exact-source and safety regression tests**

Add a heading fixture whose source scope contains only:

```markdown
### 3.4 业务标签
```

Select `3.4 业务标签`, pass deliberately incompatible `prefix`, `suffix`, and a large `renderedOffset`, and assert the exact source range is returned. Keep a repeated identical-heading assertion that returns `null`. Change the distant unique fixture to a rendered-only selection such as source `**目**标` with selected text `目标`, and continue asserting `null`.

- [x] **Step 2: Run the focused test and verify failure**

Run: `rtk node test/test-reading-selection.mjs`

Expected: FAIL on the unique exact heading assertion because the only candidate exceeds `MAX_UNIQUE_RENDERED_DISTANCE` and has incompatible context.

- [x] **Step 3: Preserve candidate provenance and accept a unique exact source match**

Add the provenance field:

```ts
interface SourceCandidate {
	from: number;
	to: number;
	isExactSource: boolean;
	renderedDistance: number;
	contextScore: number;
}
```

Map direct ranges with `isExactSource: true` and rendered ranges with `isExactSource: false`. Keep direct ranges first so deduplication preserves exact provenance. Update the single-candidate rule to:

```ts
const only = candidates[0];
if (
	candidates.length === 1
	&& (only?.isExactSource || only?.renderedDistance <= MAX_UNIQUE_RENDERED_DISTANCE)
) {
	return only;
}
```

Do not change multiple-candidate scoring or acceptance.

- [x] **Step 4: Run focused and complete verification**

Run:

```bash
rtk node test/test-reading-selection.mjs
rtk npm test
rtk npx tsc --noEmit
rtk npm run build
rtk git diff --check
rtk python3 /Users/wanghuan/.skilldock/skills/code-standards/skills/code-standards/scripts/format-check.py --git-diff
```

Expected: focused tests, full tests, TypeScript compilation, production build, diff check, and changed-line format check all pass.

- [x] **Step 5: Install and verify in both Obsidian vaults**

Copy the built `main.js` to:

```text
/Users/wanghuan/Documents/opt-knowledge/.obsidian/plugins/float-mark/main.js
/Users/wanghuan/Documents/obsidian/.obsidian/plugins/float-mark/main.js
```

Verify both installed files have the same SHA-256 as the build output. Reload Obsidian, select `3.4 业务标签` in the reported document, and confirm the `高亮标注` and `评论` actions appear without creating a mark.
