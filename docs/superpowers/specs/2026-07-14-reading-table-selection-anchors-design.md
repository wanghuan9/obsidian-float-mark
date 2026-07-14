# Reading Table Selection Anchors Design

## Goal

Allow reading-mode selections whose rendered text differs from Markdown source syntax to map back to the exact source range without weakening duplicate-text protection or changing stored anchor semantics.

## Confirmed Failure

The reading selection path normalizes whitespace and inline Markdown markers, then compares the rendered selection and its surrounding DOM text with a source-derived text index. Markdown table source contains structural pipes and a delimiter row, while the rendered table DOM contains only cell text.

For the reported row, the selected text has a valid source candidate, but the source context contains `|` characters that are absent from the DOM context. The candidate therefore falls below the context-score threshold and is rejected as unresolved.

The existing reading-selection tests mention table source only as text following a list. They do not create a rendered table or select text inside a table cell.

## Considered Approaches

### Table-aware source normalization

Recognize Markdown table blocks while building the rendered-source index. Ignore the delimiter row and structural cell-separator pipes while retaining the source offset for every visible character.

This preserves the current matching, context scoring, duplicate rejection, and anchor storage behavior. It is the selected approach.

### Accept any unique text candidate

Return a candidate when the normalized selected text occurs only once, even if its context score is below the threshold.

This is smaller but unsafe: a section can expose only one candidate because of incorrect bounds or incomplete rendering, and accepting it would turn a visible failure into a misplaced annotation.

### Map through table row and cell coordinates

Locate the selected DOM cell, parse the Markdown table into rows and cells, and map the range within that cell.

This can be precise but requires a Markdown table parser that handles escaped pipes, inline code, alignment, and malformed rows. It duplicates Obsidian parsing behavior and is unnecessary for the confirmed failure.

## Design

Extend the existing rendered-source index construction with table-block awareness:

- Detect a delimiter row using standard Markdown table alignment-cell syntax.
- Treat the immediately preceding row and contiguous following pipe-delimited rows as the same table block.
- Exclude the delimiter row because it has no rendered text.
- Exclude only structural, unescaped pipe separators from table rows.
- Preserve visible pipe characters that are escaped or contained inside inline code.
- Continue removing whitespace and existing inline Markdown markers through the current rules.
- Keep every retained rendered character mapped to its original absolute source offset.

No changes are made to the selection API, context threshold, candidate sorting, sidecar schema, relocation behavior, reading renderer, or editor renderer.

## Common Rendered/source Mismatches

The rendered-source index also covers common constructs where source text differs from rendered DOM text:

- Task-list markers.
- Markdown links and autolinks.
- Escaped punctuation.
- HTML entities and inline HTML.
- Fenced-code language markers.
- Callout metadata.

Escaped punctuation and HTML entities retain explicit source end offsets, so a rendered character can map back to a multi-character source span. Inline-code content keeps escapes and entities literal. For syntax that still yields one nearby candidate inside the confirmed preview section, accept it when its rendered offset differs by no more than eight normalized characters. Multiple candidates continue to require the existing context threshold and unique best score; distant unique text remains unresolved.

## Unique Exact-source Compatibility

Obsidian can expose a preview section whose DOM wrapper contains text outside the section's reported Markdown source bounds. In that case the selected text can have one exact source occurrence while its DOM-derived prefix, suffix, and rendered offset describe a wider wrapper. Rejecting that occurrence produces a false unresolved result for ordinary headings such as `3.4 业务标签`.

Track whether each candidate came from an exact substring match or rendered-text normalization. Apply these acceptance rules in order:

1. If the confirmed source scope contains exactly one exact substring candidate, accept it regardless of DOM context score or rendered distance.
2. If there is one rendered-only candidate, retain the nearby-distance and context requirements.
3. If there are multiple candidates of either kind, retain the context threshold and require a unique best context score.
4. If no candidate exists in the confirmed source scope, remain unresolved.

This is intentionally broader than a heading special case: plain paragraphs, link labels, table cells, and other selectable text receive the same compatibility behavior. It does not choose the first occurrence of repeated text and does not accept generated DOM text that has no source occurrence.

## DOM Selection Artifact Compatibility

Obsidian can insert non-rendering DOM sentinels around heading controls, inline-code widgets, and table-cell boundaries. A browser selection may therefore contain `U+200B`–`U+200D`, `U+FEFF`, or the `U+FFFC` object-replacement character even though the highlighted text looks identical to the Markdown source.

The confirmed reproductions are:

- `4.1 方案概览` resolves, while `U+200B + 4.1 方案概览` does not.
- The reported `pjt-partner-api` cell resolves without a sentinel, while the same visible selection followed by `U+FFFC` does not.

Sanitize only these known non-rendering sentinels before candidate discovery. Use the sanitized text for both direct substring ranges and rendered-source normalization so a visually exact heading retains exact-source provenance and a table selection spanning inline code can enter the existing rendered-source path. If sanitization removes the whole selection, return unresolved.

Do not strip arbitrary Unicode control or format characters. Do not lower the distance or context thresholds. Multiple candidates continue through the existing contextual disambiguation, so repeated headings and repeated table text remain unresolved unless their surrounding context uniquely identifies one occurrence.

This is preferred over stripping every control character, which could alter authored content, and over DOM-node coordinate mapping, which would duplicate Obsidian rendering behavior and add substantially more surface area.

## Verification

- Add a JSDOM regression test using the reported table row and an actual selection spanning multiple inline-code nodes inside one cell.
- Assert the returned source range includes the corresponding Markdown backticks and excludes adjacent table cells.
- Add a repeated-value table case proving row context still selects the intended occurrence.
- Add table fixtures for optional outer pipes, alignment markers, escaped pipes, inline-code pipes, and a table nested in a blockquote or Callout.
- Add regression fixtures for repeated bold labels, headings, links, autolinks, escaped punctuation, HTML entities, inline HTML, and literal inline-code content.
- Add a heading fixture whose exact source scope contains only the heading while its DOM context and rendered offset describe surrounding blocks; require the unique exact candidate to resolve.
- Add a heading fixture with a leading `U+200B` and deliberately incompatible DOM context; require the sanitized exact-source candidate to resolve.
- Add the reported full table-cell fixture with a trailing `U+FFFC`; require the returned source range to span the embedded Markdown backticks and exclude adjacent cells.
- Keep a repeated-heading fixture unresolved when context cannot distinguish its occurrences.
- Keep a repeated-heading fixture with DOM sentinels unresolved when context cannot distinguish its occurrences.
- Keep a distant rendered-only candidate unresolved.
- Run the focused reading-selection test, the full test suite, TypeScript compilation, production build, and changed-line format check.
- Run the similar-risk audit cases and summarize confirmed remaining gaps separately from the implemented table fix.

## Success Criteria

- The reported selection creates a mark instead of showing the unresolved notice.
- Repeated text in different table rows remains disambiguated by surrounding rendered context.
- The reported repeated bold label and numbered headings resolve in the target document.
- Common rendered/source syntax differences resolve only when their candidate is unique and positionally near.
- A unique exact source occurrence resolves even when Obsidian reports incompatible DOM wrapper context.
- Known non-rendering DOM sentinels do not prevent a visually exact heading or table-cell selection from resolving.
- Repeated exact occurrences still require unique contextual disambiguation.
- Non-table reading selections retain their current results.
- No global threshold is lowered and no ambiguous candidate is accepted.
