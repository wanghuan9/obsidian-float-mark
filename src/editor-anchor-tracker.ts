import type { ChangeDesc } from "@codemirror/state";
import { createTextAnchor, relocateAnchor } from "./anchors";
import type { SideMark } from "./types";

export function reconcileEditorMarks(marks: SideMark[], source: string, changes: ChangeDesc): SideMark[] {
	return marks.map((mark) => {
		if (mark.status === "resolved") {
			return mark;
		}

		const from = changes.mapPos(mark.anchor.startOffset, 1);
		const to = Math.max(from, changes.mapPos(mark.anchor.endOffset, -1));
		if (mark.status === "active" && source.slice(from, to) === mark.anchor.selectedText) {
			return { ...mark, anchor: createTextAnchor(source, from, to) };
		}

		const anchor = relocateAnchor(source, { ...mark.anchor, startOffset: from, endOffset: to }, {
			trustStoredPosition: false,
			allowUniqueTextFallback: false
		});
		return anchor
			? { ...mark, anchor, status: "active" as const }
			: { ...mark, status: "orphaned" as const };
	});
}
