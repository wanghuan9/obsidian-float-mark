# Editor Table Precise Marks Design

## Goal

Render active FloatMark annotations inside Obsidian Live Preview tables with the same text-range precision, appearance, overlap ordering, and click behavior as reading mode.

## Verified Runtime Structure

Obsidian 1.12.7 renders an editable Live Preview table as:

```text
.cm-embed-block.cm-table-widget.markdown-rendered
`-- .table-wrapper
    `-- table.table-editor
```

The widget host is `contenteditable=false`. CodeMirror's public `EditorView.posAtDOM()` maps the widget host directly to the complete Markdown table source range. Static-cell rendering requires no Obsidian private JavaScript API or custom Markdown cell parser.

When a cell becomes active, Obsidian replaces that cell's rendered contents with a nested CodeMirror editor under `.table-cell-wrapper`. The active `td` exposes standard DOM `rowIndex` and `cellIndex`, but no source offsets. CodeMirror's public `EditorView.findFromDOM()` retrieves the nested editor instance.

## Current Limitation

Normal editor marks use CodeMirror `Decoration.mark()` over Markdown source offsets. A table widget replaces those source characters with rendered DOM, so decorations remain attached to hidden source and cannot style the visible cell text.

Reading mode already solves the harder mapping problem: it clips marks to a rendered section, matches Markdown anchors against rendered text, applies overlapping wrappers, preserves inline formatting, and handles click interactions. The editor table path should reuse this implementation.

The nested active-cell editor owns and reconciles its DOM. Reading-mode wrapper spans inserted into that editor are removed by CodeMirror, so repeated DOM refreshes cannot make active-cell marks stable.

## Design

### Table DOM Renderer

Add `src/editor-table-renderer.ts` with two responsibilities:

- A pure render function locates visible table widgets, obtains each widget's source range with `view.posAtDOM()`, converts the range to zero-based line bounds, clips marks through `getReadingMarksForSection()`, and calls `renderReadingMarks()` on `table.table-editor`.
- A lifecycle controller schedules rendering after CodeMirror updates or table-widget DOM replacement, disconnects its observer while applying wrappers to avoid self-triggered loops, and clears wrappers when destroyed.

The renderer processes only widgets currently mounted in the editor viewport. Normal source text and source-mode tables continue using existing CodeMirror decorations.

### Source Snapshot

Cache the current CodeMirror `Text` object, its string source, and `lineStarts` inside the controller. Rebuild them only when `view.state.doc` changes. Mark changes reuse the source snapshot and rerender through the existing empty transaction refresh path.

### Active Cell Decorations

Detect `.table-cell-wrapper .cm-editor` instances inside each table and retrieve their nested `EditorView` with `EditorView.findFromDOM()`. Map the active cell's `rowIndex` and `cellIndex` to its Markdown source range using the widget source range and a narrow table-row scanner that recognizes unescaped pipe delimiters and trims Markdown table padding. This scanner only locates one rendered row and does not parse Markdown formatting.

Convert marks fully contained in that source range to cell-local offsets and build the same regular and outer CodeMirror decoration layers used by the normal editor. Install one state field into each nested editor through `StateEffect.appendConfig`, then update it only when the cell document or localized mark set changes. Exclude the active cell and its marks from the static reading-DOM renderer so CodeMirror-owned DOM is never wrapped or duplicated.

### Lifecycle

The editor ViewPlugin creates one table controller per `EditorView`.

- Constructor: observe `view.dom` and schedule an initial render for asynchronously mounted widgets.
- View update: schedule after document, viewport, or transaction updates.
- DOM mutation: schedule when Obsidian replaces or rerenders table widgets.
- Active cell transition: configure the newly created nested editor, update its decorations, and let the next render restore static wrappers after the nested editor is removed.
- Render: cancel duplicate frame requests, disconnect the observer, apply all mounted table marks, then reconnect.
- Destroy: cancel the frame, disconnect the observer, and remove FloatMark wrappers from remaining table widgets.

### Behavioral Parity

The table path reuses reading-mode classes and click handling, so it preserves:

- Exact text selection within a cell.
- Marks spanning multiple rendered text nodes and inline formats within a table cell.
- Bold, inline code, links, and other rendered inline structures.
- Overlapping mark specificity and creation-order behavior.
- Text color, background color, comment color, hover, and click behavior.
- Existing exclusion of resolved and orphaned marks.

When a table widget is absent because Obsidian exposes raw Markdown, existing editor decorations remain the rendering path.

## Failure Handling

If a candidate widget is detached or cannot be mapped by `posAtDOM()`, skip it for that render. The next CodeMirror update or DOM mutation retries. A widget without `table.table-editor` is ignored. These failures do not alter sidecar data or mark state.

## Testing

- Build a real CodeMirror test view whose table source range is replaced by a fixture widget matching Obsidian's verified DOM structure.
- Assert exact rendering of plain text, inline code, bold text, and overlapping marks across formatted nodes.
- Assert source outside the table is untouched, empty marks clear wrappers, and click behavior delegates to the existing handler.
- Assert the lifecycle controller schedules on updates, avoids observer loops, and clears on destroy through focused orchestration checks.
- Run the full test suite, production build, diff check, TypeScript compilation, and code-format check.
- Install into both configured vaults and verify the reported table marks in the target document through real Obsidian UI inspection.

## Scope Boundaries

- Do not change sidecar schema, anchor relocation, reading-mode rendering, or normal editor decorations.
- Do not add a general Markdown table parser or depend on Obsidian private JavaScript APIs. The active-cell mapper is limited to row selection and unescaped pipe boundaries.
- Do not virtualize tables or change Obsidian table editing behavior.
