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

function readNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}
