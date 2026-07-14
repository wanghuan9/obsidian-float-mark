# Reading Render Snapshot Design

## Goal

Reduce initial reading-mode annotation latency by sharing source, sidecar relocation, and line-offset work across Markdown postprocessor sections without changing anchor precision, annotation appearance, comment behavior, or persistence semantics.

## Current Problem

Obsidian invokes the Markdown postprocessor once per rendered section. Each invocation currently performs the same work for the same file:

- Read the complete Markdown source.
- Read the sidecar document.
- Relocate every anchor.
- Build or retrieve source line starts.

`SideMarkStore.relocateDocument()` also enters the global mutation queue before it knows whether any anchor changed. Long documents therefore create repeated I/O and globally serialized no-op tasks that delay both initial rendering and unrelated annotation mutations.

## Design

### Reading Render Snapshot

Add a per-file cache in `SideMarkPlugin` whose value contains one in-flight or completed promise for:

```ts
interface ReadingRenderSnapshot {
	source: string;
	document: SideMarkDocument;
	lineStarts: number[];
}

interface ReadingRenderSnapshotLoad {
	sourceVersion: string;
	storeRevision: number;
	load: Promise<ReadingRenderSnapshot>;
}
```

The source version is derived from `TFile.stat.mtime` and `TFile.stat.size`. The store revision changes after sidecar mutations. A matching source version and revision reuse the same promise, so concurrent section processors share the source read, sidecar read, relocation, and line-start calculation.

After a successful load, the entry adopts the latest store revision. This prevents relocation's own anchor write from invalidating the snapshot that produced it. A rejected load removes only the matching cache entry so the next render can retry.

### Explicit Invalidation

Invalidate the affected file's snapshot when its Markdown file is modified, renamed, or deleted, and when a mark mutation requests a visual refresh. Clear all snapshots during plugin unload.

File version and store revision remain fallback guards for changes that reach rendering without an explicit invalidation. Existing preview generation checks remain responsible for rejecting stale container work.

### Relocation Fast Path

Refactor `SideMarkStore.relocateDocument()` into two phases:

1. Read a stable document after the mutation tail that existed at read start.
2. Relocate anchors outside the mutation queue.

If no anchor changes, return immediately without appending a mutation. If changes are detected, append one mutation that rereads the latest document and recalculates relocation against the same source. Write only if the second calculation still changes anchors.

The second read and calculation prevent an older relocation snapshot from overwriting concurrent color, note, reply, status, creation, or deletion mutations.

### Stable Document Read

`readStableDocument()` captures the current mutation tail, waits for it, reads the sidecar, and verifies that the tail did not change while reading. If another mutation was appended, it retries against the new tail. This provides a current read without occupying the mutation queue.

Expose a read-only store revision through `getRevision()` for snapshot versioning. Keep the existing global mutation queue for actual writes, rename, delete, and vault-wide loading; changing queue ownership is outside this optimization.

## Behavioral Guarantees

- Anchor relocation rules and orphan recovery remain unchanged.
- Reading-mode marks render from the same source and sidecar snapshot within a section render.
- No-op relocation performs no sidecar write and does not block later unrelated mutations while its stable read is in progress.
- Changed relocation is recalculated inside the mutation queue before writing.
- Existing preview generation guards, observer rendering, fresh-document rendering, sidebar behavior, and editor behavior remain unchanged.
- Rename and delete operations retain global serialization.

## Verification

- Add storage tests proving a later write can finish while a no-op relocation read is blocked.
- Add storage tests proving changed relocation waits for and preserves a concurrent mark mutation before writing.
- Add source-level orchestration tests for per-file snapshot reuse, failed-load eviction, version checks, and modify/rename/delete/unload invalidation.
- Run the full test suite, production build, diff check, code-format check, and lint-equivalent TypeScript compilation.
- Install `main.js`, `styles.css`, and `manifest.json` into both configured Obsidian vaults and verify SHA-256 checksums.
