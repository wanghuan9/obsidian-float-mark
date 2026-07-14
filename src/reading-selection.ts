import { getActiveDocument } from "./dom-utils";

const READING_CONTEXT_LENGTH = 40;
const MIN_CONTEXT_SCORE = 1.4;
const MAX_UNIQUE_RENDERED_DISTANCE = 8;
const MARKDOWN_ESCAPABLE_CHARACTERS = "\\!\"#$%&'()*+,-./:;<=>?@[]^_`{|}~";
const HTML_NAMED_ENTITIES: Record<string, string> = {
	amp: "&",
	apos: "'",
	gt: ">",
	lt: "<",
	nbsp: "\u00A0",
	quot: "\""
};

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
	endOffsets: number[];
}

interface SourceCandidate {
	from: number;
	to: number;
	isExactSource: boolean;
	renderedDistance: number;
	contextScore: number;
}

interface SourceLine {
	startOffset: number;
	text: string;
}

interface TablePipeScan {
	structuralPipes: number[];
	escapedPipeBackslashes: number[];
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
	const directRanges = findDirectSourceRanges(sectionSource, selectedText, scope.sourceStartOffset)
		.map((range) => ({ ...range, isExactSource: true }));
	const renderedRanges = findRenderedSourceRanges(source, sourceIndex, renderedSelection)
		.map((range) => ({ ...range, isExactSource: false }));
	const candidatesByRenderedOffset = new Map<number, SourceCandidate>();
	for (const range of [...directRanges, ...renderedRanges]) {
		const renderedOffset = renderedOffsetForSourceOffset(sourceIndex.offsets, range.from);
		if (candidatesByRenderedOffset.has(renderedOffset)) {
			continue;
		}
		candidatesByRenderedOffset.set(renderedOffset, {
			...range,
			renderedDistance: Math.abs(renderedOffset - scope.renderedOffset),
			contextScore: getContextScore(sourceIndex.text, renderedSelection, renderedOffset, scope)
		});
	}
	return Array.from(candidatesByRenderedOffset.values());
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
		const to = sourceIndex.endOffsets[renderedOffset + renderedSelection.length - 1];
		return from === undefined || to === undefined ? [] : [{ from, to }];
	});
}

function chooseUniqueCandidate(candidates: SourceCandidate[]): SourceCandidate | null {
	const only = candidates[0];
	if (
		candidates.length === 1
		&& (only?.isExactSource || only?.renderedDistance <= MAX_UNIQUE_RENDERED_DISTANCE)
	) {
		return only;
	}
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
	const endOffsets: number[] = [];
	const tableSyntaxOffsets = findTableSyntaxOffsets(source);
	let index = 0;
	let inlineCodeRunLength = 0;
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
		const escapedCharacter = inlineCodeRunLength === 0 ? getEscapedMarkdownCharacter(source, index) : null;
		if (escapedCharacter) {
			rendered += escapedCharacter;
			offsets.push(sourceStartOffset + index);
			endOffsets.push(sourceStartOffset + index + 2);
			index += 2;
			continue;
		}
		if (tableSyntaxOffsets.has(index)) {
			index += 1;
			continue;
		}
		const char = source[index] || "";
		if (char === "`") {
			const runLength = countCharacterRun(source, index, "`");
			if (inlineCodeRunLength === 0) {
				inlineCodeRunLength = runLength;
			} else if (inlineCodeRunLength === runLength) {
				inlineCodeRunLength = 0;
			}
			index += runLength;
			continue;
		}
		const entity = inlineCodeRunLength === 0 ? getDecodedHtmlEntity(source, index) : null;
		if (entity) {
			if (!isIgnoredSpacing(entity.value)) {
				rendered += entity.value;
				for (let entityIndex = 0; entityIndex < entity.value.length; entityIndex += 1) {
					offsets.push(sourceStartOffset + index);
					endOffsets.push(sourceStartOffset + entity.endOffset);
				}
			}
			index = entity.endOffset;
			continue;
		}
		if (inlineCodeRunLength === 0 && isMarkdownMarkerAt(source, index)) {
			index += markerLengthAt(source, index);
			continue;
		}
		if (isIgnoredSpacing(char)) {
			index += 1;
			continue;
		}
		rendered += char;
		offsets.push(sourceStartOffset + index);
		endOffsets.push(sourceStartOffset + index + 1);
		index += 1;
	}
	return { text: rendered, offsets, endOffsets };
}

