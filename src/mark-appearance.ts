import type { MarkBackgroundColor, SideMark } from "./types";

export interface ResolvedMarkBackground {
	color: MarkBackgroundColor;
	inherited: boolean;
}

export function hasContinuousMarkPaint(mark: SideMark): boolean {
	return mark.mark.kind === "comment"
		|| (mark.mark.kind === "highlight" && mark.mark.backgroundColor !== "none");
}

export function resolveMarkBackground(mark: SideMark, marks: SideMark[]): ResolvedMarkBackground {
	if (mark.mark.backgroundColor !== "none") {
		return { color: mark.mark.backgroundColor, inherited: false };
	}
	if (mark.mark.kind !== "highlight" || mark.status !== "active") {
		return { color: "none", inherited: false };
	}

	let inheritedMark: SideMark | null = null;
	let inheritedIndex = -1;
	for (let index = 0; index < marks.length; index += 1) {
		const candidate = marks[index];
		if (!candidate) {
			continue;
		}
		if (!isInheritedBackgroundCandidate(mark, candidate)) {
			continue;
		}
		if (inheritedMark && compareMarkRangeSpecificity(candidate, inheritedMark, index, inheritedIndex) >= 0) {
			continue;
		}
		inheritedMark = candidate;
		inheritedIndex = index;
	}

	return inheritedMark
		? { color: inheritedMark.mark.backgroundColor, inherited: true }
		: { color: "none", inherited: false };
}

export function compareMarkRangeSpecificity(
	left: SideMark,
	right: SideMark,
	leftIndex: number,
	rightIndex: number
): number {
	const leftLength = left.anchor.endOffset - left.anchor.startOffset;
	const rightLength = right.anchor.endOffset - right.anchor.startOffset;
	return leftLength - rightLength
		|| left.anchor.startOffset - right.anchor.startOffset
		|| rightIndex - leftIndex
		|| left.id.localeCompare(right.id);
}

function isInheritedBackgroundCandidate(mark: SideMark, candidate: SideMark): boolean {
	return candidate.id !== mark.id
		&& candidate.filePath === mark.filePath
		&& candidate.mark.kind === "highlight"
		&& candidate.status === "active"
		&& candidate.mark.backgroundColor !== "none"
		&& candidate.anchor.startOffset <= mark.anchor.startOffset
		&& candidate.anchor.endOffset >= mark.anchor.endOffset;
}
