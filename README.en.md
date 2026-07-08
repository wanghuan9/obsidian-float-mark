# FloatMark

[简体中文](./README.md) | [English](./README.en.md)

FloatMark is an Obsidian plugin for inline marks, comments, and floating quick-action toolbars, bringing a Feishu / Lark Docs-like experience to local notes.

It focuses on three core workflows: highlight or annotate text, manage comment discussions in a sidebar, and use selection or block-level floating toolbars for fast text and block actions. Comments can also be synced to Feishu / Lark when needed.

## Features

- **Feishu-like selection toolbar**: select text and run bold, italic, strikethrough, inline code, highlight, and comment actions near the selection.
- **Left-side block hover menu**: move the mouse to the left side of a paragraph, heading, list, quote, or code block to format the current block as body text, a heading, a list, a task, a quote, or a code block, or to comment, copy, or delete it.
- **Inline marks**: highlights and comment marks stay anchored to the original text in both editing mode and reading mode, with configurable text and background colors.
- **Comments and Lark sync**: manage document-level comment threads in the sidebar, including edit, reply, resolve, delete, jump back to source, and optional Feishu / Lark comment sync.
- **Local sidecar storage**: comments and visual marks are stored under `.obsidian-float-marks/` instead of being written into the Markdown body.
- **Anchor relocation**: after small text edits, FloatMark tries to relocate marks by offset, context, and selected text.

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

### Left-Side Block Actions

In editing mode, move the mouse to the left side of a paragraph, heading, list, quote, or code block. FloatMark will show a compact block hover menu where you can:

- Convert the current block to body text, heading levels 1-5, ordered list, unordered list, task list, quote, or code block.
- Create a comment mark for the current block.
- Copy or delete the current block.

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

- `Open sidebar after creating a mark`: opens the sidebar after creating a mark or comment.
- `Sync marks to Feishu`: syncs local comments and replies through Feishu Lark CLI Sync after they are created.
- `Feishu Lark CLI Sync`: shows the sync plugin status. The CLI path, authentication, and command execution are managed by Feishu Lark CLI Sync.
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
