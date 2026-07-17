import { StateEffect, StateField, type Text } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import { createTextAnchor } from "./anchors";
import { buildEditorDecorationLayers, type EditorDecorationLayers } from "./editor-decorations";
import { findMarkdownTableCellRange, type SourceRange } from "./markdown-table-map";
import type { SideMark } from "./types";

export type { SourceRange } from "./markdown-table-map";

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
	const sourceRange = findMarkdownTableCellRange(source, widgetRange, rowIndex, cellIndex);
	if (!sourceRange || source.slice(sourceRange.from, sourceRange.to) !== cellSource) {
		return null;
	}
	return sourceRange;
}

function localizeMarks(source: string, cellSource: string, sourceRange: SourceRange, marks: SideMark[]): SideMark[] {
	return marks.flatMap((mark) => {
		if (source.slice(mark.anchor.startOffset, mark.anchor.endOffset) !== mark.anchor.selectedText) {
			return [];
		}
		const from = Math.max(mark.anchor.startOffset, sourceRange.from);
		const to = Math.min(mark.anchor.endOffset, sourceRange.to);
		if (from >= to) {
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
