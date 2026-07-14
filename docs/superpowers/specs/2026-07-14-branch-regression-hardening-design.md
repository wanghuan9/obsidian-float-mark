# Branch Regression Hardening Design

## Goal

Fix the correctness, concurrency, compatibility, and avoidable refresh problems found in the full `feature/reading-mode-precise-anchors` review without changing the sidecar schema or the existing table, sidebar order, and color behavior.

## Reading Selection Candidates

Reading selections must consider both exact source matches and Markdown-rendered matches. Candidates that map to the same rendered occurrence are deduplicated, preferring the exact source range. All remaining candidates use the existing context score and rendered distance. If the highest context score is tied, selection remains unresolved.

This keeps selection work scoped to the selected preview sections. It adds one linear search over the section and no I/O or DOM rebuild.

## Anchor Recovery

Live editor reconciliation remains strict: while the user is editing, a mark cannot jump to another occurrence through unique-text fallback. Persisted document relocation restores the original unique-text fallback, because a single occurrence is deterministic after external edits, sync, or plugin downtime. Repeated text without sufficient context remains orphaned.

## Per-File Anchor Save State

Pending anchor updates and debounce timers are keyed by file path. Editing file B cannot cancel or redirect file A's pending update. Rename migrates pending updates and its timer to the new path; delete discards them. Plugin unload starts best-effort persistence for every pending file before clearing timers.

`updateMarkAnchors()` reports whether it changed the sidecar and whether any mark visibility status changed. No-op batches do not rewrite the sidecar or advance the store revision. Sidebar refresh only runs for status changes; preview refresh still runs for changed anchors and uses the in-memory document when it belongs to the same file.

## Preview Compatibility Fallback

The optimized preview refresh continues to use Obsidian's mounted section metadata when available. If the internal section list is unavailable, it does not render an empty mark set or clear existing wrappers. Markdown postprocessors and later DOM updates remain responsible for rendering until section metadata becomes available again.

## Testing

- Mixed formatted/plain duplicate text selects the intended formatted occurrence.
- Exact and rendered candidates for one occurrence do not create a false tie.
- Persisted unique text relocates; duplicate text remains orphaned.
- Pending updates remain isolated across two files, migrate on rename, and are discarded on delete.
- No-op anchor batches do not write sidecars or trigger refresh work.
- Missing preview sections do not clear existing marks.
- Full tests, TypeScript compilation, production build, and diff checks pass.

## Scope Boundaries

- Do not change sidecar JSON shape.
- Do not change normal editor or active table-cell decoration behavior.
- Do not change sidebar ordering, filtering, or marker colors.
- Do not expand reading selection searches beyond the selected preview sections.
