# FloatMark

[English](./README.md) | [简体中文](./README.zh-CN.md)

FloatMark is an Obsidian plugin for inline marks, comments, and floating quick-action toolbars, bringing a Feishu / Lark Docs-like experience to local notes.

It focuses on three core workflows: highlight or annotate text, manage comment discussions in a sidebar, and use selection or block-level floating toolbars for fast text and block actions. Comments can also be synced to Feishu / Lark when needed.

## Features

- **Feishu-like selection toolbar**: select text and run bold, italic, strikethrough, inline code, highlight, and comment actions near the selection.
- **Left-side block hover menu**: move the mouse to the left side of a paragraph, heading, list, quote, or code block to format the current block as body text, a heading, a list, a task, a quote, or a code block, or to comment, copy, or delete it.
- **Inline highlight marks**: highlights stay anchored to the original text in both editing mode and reading mode, with configurable text and background colors.
- **Comments and Lark sync**: manage document-level comment threads in the sidebar, including edit, reply, resolve, delete, jump back to source, and optional Feishu / Lark comment sync.
- **Local sidecar storage**: comments and visual marks are stored under `.obsidian-float-marks/` instead of being written into the Markdown body.
- **Anchor relocation**: after small text edits, FloatMark tries to relocate marks by offset, context, and selected text.

## Usage

### Floating Quick-Action Toolbars

Select text in editing mode or reading mode, and FloatMark shows a floating toolbar near the selection for bold, italic, strikethrough, inline code, highlight marks, and comments. Move the mouse to the left side of a content block to open block-level quick actions.

<table>
  <tr>
    <td width="62%" align="center">
      <img src="docs/screenshots/selection-toolbar.png" alt="Floating quick-action toolbar after selecting text" width="100%">
    </td>
    <td width="38%" align="center">
      <img src="docs/screenshots/selection-format-menu.png" alt="Format menu inside the selection toolbar" width="100%">
    </td>
  </tr>
</table>

After selecting text, the quick-action toolbar appears first. Open the format menu to switch body text, headings, lists, quotes, and more.

<table>
  <tr>
    <td width="42%" align="center">
      <img src="docs/screenshots/selection-flow-entry.png" alt="Block hover entry beside the document heading" width="100%">
    </td>
    <td width="58%" align="center">
      <img src="docs/screenshots/selection-flow-format-menu.png" alt="Expanded format menu" width="100%">
    </td>
  </tr>
</table>

The block entry stays compact until expanded, then exposes block format changes, comments, copy, and delete actions.

### Inline Highlight Marks

Inline highlight marks are rendered directly on the source text, making it easy to separate highlights, risks, open questions, and passages worth revisiting. Marks stay anchored to the source text in both editing mode and reading mode.

<p align="center">
  <img src="docs/screenshots/highlight-style-popover.png" alt="Text and background color picker for highlight marks" width="58%">
</p>

When creating highlight marks, choose text and background colors to distinguish different types of information.

<table>
  <tr>
    <td width="68%" align="center">
      <img src="docs/screenshots/inline-marks.png" alt="Inline highlight marks with multiple colors in the document body" width="100%">
    </td>
    <td width="32%" align="center">
      <img src="docs/screenshots/highlight-sidebar.png" alt="Highlight-mark list in the sidebar" width="100%">
    </td>
  </tr>
</table>

Multi-color highlights render directly in the document body. The sidebar collects highlight marks for review, color or note edits, and jump-back navigation.

Markdown formatting actions update the note body. Comments and visual marks are stored in sidecar JSON by default, so they do not pollute the Markdown content.

### Comments and Feishu / Lark Sync

Click the ribbon highlighter icon or open FloatMark from the command palette. The sidebar lists comment threads for the current document and supports editing, replying, resolving, deleting, and jumping back to the source text.

Local comments can be synced from the sidebar to a published Feishu / Lark document with one click. After syncing, they appear as native Feishu / Lark comment threads for remote collaboration.

<table>
  <tr>
    <td width="50%" align="center">
      <img src="docs/screenshots/local-comment-sidebar.png" alt="Local comment sidebar in Obsidian" width="100%">
    </td>
    <td width="50%" align="center">
      <img src="docs/screenshots/lark-comment-sync.png" alt="Native comment threads after syncing to Feishu / Lark" width="100%">
    </td>
  </tr>
</table>

The left image shows local comment threads in Obsidian; the right image shows the native Feishu / Lark comments after one-click sync.

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

- `Language`: choose the FloatMark interface language. When no language is saved yet, FloatMark initializes from the current Obsidian language once, then uses the saved setting.
- `Open sidebar after creating a mark`: opens the sidebar after creating a mark or comment.
- `Sync marks to Feishu`: syncs local comments and replies through Feishu Lark CLI Sync after they are created.
- `Feishu Lark CLI Sync`: shows the sync plugin status. The CLI path, authentication, and command execution are managed by Feishu Lark CLI Sync.
- `Comment display name`: author name shown in local sidebar threads.

## Notes

- FloatMark is local-first and does not require a network service by default.
- Local comments and visual marks are stored under `.obsidian-float-marks/`.
- Feishu / Lark sync is executed through the local `lark-cli`; the plugin does not store App Secret, access tokens, or OAuth configuration.
- Remote comment sync is optional. Notes that have not been published to Feishu / Lark can still use all local marking and commenting features.

## Installation

### Manual Installation

Build the plugin from source:

```bash
git clone https://github.com/wanghuan9/obsidian-float-mark.git
cd obsidian-float-mark
npm install
npm run build
```

Then copy these files into your vault plugin directory, for example `.obsidian/plugins/float-mark/`:

```text
manifest.json
main.js
styles.css
```

Restart Obsidian and enable `FloatMark` under Settings -> Community plugins.

## Development

```bash
npm install
npm run build
npm test
```

After changing source files, run `npm run build` again to generate `main.js`.

## License

MIT License
