export function findSourceRangeForReadingSelection(source: string, selectedText: string): { from: number; to: number } | null {
	const directIndex = source.indexOf(selectedText);
	if (directIndex >= 0) {
		return {
			from: directIndex,
			to: directIndex + selectedText.length
		};
	}
	const sourceIndex = buildRenderedSourceIndex(source);
	const renderedSelection = normalizeReadingSelection(selectedText);
	const renderedIndex = sourceIndex.text.indexOf(renderedSelection);
	if (renderedIndex < 0) {
		return null;
	}
	const from = expandStartToOpeningMarker(source, sourceIndex.offsets[renderedIndex]);
	const to = sourceIndex.offsets[renderedIndex + renderedSelection.length - 1];
	if (from === undefined || to === undefined) {
		return null;
	}
	return {
		from,
		to: to + 1
	};
}

export function getReadingSelectionRect(range: Range): DOMRect | null {
	const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 || rect.height > 0);
	if (rects.length === 0) {
		const rect = range.getBoundingClientRect();
		return rect.width === 0 && rect.height === 0 ? null : rect;
	}
	const left = Math.min(...rects.map((rect) => rect.left));
	const top = Math.min(...rects.map((rect) => rect.top));
	const right = Math.max(...rects.map((rect) => rect.right));
	const bottom = Math.max(...rects.map((rect) => rect.bottom));
	return new DOMRect(left, top, right - left, bottom - top);
}

function buildRenderedSourceIndex(source: string): { text: string; offsets: number[] } {
	let rendered = "";
	const offsets: number[] = [];
	let index = 0;
	const linePrefixPattern = /^(?:[\t ]{0,3}#{1,6}[\t ]+|[\t ]*(?:[-+*]|\d+[.)])[\t ]+|[\t ]{0,3}>[\t ]?)/;
	while (index < source.length) {
		const lineStart = index === 0 || source[index - 1] === "\n";
		if (lineStart) {
			const prefix = source.slice(index).match(linePrefixPattern);
			if (prefix?.[0]) {
				index += prefix[0].length;
				continue;
			}
		}
		const char = source[index] || "";
		if (isMarkdownMarkerAt(source, index)) {
			index += markerLengthAt(source, index);
			continue;
		}
		if (isIgnoredSpacing(char)) {
			index += 1;
			continue;
		}
		rendered += char;
		offsets.push(index);
		index += 1;
	}
	return { text: rendered, offsets };
}

function expandStartToOpeningMarker(source: string, offset: number | undefined): number | undefined {
	if (offset === undefined) {
		return undefined;
	}
	const previousPair = source.slice(offset - 2, offset);
	if (previousPair === "**" || previousPair === "__" || previousPair === "~~") {
		return offset - 2;
	}
	const previous = source[offset - 1];
	if (previous === "*" || previous === "_" || previous === "`") {
		return offset - 1;
	}
	return offset;
}

function normalizeReadingSelection(text: string): string {
	return text
		.replace(/[\u200B-\u200D\uFEFF]/g, "")
		.split(/\n+/)
		.map((line) => line.replace(/^\s*(?:[-+*]|\d+[.)])\s+/, "").replace(/^\s*\[(?: |x|X)\]\s+/, ""))
		.join("")
		.replace(/[\s\u200B-\u200D\uFEFF]+/g, "");
}

function isMarkdownMarkerAt(source: string, index: number): boolean {
	return markerLengthAt(source, index) > 0;
}

function markerLengthAt(source: string, index: number): number {
	const marker = source.slice(index, index + 2);
	if (marker === "**" || marker === "__" || marker === "~~") {
		return 2;
	}
	const char = source[index];
	if (char === "_" && isAsciiAlphaNumeric(source[index - 1]) && isAsciiAlphaNumeric(source[index + 1])) {
		return 0;
	}
	if (char === "*" || char === "_" || char === "`") {
		return 1;
	}
	return 0;
}

function isAsciiAlphaNumeric(char: string | undefined): boolean {
	return Boolean(char && /[A-Za-z0-9]/.test(char));
}

function isIgnoredSpacing(char: string): boolean {
	return /\s/.test(char) || /[\u200B-\u200D\uFEFF]/.test(char);
}
