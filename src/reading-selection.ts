import { getActiveDocument } from "./dom-utils";

const READING_CONTEXT_LENGTH = 40;
const MIN_CONTEXT_SCORE = 1.4;

export interface ReadingSelectionScope {
	sourceStartOffset: number;
	sourceEndOffset: number;
	renderedOffset: number;
	prefix: string;
	suffix: string;
}

export interface ReadingSelectionContext {
	renderedOffset: number;
	prefix: string;
	suffix: string;
}

interface RenderedSourceIndex {
	text: string;
	offsets: number[];
}

interface SourceCandidate {
	from: number;
	to: number;
	renderedDistance: number;
	contextScore: number;
}

export function findSourceRangeForReadingSelection(
	source: string,
	selectedText: string,
	scope: ReadingSelectionScope
): { from: number; to: number } | null {
	const sectionSource = source.slice(scope.sourceStartOffset, scope.sourceEndOffset);
	const sourceIndex = buildRenderedSourceIndex(sectionSource, scope.sourceStartOffset);
	const candidates = findSourceCandidates(source, sectionSource, sourceIndex, selectedText, scope);
	const candidate = chooseUniqueCandidate(candidates);
	return candidate ? { from: candidate.from, to: candidate.to } : null;
}

export function getReadingSelectionContext(containers: HTMLElement[], range: Range): ReadingSelectionContext {
	const first = containers[0];
	const last = containers[containers.length - 1];
	const document = range.startContainer.ownerDocument || getActiveDocument();
	const prefixRange = document.createRange();
	prefixRange.selectNodeContents(first);
	prefixRange.setEnd(range.startContainer, range.startOffset);
	const suffixRange = document.createRange();
	suffixRange.selectNodeContents(last);
	suffixRange.setStart(range.endContainer, range.endOffset);
	const beforeText = prefixRange.toString();
	const afterText = suffixRange.toString();
	return {
		renderedOffset: normalizeReadingSelection(beforeText).length,
		prefix: normalizeReadingSelection(beforeText).slice(-READING_CONTEXT_LENGTH),
		suffix: normalizeReadingSelection(afterText).slice(0, READING_CONTEXT_LENGTH)
	};
}

function findSourceCandidates(
	source: string,
	sectionSource: string,
	sourceIndex: RenderedSourceIndex,
	selectedText: string,
	scope: ReadingSelectionScope
): SourceCandidate[] {
	const renderedSelection = normalizeReadingSelection(selectedText);
	if (!renderedSelection) {
		return [];
	}
	const directRanges = findDirectSourceRanges(sectionSource, selectedText, scope.sourceStartOffset);
	const ranges = directRanges.length > 0
		? directRanges
		: findRenderedSourceRanges(source, sourceIndex, renderedSelection);
	return ranges.map((range) => {
		const renderedOffset = renderedOffsetForSourceOffset(sourceIndex.offsets, range.from);
		return {
			...range,
			renderedDistance: Math.abs(renderedOffset - scope.renderedOffset),
			contextScore: getContextScore(sourceIndex.text, renderedSelection, renderedOffset, scope)
		};
	});
}

function findDirectSourceRanges(
	sectionSource: string,
	selectedText: string,
	sourceStartOffset: number
): Array<{ from: number; to: number }> {
	return findTextStarts(sectionSource, selectedText).map((index) => ({
		from: sourceStartOffset + index,
		to: sourceStartOffset + index + selectedText.length
	}));
}

function findRenderedSourceRanges(
	source: string,
	sourceIndex: RenderedSourceIndex,
	renderedSelection: string
): Array<{ from: number; to: number }> {
	return findTextStarts(sourceIndex.text, renderedSelection).flatMap((renderedOffset) => {
		const from = expandStartToOpeningMarker(source, sourceIndex.offsets[renderedOffset]);
		const lastOffset = sourceIndex.offsets[renderedOffset + renderedSelection.length - 1];
		return from === undefined || lastOffset === undefined ? [] : [{ from, to: lastOffset + 1 }];
	});
}

