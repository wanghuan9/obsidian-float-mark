import { RangeSet, type Range } from "@codemirror/state";
import { Decoration, type DecorationSet } from "@codemirror/view";
import { getMarkBackgroundClass, hasContinuousMarkPaint } from "./mark-appearance";
import { getCustomMarkBackgroundHex, type SideMark } from "./types";

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
		const hasContinuousPaint = hasContinuousMarkPaint(mark);
		const regularBackground = hasContinuousPaint ? "none" : mark.mark.backgroundColor;
		const customBackground = getCustomMarkBackgroundHex(mark.mark.backgroundColor);
		const attributes: Record<string, string> = {
			"data-side-mark-id": mark.id,
			title: mark.note.content || "FloatMark"
		};
		if (customBackground) {
			attributes.style = `--side-mark-background-color: ${customBackground}`;
		}
		regularRanges.push(Decoration.mark({
			class: [
				"side-mark",
				hasContinuousPaint ? "side-mark-editor-content" : "",
				`side-mark--${mark.mark.kind}`,
				`side-mark--${mark.mark.color}`,
				`side-mark--text-${mark.mark.textColor}`,
				getMarkBackgroundClass(regularBackground)
			].filter(Boolean).join(" "),
			attributes
		}).range(from, to));
		if (hasContinuousPaint) {
			outerRanges.push(Decoration.mark({
				class: buildOuterPaintClasses(mark),
				attributes: customBackground
					? { style: `--side-mark-background-color: ${customBackground}` }
					: undefined
			}).range(from, to));
		}
	}
	addPendingSelection(regularRanges, pendingSelection, docLength);
	return {
		decorations: RangeSet.of(regularRanges, true),
		outerDecorations: RangeSet.of(outerRanges, true)
	};
}

function buildOuterPaintClasses(mark: SideMark): string {
	const paintClass = mark.mark.kind === "comment"
		? `side-mark--${mark.mark.color}`
		: getMarkBackgroundClass(mark.mark.backgroundColor);
	return [
		"side-mark-editor-background",
		`side-mark--${mark.mark.kind}`,
		paintClass
	].join(" ");
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
