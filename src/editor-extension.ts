import { editorInfoField } from "obsidian";
import { RangeSet, type Extension, type Range } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import type SideMarkPlugin from "./main";

export function createSideMarkEditorExtension(plugin: SideMarkPlugin): Extension {
	return ViewPlugin.fromClass(
		class SideMarkEditorPlugin {
			decorations: DecorationSet;
			private readonly mouseupHandler: () => void;
			private readonly keyupHandler: () => void;
			private readonly clickHandler: (event: MouseEvent) => void;
			private readonly mousemoveHandler: (event: MouseEvent) => void;
			private readonly mouseleaveHandler: () => void;
			private readonly scrollHandler: () => void;
			private selectionTimer: number | null = null;

			constructor(private readonly view: EditorView) {
				this.decorations = this.buildDecorations();
				this.mouseupHandler = () => this.scheduleSelectionCheck();
				this.keyupHandler = () => this.scheduleSelectionCheck();
				this.clickHandler = (event) => this.handleMarkClick(event);
				this.mousemoveHandler = (event) => this.handleMouseMove(event);
				this.mouseleaveHandler = () => plugin.scheduleHideBlockToolbar();
				this.scrollHandler = () => plugin.hideBlockToolbar();
				view.dom.addEventListener("mouseup", this.mouseupHandler);
				view.dom.addEventListener("keyup", this.keyupHandler);
				view.dom.addEventListener("click", this.clickHandler);
				view.dom.addEventListener("mousemove", this.mousemoveHandler);
				view.dom.addEventListener("mouseleave", this.mouseleaveHandler);
				view.dom.addEventListener("scroll", this.scrollHandler, true);
			}

			update(update: ViewUpdate): void {
				if (update.docChanged || update.viewportChanged || update.transactions.length > 0) {
					this.decorations = this.buildDecorations();
					if (update.viewportChanged) {
						plugin.hideBlockToolbar();
					}
					if (update.docChanged) {
						plugin.hideSelectionToolbar();
					}
				}
			}

			destroy(): void {
				this.view.dom.removeEventListener("mouseup", this.mouseupHandler);
				this.view.dom.removeEventListener("keyup", this.keyupHandler);
				this.view.dom.removeEventListener("click", this.clickHandler);
				this.view.dom.removeEventListener("mousemove", this.mousemoveHandler);
				this.view.dom.removeEventListener("mouseleave", this.mouseleaveHandler);
				this.view.dom.removeEventListener("scroll", this.scrollHandler, true);
				if (this.selectionTimer !== null) {
					window.clearTimeout(this.selectionTimer);
					this.selectionTimer = null;
				}
			}

			private scheduleSelectionCheck(): void {
				if (this.selectionTimer !== null) {
					window.clearTimeout(this.selectionTimer);
				}
				this.selectionTimer = window.setTimeout(() => {
					this.selectionTimer = null;
					const selection = this.view.state.selection.main;
					if (selection.empty) {
						plugin.hideSelectionToolbar();
						return;
					}
					const rect = this.getSelectionRect(selection.from, selection.to);
					if (!rect) {
						plugin.hideSelectionToolbar();
						return;
					}
					plugin.showSelectionToolbar(this.view, rect, this.view.dom.getBoundingClientRect());
				}, 120);
			}

			private getSelectionRect(from: number, to: number): DOMRect | null {
				const domRect = getDomSelectionRect(this.view.dom);
				if (domRect) {
					return domRect;
				}
				const start = this.view.coordsAtPos(from);
				const end = this.view.coordsAtPos(to);
				if (!start && !end) {
					return null;
				}
				if (!start || !end) {
					const rect = start || end;
					return rect ? new DOMRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top) : null;
				}
				const left = Math.min(start.left, end.left);
				const right = Math.max(start.right, end.right);
				const top = Math.min(start.top, end.top);
				const bottom = Math.max(start.bottom, end.bottom);
				return new DOMRect(left, top, Math.max(1, right - left), Math.max(1, bottom - top));
			}

			private buildDecorations(): DecorationSet {
				const filePath = this.getFilePath();
				if (!filePath || plugin.currentDocument?.filePath !== filePath) {
					return Decoration.none;
				}
				const ranges: Range<Decoration>[] = [];
				const docLength = this.view.state.doc.length;
				for (const mark of plugin.currentDocument.marks) {
					if (mark.status === "orphaned" || mark.status === "resolved") {
						continue;
					}
					const from = Math.max(0, Math.min(mark.anchor.startOffset, docLength));
					const to = Math.max(from, Math.min(mark.anchor.endOffset, docLength));
					if (from === to) {
						continue;
					}
					ranges.push(Decoration.mark({
						class: `side-mark side-mark--${mark.mark.kind} side-mark--${mark.mark.color}`,
						attributes: {
							"data-side-mark-id": mark.id,
							title: mark.note.content || "FloatMark"
						}
					}).range(from, to));
				}
				return RangeSet.of(ranges, true);
			}

			private getFilePath(): string | null {
				const info = this.view.state.field(editorInfoField, false);
				return info?.file?.path || plugin.getActiveMarkdownFile()?.path || null;
			}

			private handleMarkClick(event: MouseEvent): void {
				const target = event.target instanceof HTMLElement ? event.target : null;
				const markEl = target?.closest<HTMLElement>("[data-side-mark-id]");
				const markId = markEl?.dataset.sideMarkId;
				if (!markId) {
					return;
				}
				event.preventDefault();
				void plugin.focusMark(markId);
			}

			private handleMouseMove(event: MouseEvent): void {
				if (!(event.target instanceof HTMLElement) || !this.view.dom.contains(event.target)) {
					return;
				}
				if (!this.view.state.selection.main.empty) {
					plugin.scheduleHideBlockToolbar();
					return;
				}
				const pos = this.view.posAtCoords({ x: event.clientX, y: event.clientY });
				if (pos === null) {
					plugin.scheduleHideBlockToolbar();
					return;
				}
				const line = this.view.state.doc.lineAt(pos);
				if (!line.text.trim()) {
					plugin.scheduleHideBlockToolbar();
					return;
				}
				const rect = this.view.coordsAtPos(line.from);
				if (!rect) {
					plugin.scheduleHideBlockToolbar();
					return;
				}
				const lineRect = this.getLineRect(event.target);
				plugin.showBlockToolbar(this.view, {
					from: line.from,
					to: line.to,
					label: getLineLabel(line.text),
					rect: lineRect || new DOMRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top)
				});
			}

			private getLineRect(target: HTMLElement): DOMRect | null {
				const lineEl = target.closest<HTMLElement>(".cm-line");
				if (!lineEl || !this.view.dom.contains(lineEl)) {
					return null;
				}
				const lineRect = lineEl.getBoundingClientRect();
				if (lineRect.height <= 0) {
					return null;
				}
				return lineRect;
			}
		},
		{
			decorations: (value) => value.decorations
		}
	);
}

function getLineLabel(lineText: string): string {
	const heading = lineText.match(/^(#{1,6})\s+/);
	if (heading) {
		return `H${heading[1]?.length || 1}`;
	}
	if (/^\s*(?:[-+*]|\d+\.)\s+/.test(lineText)) {
		return "List";
	}
	if (/^\s*>/.test(lineText)) {
		return "Quote";
	}
	return "T";
}

function getDomSelectionRect(editorDom: HTMLElement): DOMRect | null {
	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
		return null;
	}
	const range = selection.getRangeAt(0);
	const common = range.commonAncestorContainer;
	const element = common instanceof HTMLElement ? common : common.parentElement;
	if (!element || !editorDom.contains(element)) {
		return null;
	}
	const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
	if (rects.length === 0) {
		const rect = range.getBoundingClientRect();
		return rect.width > 0 && rect.height > 0 ? rect : null;
	}
	const first = rects[0];
	if (!first) {
		return null;
	}
	return new DOMRect(first.left, first.top, first.width, first.height);
}
