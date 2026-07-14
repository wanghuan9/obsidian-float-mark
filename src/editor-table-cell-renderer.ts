import { StateEffect, StateField, type Text } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import { createTextAnchor } from "./anchors";
import { buildEditorDecorationLayers, type EditorDecorationLayers } from "./editor-decorations";
import type { SideMark } from "./types";

const ACTIVE_CELL_EDITOR_SELECTOR = ".table-cell-wrapper .cm-editor";
const emptyDecorationLayers: EditorDecorationLayers = {
	decorations: Decoration.none,
	outerDecorations: Decoration.none
};
const setActiveCellLayers = StateEffect.define<EditorDecorationLayers>();
const activeCellLayersField = StateField.define<EditorDecorationLayers>({
	create: () => emptyDecorationLayers,
	update: (value, transaction) => {
		let next = transaction.docChanged
			? {
				decorations: value.decorations.map(transaction.changes),
				outerDecorations: value.outerDecorations.map(transaction.changes)
			}
			: value;
		for (const effect of transaction.effects) {
			if (effect.is(setActiveCellLayers)) {
				next = effect.value;
			}
		}
		return next;
	},
	provide: (field) => [
		EditorView.decorations.from(field, (layers) => layers.decorations),
		EditorView.outerDecorations.of((view) => view.state.field(field).outerDecorations)
	]
});
const configuredCellViews = new WeakSet<EditorView>();
const cellRenderStates = new WeakMap<EditorView, { document: Text; markSignature: string }>();

export interface SourceRange {
	from: number;
	to: number;
}

export function renderActiveTableCellMarks(
	table: HTMLElement,
	source: string,
	widgetRange: SourceRange,
	marks: SideMark[]
): SourceRange[] {
	const sourceRanges: SourceRange[] = [];
	const editorElements = Array.from(table.querySelectorAll<HTMLElement>(ACTIVE_CELL_EDITOR_SELECTOR));
	for (const editorElement of editorElements) {
		const cell = editorElement.closest<HTMLTableCellElement>("td, th");
		const row = cell?.parentElement as HTMLTableRowElement | null;
		const cellView = EditorView.findFromDOM(editorElement);
		if (!cell || !row || row.tagName !== "TR" || !cellView) {
			continue;
		}
		const cellSource = cellView.state.doc.toString();
		const sourceRange = findCellSourceRange(source, widgetRange, row.rowIndex, cell.cellIndex, cellSource);
		if (!sourceRange) {
			updateCellDecorations(cellView, []);
			continue;
		}
		sourceRanges.push(sourceRange);
		const localMarks = localizeMarks(source, cellSource, sourceRange, marks);
		updateCellDecorations(cellView, localMarks);
	}
	return sourceRanges;
}

function findCellSourceRange(
	source: string,
	widgetRange: SourceRange,
	rowIndex: number,
	cellIndex: number,
	cellSource: string
): SourceRange | null {
	const sourceLines = getSourceLines(source, widgetRange);
	const sourceLineIndex = rowIndex === 0 ? 0 : rowIndex + 1;
	const sourceLine = sourceLines[sourceLineIndex];
	if (!sourceLine) {
		return null;
	}
	const cellRanges = findTableCellRanges(sourceLine.text, sourceLine.from);
	const sourceRange = cellRanges[cellIndex];
	if (!sourceRange || source.slice(sourceRange.from, sourceRange.to) !== cellSource) {
		return null;
	}
	return sourceRange;
}

function getSourceLines(source: string, range: SourceRange): Array<SourceRange & { text: string }> {
	const lines: Array<SourceRange & { text: string }> = [];
	let lineStart = range.from;
	for (let index = range.from; index <= range.to; index += 1) {
		if (index < range.to && source[index] !== "\n") {
			continue;
		}
		lines.push({
			from: lineStart,
			to: index,
			text: source.slice(lineStart, index)
		});
		lineStart = index + 1;
	}
	return lines;
}

