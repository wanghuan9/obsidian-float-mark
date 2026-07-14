interface PreviewPosition {
	line?: unknown;
	offset?: unknown;
}

export interface PreviewSectionSource {
	lineStart?: unknown;
	lineEnd?: unknown;
	start?: PreviewPosition | null;
	end?: PreviewPosition | null;
}

export interface PreviewSectionBounds {
	lineStart: number;
	lineEnd: number;
	sourceStartOffset?: number;
	sourceEndOffset?: number;
}

export function resolvePreviewSectionBounds(section: PreviewSectionSource): PreviewSectionBounds | null {
	const lineStart = readNumber(section.lineStart) ?? readNumber(section.start?.line);
	const lineEnd = readNumber(section.lineEnd) ?? readNumber(section.end?.line);
	if (lineStart === null || lineEnd === null) {
		return null;
	}
	const sourceStartOffset = readNumber(section.start?.offset);
	const sourceEndOffset = readNumber(section.end?.offset);
	return sourceStartOffset === null || sourceEndOffset === null
		? { lineStart, lineEnd }
		: { lineStart, lineEnd, sourceStartOffset, sourceEndOffset };
}

export function selectPreviewSections<T extends PreviewSectionBounds & { el: HTMLElement }>(
	sections: readonly T[],
	range: Range
): T[] {
	let first = sections.findIndex((section) => section.el.contains(range.startContainer));
	let last = sections.findIndex((section) => section.el.contains(range.endContainer));
	if (first < 0 || last < first) {
		return [];
	}
	const firstSection = sections[first];
	if (
		firstSection
		&& range.startContainer === firstSection.el
		&& range.startOffset === firstSection.el.childNodes.length
	) {
		first += 1;
	}
	const lastSection = sections[last];
	if (lastSection && range.endContainer === lastSection.el && range.endOffset === 0) {
		last -= 1;
	}
	if (last < first) {
		return [];
	}
	const selected = sections.slice(first, last + 1);
	return selected.every((section, index) => isPreviewSectionMonotonic(section, selected[index - 1]))
		? selected
		: [];
}

function isPreviewSectionMonotonic(
	section: PreviewSectionBounds,
	previous: PreviewSectionBounds | undefined
): boolean {
	if (section.lineStart > section.lineEnd) {
		return false;
	}
	if (!previous) {
		return true;
	}
	const startOrdered = section.sourceStartOffset !== undefined && previous.sourceStartOffset !== undefined
		? section.sourceStartOffset >= previous.sourceStartOffset
		: section.lineStart >= previous.lineStart;
	const endOrdered = section.sourceEndOffset !== undefined && previous.sourceEndOffset !== undefined
		? section.sourceEndOffset >= previous.sourceEndOffset
		: section.lineEnd >= previous.lineEnd;
	return startOrdered && endOrdered;
}

function readNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}
