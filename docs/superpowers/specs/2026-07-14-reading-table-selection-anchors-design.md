# Reading Table Selection Anchors Design

## Goal

Allow reading-mode selections inside rendered Markdown table cells to map back to the exact Markdown source range without weakening duplicate-text protection or changing stored anchor semantics.

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

## Similar-risk Audit

The verification pass will exercise other Markdown constructs where source text differs from rendered DOM text:

- Task-list markers.
- Markdown links and autolinks.
- Escaped punctuation.
- HTML entities and inline HTML.
- Fenced-code language markers.
- Callout metadata.

The table fix will not silently broaden into a general Markdown parser. Confirmed failures outside table structure will be reported with reproduction evidence and a scoped follow-up recommendation unless the same small normalization rule fixes them without changing unrelated behavior.

## Verification

- Add a JSDOM regression test using the reported table row and an actual selection spanning multiple inline-code nodes inside one cell.
- Assert the returned source range includes the corresponding Markdown backticks and excludes adjacent table cells.
- Add a repeated-value table case proving row context still selects the intended occurrence.
- Add table fixtures for optional outer pipes, alignment markers, escaped pipes, and inline-code pipes.
- Run the focused reading-selection test, the full test suite, TypeScript compilation, production build, and changed-line format check.
- Run the similar-risk audit cases and summarize confirmed remaining gaps separately from the implemented table fix.

## Success Criteria

- The reported selection creates a mark instead of showing the unresolved notice.
- Repeated text in different table rows remains disambiguated by surrounding rendered context.
- Non-table reading selections retain their current results.
- No global threshold is lowered and no ambiguous candidate is accepted.