function findTableCellRanges(line: string, lineOffset: number): SourceRange[] {
	const delimiters: number[] = [];
	for (let index = 0; index < line.length; index += 1) {
		if (line[index] === "|" && !isEscaped(line, index)) {
			delimiters.push(index);
		}
	}
	const firstContentIndex = findFirstNonWhitespaceIndex(line);
	const lastContentIndex = findLastNonWhitespaceIndex(line);
	const hasLeadingDelimiter = delimiters[0] === firstContentIndex;
	const lastDelimiter = delimiters[delimiters.length - 1];
	const hasTrailingDelimiter = lastDelimiter !== undefined && lastDelimiter === lastContentIndex;
	const internalStart = hasLeadingDelimiter ? 1 : 0;
	const internalEnd = hasTrailingDelimiter ? delimiters.length - 1 : delimiters.length;
	const ranges: SourceRange[] = [];
	let cellStart = hasLeadingDelimiter ? (delimiters[0] || 0) + 1 : 0;
	for (let index = internalStart; index < internalEnd; index += 1) {
		const delimiter = delimiters[index];
		if (delimiter === undefined) {
			continue;
		}
		ranges.push(trimCellRange(line, lineOffset, cellStart, delimiter));
		cellStart = delimiter + 1;
	}
	const cellEnd = hasTrailingDelimiter ? lastDelimiter || 0 : line.length;
	ranges.push(trimCellRange(line, lineOffset, cellStart, cellEnd));
	return ranges;
}

function trimCellRange(line: string, lineOffset: number, start: number, end: number): SourceRange {
	let trimmedStart = start;
	let trimmedEnd = Math.max(start, end);
	while (trimmedStart < trimmedEnd && /[\t ]/.test(line[trimmedStart] || "")) {
		trimmedStart += 1;
	}
	while (trimmedEnd > trimmedStart && /[\t ]/.test(line[trimmedEnd - 1] || "")) {
		trimmedEnd -= 1;
	}
	return {
		from: lineOffset + trimmedStart,
		to: lineOffset + trimmedEnd
	};
}

function findFirstNonWhitespaceIndex(line: string): number {
	for (let index = 0; index < line.length; index += 1) {
		if (!/[\t ]/.test(line[index] || "")) {
			return index;
		}
	}
	return -1;
}

function findLastNonWhitespaceIndex(line: string): number {
	for (let index = line.length - 1; index >= 0; index -= 1) {
		if (!/[\t ]/.test(line[index] || "")) {
			return index;
		}
	}
	return -1;
}

function isEscaped(line: string, index: number): boolean {
	let backslashCount = 0;
	for (let cursor = index - 1; cursor >= 0 && line[cursor] === "\\"; cursor -= 1) {
		backslashCount += 1;
	}
	return backslashCount % 2 === 1;
}

function localizeMarks(source: string, cellSource: string, sourceRange: SourceRange, marks: SideMark[]): SideMark[] {
	return marks.flatMap((mark) => {
		const from = mark.anchor.startOffset;
		const to = mark.anchor.endOffset;
		if (from < sourceRange.from || to > sourceRange.to || source.slice(from, to) !== mark.anchor.selectedText) {
			return [];
		}
		const localFrom = from - sourceRange.from;
		const localTo = to - sourceRange.from;
		return [{
			...mark,
			anchor: createTextAnchor(cellSource, localFrom, localTo)
		}];
	});
}

function updateCellDecorations(view: EditorView, marks: SideMark[]): void {
	ensureCellDecorationField(view);
	const markSignature = buildMarkSignature(marks);
	const previousState = cellRenderStates.get(view);
	if (previousState?.document === view.state.doc && previousState.markSignature === markSignature) {
		return;
	}
	const layers = buildEditorDecorationLayers(marks, view.state.doc.length, null);
	view.dispatch({ effects: setActiveCellLayers.of(layers) });
	cellRenderStates.set(view, { document: view.state.doc, markSignature });
}

function ensureCellDecorationField(view: EditorView): void {
	if (configuredCellViews.has(view)) {
		return;
	}
	view.dispatch({ effects: StateEffect.appendConfig.of(activeCellLayersField) });
	configuredCellViews.add(view);
}

function buildMarkSignature(marks: SideMark[]): string {
	return JSON.stringify(marks.map((mark) => [
		mark.id,
		mark.anchor.startOffset,
		mark.anchor.endOffset,
		mark.status,
		mark.mark.kind,
		mark.mark.color,
		mark.mark.textColor,
		mark.mark.backgroundColor,
		mark.note.content
	]));
}

export function findCellSourceRangeForTest(
	source: string,
	widgetRange: SourceRange,
	rowIndex: number,
	cellIndex: number,
	cellSource: string
): SourceRange | null {
	return findCellSourceRange(source, widgetRange, rowIndex, cellIndex, cellSource);
}
