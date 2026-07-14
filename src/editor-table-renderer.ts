import type { Text } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { renderActiveTableCellMarks, type SourceRange } from "./editor-table-cell-renderer";
import { buildSourceLineStarts, getReadingMarksForSection, renderReadingMarks } from "./reading-view-renderer";
import type { SideMark } from "./types";

export { findCellSourceRangeForTest } from "./editor-table-cell-renderer";

const TABLE_WIDGET_SELECTOR = ".cm-embed-block.cm-table-widget.markdown-rendered";
const TABLE_ELEMENT_SELECTOR = "table.table-editor";
const ACTIVE_CELL_EDITOR_SELECTOR = ".table-cell-wrapper .cm-editor";

type MarkClickHandler = (markId: string, rect: DOMRect) => void;

export function renderEditorTableMarks(
	view: EditorView,
	source: string,
	lineStarts: number[],
	marks: SideMark[],
	onClick: MarkClickHandler
): void {
	const widgets = Array.from(view.dom.querySelectorAll<HTMLElement>(TABLE_WIDGET_SELECTOR));
	for (const widget of widgets) {
		const table = widget.querySelector<HTMLElement>(TABLE_ELEMENT_SELECTOR);
		if (!table) {
			continue;
		}
		const range = getWidgetSourceRange(view, widget);
		if (!range) {
			continue;
		}
		const startLine = view.state.doc.lineAt(range.from).number - 1;
		const endLine = view.state.doc.lineAt(range.to - 1).number - 1;
		const tableMarks = getReadingMarksForSection(source, marks, startLine, endLine, lineStarts);
		const activeCellRanges = renderActiveTableCellMarks(table, source, range, tableMarks);
		const staticMarks = tableMarks.filter((mark) => !activeCellRanges.some((activeRange) =>
			mark.anchor.startOffset < activeRange.to && mark.anchor.endOffset > activeRange.from
		));
		renderReadingMarks(table, source, staticMarks, onClick, {
			excludedContainerSelector: ACTIVE_CELL_EDITOR_SELECTOR
		});
	}
}

function getWidgetSourceRange(view: EditorView, widget: HTMLElement): SourceRange | null {
	try {
		const from = view.posAtDOM(widget, 0);
		const to = view.posAtDOM(widget, widget.childNodes.length);
		return to > from ? { from, to } : null;
	} catch {
		return null;
	}
}

export class EditorTableMarkRenderer {
	private readonly observer: MutationObserver;
	private animationFrame: number | null = null;
	private cachedDocument: Text | null = null;
	private source = "";
	private lineStarts: number[] = [];
	private destroyed = false;

	constructor(
		private readonly view: EditorView,
		private readonly getMarks: () => SideMark[],
		private readonly onClick: MarkClickHandler
	) {
		const Observer = view.dom.ownerDocument.defaultView?.MutationObserver || MutationObserver;
		this.observer = new Observer(() => this.schedule());
		this.observe();
		this.schedule();
	}

	schedule(): void {
		if (this.destroyed || this.animationFrame !== null) {
			return;
		}
		const ownerWindow = this.view.dom.ownerDocument.defaultView;
		if (!ownerWindow) {
			return;
		}
		this.animationFrame = ownerWindow.requestAnimationFrame(() => {
			this.animationFrame = null;
			this.render();
		});
	}

	destroy(): void {
		this.destroyed = true;
		this.cancelScheduledRender();
		this.observer.disconnect();
		this.refreshSourceSnapshot();
		renderEditorTableMarks(this.view, this.source, this.lineStarts, [], this.onClick);
	}

	private render(): void {
		this.observer.disconnect();
		try {
			this.refreshSourceSnapshot();
			const marks = this.getMarks();
			renderEditorTableMarks(this.view, this.source, this.lineStarts, marks, this.onClick);
		} finally {
			if (!this.destroyed) {
				this.observe();
			}
		}
	}

	private refreshSourceSnapshot(): void {
		const document = this.view.state.doc;
		if (this.cachedDocument === document) {
			return;
		}
		this.cachedDocument = document;
		this.source = document.toString();
		this.lineStarts = buildSourceLineStarts(this.source);
	}

	private observe(): void {
		this.observer.observe(this.view.dom, { childList: true, subtree: true });
	}

	private cancelScheduledRender(): void {
		if (this.animationFrame === null) {
			return;
		}
		this.view.dom.ownerDocument.defaultView?.cancelAnimationFrame(this.animationFrame);
		this.animationFrame = null;
	}
}
