# FloatMark

[简体中文](./README.md) | [English](./README.en.md)

FloatMark brings Feishu-like floating selection actions, inline marks, side comments, and optional Lark sync to Obsidian.

It is designed for users who want the document interaction style of Feishu / Lark Docs inside a local Obsidian vault: select text, act immediately from a floating toolbar, keep comments in a side panel, and optionally sync those comments back to a published Lark document.

## Features

- **Feishu-like floating toolbar**: select text and run common actions near the selection.
- **Quick Markdown formatting**: bold, italic, strikethrough, and inline code.
- **Inline marks**: multi-color highlights and comment marks that remain anchored to the original text.
- **Side comments**: manage document-level comment threads in the sidebar.
- **Local sidecar storage**: comments and visual marks are stored under `.obsidian-float-marks/` instead of being written into the Markdown body.
- **Anchor relocation**: after small text edits, FloatMark tries to relocate marks by offset, context, and selected text.
- **Optional Feishu / Lark sync**: when the current note has already been published by `obsidian-feishu-lark-cli-sync`, FloatMark can create a remote Lark comment on the mapped document block.

## Installation

### Manual Installation

Build the plugin from source:

```bash
git clone https://github.com/wanghuan9/obsidian-float-mark.git
cd obsidian-float-mark
npm install
npm run build
```

Then copy these files into your vault plugin directory, for example `.obsidian/plugins/obsidian-float-mark/`:

```text
manifest.json
main.js
styles.css
```

Restart Obsidian and enable `FloatMark` under Settings -> Community plugins.

## Usage

### Floating Selection Actions

Select text in editing mode or reading mode. FloatMark will show a floating toolbar where you can:

- Apply bold, italic, strikethrough, or inline code.
- Create a highlight or comment mark.
- Write the first comment from a compact popover.

Markdown formatting actions update the note body. Comments and visual marks are stored in sidecar JSON by default, so they do not pollute the Markdown content.

### Side Comment Management

Click the ribbon highlighter icon or open FloatMark from the command palette. The sidebar lists marks and comment threads for the current document. It supports:

- Editing comment content.
- Adding replies.
- Resolving or reopening comment threads.
- Deleting local marks.
- Jumping back to the selected text.
- Manually syncing a comment to Feishu / Lark.

## Relationship With Feishu Lark CLI Sync

FloatMark does **not** require `obsidian-feishu-lark-cli-sync`. It works independently as a local marking and commenting plugin.

You only need the sync plugin when you want to push local comments to Feishu / Lark:

- `obsidian-feishu-lark-cli-sync` publishes or synchronizes Obsidian Markdown notes to Feishu / Lark documents.
- FloatMark owns local selection marks, side comments, and remote comment sync to the mapped document block.

Lark comment sync requires:

- The current note contains `lark_doc_url` or `lark_doc_token`.
- The sync plugin has generated a block mapping file:

```text
.obsidian/plugins/feishu-lark-cli-sync/lark-sync-state.json
```

- The local machine has an authenticated `lark-cli`.

## Preparing Feishu / Lark Sync

Skip this section if you only use local marks and comments.

To sync comments to Feishu / Lark, install and authenticate `lark-cli` first:

```bash
npm install -g @larksuite/cli
lark-cli version
lark-cli auth login
lark-cli auth status
```

Then publish the current note with [Feishu Lark CLI Sync](https://github.com/wanghuan9/obsidian-feishu-lark-cli-sync) so the note has a `lark_doc_url` binding and block mapping.

## Settings

- `lark-cli path`: path used for syncing comments to Feishu / Lark. Defaults to `lark-cli` from PATH.
- `Open sidebar after creating a mark`: opens the sidebar after creating a mark or comment.
- `Auto-sync comments to Feishu`: syncs comments and replies in the background after they are created.
- `Comment display name`: author name shown in local sidebar threads.

## Notes

- FloatMark is local-first and does not require a network service by default.
- Local comments and visual marks are stored under `.obsidian-float-marks/`.
- Feishu / Lark sync is executed through the local `lark-cli`; the plugin does not store App Secret, access tokens, or OAuth configuration.
- Remote comment sync is optional. Notes that have not been published to Feishu / Lark can still use all local marking and commenting features.

## Development

```bash
npm install
npm run build
npm test
```

After changing source files, run `npm run build` again to generate `main.js`.

## License

MIT License
