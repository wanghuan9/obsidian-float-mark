import { RangeSet, type Range } from "@codemirror/state";
import { Decoration, type DecorationSet } from "@codemirror/view";
import type { SideMark } from "./types";

export interface PendingEditorSelection {
	from: number;
	to: number;
}

export interface EditorDecorationLayers {
	decorations: DecorationSet;
	outerDecorations: DecorationSet;
}

export function buildEditorDecorationLayers(
	marks: SideMark[],
	docLength: number,
	pendingSelection: PendingEditorSelection | null
): EditorDecorationLayers {
	const regularRanges: Range<Decoration>[] = [];
	const outerRanges: Range<Decoration>[] = [];
	for (const mark of marks) {
		if (mark.status === "orphaned" || mark.status === "resolved") {
			continue;
		}
		const from = clampOffset(mark.anchor.startOffset, docLength);
		const to = Math.max(from, clampOffset(mark.anchor.endOffset, docLength));
		if (from === to) {
			continue;
		}
		const hasOuterBackground = mark.mark.kind === "highlight" && mark.mark.backgroundColor !== "none";
		const regularBackground = hasOuterBackground ? "none" : mark.mark.backgroundColor;
		regularRanges.push(Decoration.mark({
			class: [
				"side-mark",
				`side-mark--${mark.mark.kind}`,
				`side-mark--${mark.mark.color}`,
				`side-mark--text-${mark.mark.textColor}`,
				`side-mark--background-${regularBackground}`
			].join(" "),
			attributes: {
				"data-side-mark-id": mark.id,
				title: mark.note.content || "FloatMark"
			}
		}).range(from, to));
		if (hasOuterBackground) {
			outerRanges.push(Decoration.mark({
				class: [
					"side-mark-editor-background",
					"side-mark--highlight",
					`side-mark--background-${mark.mark.backgroundColor}`
				].join(" ")
			}).range(from, to));
		}
	}
	addPendingSelection(regularRanges, pendingSelection, docLength);
	return {
		decorations: RangeSet.of(regularRanges, true),
		outerDecorations: RangeSet.of(outerRanges, true)
	};
}

function addPendingSelection(
	ranges: Range<Decoration>[],
	pendingSelection: PendingEditorSelection | null,
	docLength: number
): void {
	if (!pendingSelection) {
		return;
	}
	const from = clampOffset(pendingSelection.from, docLength);
	const to = Math.max(from, clampOffset(pendingSelection.to, docLength));
	if (from === to) {
		return;
	}
	ranges.push(Decoration.mark({
		class: "side-mark-pending-comment-selection"
	}).range(from, to));
}

function clampOffset(offset: number, docLength: number): number {
	return Math.max(0, Math.min(offset, docLength));
}
