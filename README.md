# FloatMark

Feishu-like floating selection actions, side comments, and optional Lark sync for Obsidian.

This plugin is intentionally separate from `obsidian-feishu-lark-cli-sync`.
It works on its own as a local marking/commenting tool. When the Feishu sync
plugin has already published the current note, FloatMark can read that plugin's
document binding and block mapping, then create a Lark comment on the first
remote block hit by the local selection.

## MVP Features

- Floating selection toolbar for bold, italic, strikethrough, inline code, highlight, and comment.
- Local sidecar JSON storage under `.obsidian-float-marks/`.
- Current-document sidebar for editing, resolving, deleting, jumping to, and syncing comments.
- Optional Lark comment sync through `lark-cli drive +add-comment`.

## Development

```bash
npm install
npm run build
npm test
```

## Relationship With Feishu Lark CLI Sync

FloatMark does not require the sync plugin. Lark sync is enabled only when the
current note contains `lark_doc_url` or `lark_doc_token` and the existing sync
plugin has a block mapping in:

```text
.obsidian/plugins/feishu-lark-cli-sync/lark-sync-state.json
```