function chooseUniqueCandidate(candidates: SourceCandidate[]): SourceCandidate | null {
	const accepted = candidates.filter((candidate) => candidate.contextScore >= MIN_CONTEXT_SCORE);
	if (accepted.length === 1) {
		return accepted[0] || null;
	}
	if (accepted.length === 0) {
		return null;
	}
	accepted.sort((left, right) => {
		const scoreDifference = right.contextScore - left.contextScore;
		return scoreDifference || left.renderedDistance - right.renderedDistance;
	});
	const first = accepted[0];
	const second = accepted[1];
	return first && second && first.contextScore > second.contextScore ? first : null;
}

function getContextScore(
	renderedSource: string,
	renderedSelection: string,
	renderedOffset: number,
	scope: ReadingSelectionScope
): number {
	const prefix = normalizeReadingSelection(scope.prefix);
	const suffix = normalizeReadingSelection(scope.suffix);
	const sourcePrefix = renderedSource.slice(Math.max(0, renderedOffset - prefix.length), renderedOffset);
	const suffixStart = renderedOffset + renderedSelection.length;
	const sourceSuffix = renderedSource.slice(suffixStart, suffixStart + suffix.length);
	return 1 + getCommonEdgeRatio(sourcePrefix, prefix, true) / 2 + getCommonEdgeRatio(sourceSuffix, suffix, false) / 2;
}

function getCommonEdgeRatio(sourceContext: string, selectionContext: string, fromEnd: boolean): number {
	if (!selectionContext) {
		return 1;
	}
	let matchingLength = 0;
	while (matchingLength < selectionContext.length) {
		const selectionIndex = fromEnd ? selectionContext.length - matchingLength - 1 : matchingLength;
		const sourceIndex = fromEnd ? sourceContext.length - matchingLength - 1 : matchingLength;
		if (selectionContext[selectionIndex] !== sourceContext[sourceIndex]) {
			break;
		}
		matchingLength += 1;
	}
	return matchingLength / selectionContext.length;
}

function findTextStarts(text: string, selectedText: string): number[] {
	if (!selectedText) {
		return [];
	}
	const starts: number[] = [];
	let searchFrom = 0;
	while (searchFrom <= text.length) {
		const index = text.indexOf(selectedText, searchFrom);
		if (index < 0) {
			break;
		}
		starts.push(index);
		searchFrom = index + Math.max(1, selectedText.length);
	}
	return starts;
}

export function getReadingSelectionRenderedOffset(container: HTMLElement, range: Range): number {
	const prefixRange = getActiveDocument().createRange();
	prefixRange.selectNodeContents(container);
	prefixRange.setEnd(range.startContainer, range.startOffset);
	const offset = normalizeReadingSelection(prefixRange.toString()).length;
	return offset;
}

export function getReadingSelectionRect(range: Range): DOMRect | null {
	const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
	if (rects.length === 0) {
		const rect = range.getBoundingClientRect();
		return rect.width > 0 && rect.height > 0 ? rect : null;
	}
	return getBoundingRect(rects);
}

function getBoundingRect(rects: DOMRect[]): DOMRect | null {
	const first = rects[0];
	if (!first) {
		return null;
	}
	const left = Math.min(...rects.map((rect) => rect.left));
	const top = Math.min(...rects.map((rect) => rect.top));
	const right = Math.max(...rects.map((rect) => rect.right));
	const bottom = Math.max(...rects.map((rect) => rect.bottom));
	return new DOMRect(left, top, right - left, bottom - top);
}

function buildRenderedSourceIndex(source: string, sourceStartOffset = 0): RenderedSourceIndex {
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
		offsets.push(sourceStartOffset + index);
		index += 1;
	}
	return { text: rendered, offsets };
}

function renderedOffsetForSourceOffset(offsets: number[], sourceOffset: number): number {
	const index = offsets.findIndex((offset) => offset >= sourceOffset);
	return index >= 0 ? index : offsets.length;
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
