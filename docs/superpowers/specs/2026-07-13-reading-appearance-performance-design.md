# Reading Appearance Performance Design

## Goal

Reduce the delay when changing highlight colors or restoring defaults in reading mode without changing final rendering, persistence, or reset semantics.

## Current Bottlenecks

- The first color selection creates a mark with the selected appearance and then immediately writes the same appearance again.
- Each appearance change serially waits for sidecar persistence, sidebar rendering, Markdown rereading, sidecar rereading, anchor relocation, and preview rendering.
- A sidecar write invalidates the complete vault-document cache, so a visible vault-scoped sidebar may reread every sidecar file.
- Editor and reading selection popovers duplicate the same mark-creation concurrency logic.

## Design

### Selection Session

Extract one shared new-mark style session used by editor and reading selections. The session tracks the latest choice while creation is pending:

- The first choice starts one mark creation using that appearance.
- Additional choices during creation only replace the pending latest choice.
- After creation, an appearance update runs only when the latest choice differs from the created appearance.
- Reset requested during creation deletes the mark immediately after creation completes.
- Existing-mark changes continue to use the current persisted update path.

This removes the unconditional duplicate write while preserving the last user choice during rapid interaction.

### Refresh Fast Path

Appearance, status, note, reply, creation, and deletion changes already return a fresh `SideMarkDocument`. Pass that document into preview rendering instead of rereading and relocating the same sidecar.

- Use `MarkdownView.data` as the current preview source.
- Skip anchor relocation only when a matching fresh document is explicitly provided.
- Keep the existing relocate path for observer-driven or general preview renders.
- Refresh the sidebar and reading preview concurrently from the same persisted snapshot.
- Render multiple matching preview leaves concurrently.

### Incremental Vault Cache

When `writeDocument` succeeds and the all-document cache is already loaded, replace only the matching document in that cache. Preserve the full invalidation path for settings changes, document deletion, and rename cleanup.

## Behavioral Guarantees

- Color and text-color results remain unchanged.
- Restore default continues to delete the highlight.
- The interface still refreshes only after persistence succeeds; there is no optimistic flash or rollback.
- Rapid choices during initial creation end with the last selected appearance.
- Preview generation guards continue to reject stale renders.

## Verification

- Add storage tests proving a successful write updates an already-loaded vault cache without listing or rereading all sidecars.
- Add source-level orchestration tests for the shared selection session, latest-choice comparison, fresh-document preview path, `view.data`, and parallel refresh.
- Run the full test suite, production build, formatting check, and diff check.
- Install matching plugin artifacts into both configured Obsidian vaults.