function getEscapedMarkdownCharacter(source: string, index: number): string | null {
	if (source[index] !== "\\") {
		return null;
	}
	const escaped = source[index + 1];
	return escaped && MARKDOWN_ESCAPABLE_CHARACTERS.includes(escaped) ? escaped : null;
}

function getDecodedHtmlEntity(source: string, index: number): { value: string; endOffset: number } | null {
	if (source[index] !== "&") {
		return null;
	}
	const match = source.slice(index).match(/^&(?:#(\d+)|#x([\dA-Fa-f]+)|(amp|lt|gt|quot|apos|nbsp));/);
	if (!match?.[0]) {
		return null;
	}
	const value = decodeHtmlEntityMatch(match);
	return value === null ? null : { value, endOffset: index + match[0].length };
}

function decodeHtmlEntityMatch(match: RegExpMatchArray): string | null {
	const decimal = match[1];
	const hexadecimal = match[2];
	if (decimal || hexadecimal) {
		const codePoint = Number.parseInt(decimal || hexadecimal || "", decimal ? 10 : 16);
		return Number.isFinite(codePoint) && codePoint <= 0x10FFFF ? String.fromCodePoint(codePoint) : null;
	}
	return HTML_NAMED_ENTITIES[match[3] || ""] || null;
}

function findTableSyntaxOffsets(source: string): Set<number> {
	const lines = splitSourceLines(source);
	const fencedCodeLines = findFencedCodeLines(lines);
	const offsets = new Set<number>();
	for (let index = 1; index < lines.length; index += 1) {
		const delimiter = lines[index];
		const header = lines[index - 1];
		if (!delimiter || !header || fencedCodeLines.has(index) || fencedCodeLines.has(index - 1)) {
			continue;
		}
		if (isIndentedCodeLine(delimiter.text) || isIndentedCodeLine(header.text)) {
			continue;
		}
		const delimiterCells = getTableCells(delimiter.text);
		const headerCells = getTableCells(header.text);
		if (!isTableDelimiterCells(delimiterCells) || headerCells.length !== delimiterCells.length) {
			continue;
		}
		addTableRowSyntaxOffsets(header, offsets);
		addLineOffsets(delimiter, offsets);
		let rowIndex = index + 1;
		while (rowIndex < lines.length && isTableBodyLine(lines[rowIndex], fencedCodeLines, rowIndex)) {
			addTableRowSyntaxOffsets(lines[rowIndex], offsets);
			rowIndex += 1;
		}
		index = rowIndex - 1;
	}
	return offsets;
}

function splitSourceLines(source: string): SourceLine[] {
	const lines: SourceLine[] = [];
	let startOffset = 0;
	for (let index = 0; index <= source.length; index += 1) {
		if (index < source.length && source[index] !== "\n") {
			continue;
		}
		const endOffset = index > startOffset && source[index - 1] === "\r" ? index - 1 : index;
		lines.push({ startOffset, text: source.slice(startOffset, endOffset) });
		startOffset = index + 1;
	}
	return lines;
}

function findFencedCodeLines(lines: SourceLine[]): Set<number> {
	const fencedLines = new Set<number>();
	let activeFence: { marker: string; length: number } | null = null;
	for (let index = 0; index < lines.length; index += 1) {
		const line = stripBlockquotePrefixes(lines[index]?.text || "");
		if (activeFence) {
			fencedLines.add(index);
			if (isClosingFence(line, activeFence)) {
				activeFence = null;
			}
			continue;
		}
		const opening = line.match(/^[ \t]{0,3}(`{3,}|~{3,})/);
		if (opening?.[1]) {
			activeFence = { marker: opening[1][0] || "", length: opening[1].length };
			fencedLines.add(index);
		}
	}
	return fencedLines;
}

function isClosingFence(line: string, fence: { marker: string; length: number }): boolean {
	const pattern = fence.marker === "`" ? /^ {0,3}(`{3,})[ \t]*$/ : /^ {0,3}(~{3,})[ \t]*$/;
	const closing = line.match(pattern)?.[1];
	return Boolean(closing && closing.length >= fence.length);
}

function isIndentedCodeLine(line: string): boolean {
	return /^(?: {4}|\t)/.test(stripBlockquotePrefixes(line));
}

function isTableBodyLine(line: SourceLine | undefined, fencedLines: Set<number>, lineIndex: number): boolean {
	return Boolean(line && !fencedLines.has(lineIndex) && !isIndentedCodeLine(line.text) && getTableCells(line.text).length > 0);
}

function getTableCells(line: string): string[] {
	const tableContent = stripBlockquotePrefixes(line);
	const pipes = scanTablePipes(tableContent).structuralPipes;
	if (pipes.length === 0) {
		return [];
	}
	const cells: string[] = [];
	let start = 0;
	for (const pipe of pipes) {
		cells.push(tableContent.slice(start, pipe).trim());
		start = pipe + 1;
	}
	cells.push(tableContent.slice(start).trim());
	if (cells[0] === "") {
		cells.shift();
	}
	if (cells[cells.length - 1] === "") {
		cells.pop();
	}
	return cells;
}

function stripBlockquotePrefixes(line: string): string {
	let content = line;
	while (/^[ \t]{0,3}>[ \t]?/.test(content)) {
		content = content.replace(/^[ \t]{0,3}>[ \t]?/, "");
	}
	return content;
}

function isTableDelimiterCells(cells: string[]): boolean {
	return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function addTableRowSyntaxOffsets(line: SourceLine, offsets: Set<number>): void {
	const pipeScan = scanTablePipes(line.text);
	for (const pipe of pipeScan.structuralPipes) {
		offsets.add(line.startOffset + pipe);
	}
	for (const backslash of pipeScan.escapedPipeBackslashes) {
		offsets.add(line.startOffset + backslash);
	}
}

function addLineOffsets(line: SourceLine, offsets: Set<number>): void {
	for (let index = 0; index < line.text.length; index += 1) {
		offsets.add(line.startOffset + index);
	}
}

function scanTablePipes(line: string): TablePipeScan {
	const structuralPipes: number[] = [];
	const escapedPipeBackslashes: number[] = [];
	let codeRunLength = 0;
	let index = 0;
	while (index < line.length) {
		if (line[index] === "`") {
			const runLength = countCharacterRun(line, index, "`");
			if (codeRunLength === 0) {
				codeRunLength = runLength;
			} else if (codeRunLength === runLength) {
				codeRunLength = 0;
			}
			index += runLength;
			continue;
		}
		if (line[index] === "|" && codeRunLength === 0) {
			const backslashCount = countPrecedingBackslashes(line, index);
			if (backslashCount % 2 === 1) {
				escapedPipeBackslashes.push(index - 1);
			} else {
				structuralPipes.push(index);
			}
		}
		index += 1;
	}
	return { structuralPipes, escapedPipeBackslashes };
}

function countCharacterRun(text: string, start: number, char: string): number {
	let length = 0;
	while (text[start + length] === char) {
		length += 1;
	}
	return length;
}

function countPrecedingBackslashes(text: string, index: number): number {
	let count = 0;
	while (text[index - count - 1] === "\\") {
		count += 1;
	}
	return count;
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
