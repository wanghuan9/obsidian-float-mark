import type { SideMark } from "./types";
import { hasNonEmptyDomSelection, shouldOpenMarkForSelection } from "./mark-click-guard";

const READING_BLOCK_SELECTOR = "p, li, h1, h2, h3, h4, h5, h6, blockquote, pre, td, th, dt, dd";
const ANCHOR_CONTEXT_LENGTH = 40;

interface TextNodeRange {
	node: Text;
	start: number;
	end: number;
	separatorBefore: string;
}

interface PlannedReadingMark {
	mark: SideMark;
	match: RenderedMatch;
}

interface NodeMarkIntersection {
	item: PlannedReadingMark;
	start: number;
	end: number;
}

interface NodeMarkSegment {
	start: number;
	end: number;
	items: PlannedReadingMark[];
}

export function renderReadingMarks(
	container: HTMLElement,
	source: string,
	marks: SideMark[],
	onClick: (markId: string, rect: DOMRect) => void
): void {
	clearReadingMarks(container);
	const activeMarks = marks
		.filter((mark) => mark.status !== "orphaned" && mark.status !== "resolved" && mark.anchor.selectedText)
		.map((mark) => ({ mark }));
	const ranges = collectTextNodes(container);
	const fullText = ranges.map((range) => range.separatorBefore + range.node.data).join("");
	const plannedMarks = activeMarks
		.map(({ mark }) => {
			const match = findBestRenderedMatch(fullText, mark);
			return match ? { mark, match } : null;
		})
		.filter((item): item is PlannedReadingMark => item !== null);
	applyReadingMarkFragments(ranges, plannedMarks, onClick);
}

function clearReadingMarks(container: HTMLElement): void {
	const wrappers = Array.from(container.querySelectorAll<HTMLElement>(".side-mark-reading"));
	for (const wrapper of wrappers.reverse()) {
		wrapper.replaceWith(...Array.from(wrapper.childNodes));
	}
	container.normalize();
}

function applyReadingMarkFragments(
	ranges: TextNodeRange[],
	plannedMarks: PlannedReadingMark[],
	onClick: (markId: string, rect: DOMRect) => void
): void {
	for (const range of ranges) {
		const segments = planNodeSegments(range, plannedMarks);
		if (segments.length === 0) {
			continue;
		}
		replaceTextNodeWithSegments(range.node, segments, onClick);
	}
}

function planNodeSegments(range: TextNodeRange, plannedMarks: PlannedReadingMark[]): NodeMarkSegment[] {
	const intersections = plannedMarks.map((item) => intersectMarkWithNode(range, item))
		.filter((intersection): intersection is NodeMarkIntersection => intersection !== null);
	if (intersections.length === 0) {
		return [];
	}
	const boundaries = Array.from(new Set(intersections.flatMap((intersection) => [intersection.start, intersection.end])))
		.sort((left, right) => left - right);
	const segments: NodeMarkSegment[] = [];
	for (let index = 0; index < boundaries.length - 1; index += 1) {
		const start = boundaries[index] || 0;
		const end = boundaries[index + 1] || start;
		const items = intersections.filter((intersection) => intersection.start < end && intersection.end > start)
			.map((intersection) => intersection.item)
			.sort(compareReadingMarkSpecificity);
		if (start < end && items.length > 0) {
			segments.push({ start, end, items });
		}
	}
	return segments;
}

function intersectMarkWithNode(range: TextNodeRange, item: PlannedReadingMark): NodeMarkIntersection | null {
	const start = Math.max(range.start, item.match.start);
	const end = Math.min(range.end, item.match.end);
	if (start >= end) {
		return null;
	}
	return {
		item,
		start: start - range.start,
		end: end - range.start
	};
}

function compareReadingMarkSpecificity(left: PlannedReadingMark, right: PlannedReadingMark): number {
	const leftLength = left.match.end - left.match.start;
	const rightLength = right.match.end - right.match.start;
	return leftLength - rightLength || left.match.start - right.match.start || left.mark.id.localeCompare(right.mark.id);
}

function replaceTextNodeWithSegments(
	node: Text,
	segments: NodeMarkSegment[],
	onClick: (markId: string, rect: DOMRect) => void
): void {
	const document = node.ownerDocument;
	const fragment = document.createDocumentFragment();
	let cursor = 0;
	for (const segment of segments) {
		if (cursor < segment.start) {
			fragment.append(document.createTextNode(node.data.slice(cursor, segment.start)));
		}
		let content: Node = document.createTextNode(node.data.slice(segment.start, segment.end));
		for (const item of segment.items) {
			const wrapper = createReadingMarkWrapper(document, item.mark, onClick);
			wrapper.append(content);
			content = wrapper;
		}
		fragment.append(content);
		cursor = segment.end;
	}
	if (cursor < node.data.length) {
		fragment.append(document.createTextNode(node.data.slice(cursor)));
	}
	node.replaceWith(fragment);
}

function createReadingMarkWrapper(
	document: Document,
	mark: SideMark,
	onClick: (markId: string, rect: DOMRect) => void
): HTMLSpanElement {
	const wrapper = document.createElement("span");
	wrapper.className = [
		"side-mark",
		"side-mark-reading",
		`side-mark--${mark.mark.kind}`,
		`side-mark--${mark.mark.color}`,
		`side-mark--text-${mark.mark.textColor}`,
		`side-mark--background-${mark.mark.backgroundColor}`
	].join(" ");
	wrapper.dataset.sideMarkReadingId = mark.id;
	wrapper.title = mark.note.content || "FloatMark";
	wrapper.addEventListener("click", (event) => {
		const hasTextSelection = hasNonEmptyDomSelection(wrapper.ownerDocument.getSelection());
		if (!shouldOpenMarkForSelection(hasTextSelection)) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		onClick(mark.id, wrapper.getBoundingClientRect());
	});
	return wrapper;
}

function collectTextNodes(container: HTMLElement): TextNodeRange[] {
	const nodes: TextNodeRange[] = [];
	const nodeFilter = container.ownerDocument.defaultView?.NodeFilter;
	if (!nodeFilter) {
		return nodes;
	}
	const walker = container.ownerDocument.createTreeWalker(container, nodeFilter.SHOW_TEXT, {
		acceptNode(node) {
			const parent = node.parentElement;
			if (!parent || parent.closest(".side-mark-reading")) {
				return nodeFilter.FILTER_REJECT;
			}
			if (parent.closest("script, style")) {
				return nodeFilter.FILTER_REJECT;
			}
			return node.textContent?.trim() ? nodeFilter.FILTER_ACCEPT : nodeFilter.FILTER_SKIP;
		}
	});
	let offset = 0;
	let previousBlock: Element | null = null;
	let previousText: Text | null = null;
	let node = walker.nextNode();
	while (node) {
		const text = node as Text;
		const block = text.parentElement?.closest(READING_BLOCK_SELECTOR) || text.parentElement;
		const hasStructuralBreak = previousText ? hasLineBreakBetween(previousText, text) : false;
		const separatorBefore = nodes.length > 0 && (block !== previousBlock || hasStructuralBreak) ? "\n" : "";
		offset += separatorBefore.length;
		const length = text.data.length;
		nodes.push({ node: text, start: offset, end: offset + length, separatorBefore });
		offset += length;
		previousBlock = block;
		previousText = text;
		node = walker.nextNode();
	}
	return nodes;
}

function hasLineBreakBetween(previous: Text, current: Text): boolean {
	const range = previous.ownerDocument.createRange();
	range.setStart(previous, previous.data.length);
	range.setEnd(current, 0);
	return Boolean(range.cloneContents().querySelector("br"));
}

export function buildSourceLineStarts(source: string): number[] {
	const lineStarts = [0];
	for (let index = 0; index < source.length; index += 1) {
		if (source[index] === "\n") {
			lineStarts.push(index + 1);
		}
	}
	return lineStarts;
}

export function getReadingMarksForSection(
	source: string,
	marks: SideMark[],
	sectionLineStart: number,
	sectionLineEnd: number,
	lineStarts = buildSourceLineStarts(source)
): SideMark[] {
	const sectionStartOffset = getLineStartOffset(source, lineStarts, sectionLineStart);
	const sectionEndOffset = getLineStartOffset(source, lineStarts, sectionLineEnd + 1);
	return marks.map((mark) => clipMarkToSection(
		source,
		lineStarts,
		mark,
		sectionStartOffset,
		sectionEndOffset,
		sectionLineStart
	))
		.filter((mark): mark is SideMark => mark !== null);
}

function clipMarkToSection(
	source: string,
	lineStarts: number[],
	mark: SideMark,
	sectionStartOffset: number,
	sectionEndOffset: number,
	sectionLineStart: number
): SideMark | null {
	const start = Math.max(mark.anchor.startOffset, sectionStartOffset);
	const end = Math.min(mark.anchor.endOffset, sectionEndOffset);
	if (start >= end) {
		return null;
	}
	const startPosition = offsetToLineColumn(lineStarts, start);
	const endPosition = offsetToLineColumn(lineStarts, end);
	return {
		...mark,
		anchor: {
			startOffset: start,
			endOffset: end,
			selectedText: source.slice(start, end),
			prefix: source.slice(Math.max(0, start - ANCHOR_CONTEXT_LENGTH), start),
			suffix: source.slice(end, end + ANCHOR_CONTEXT_LENGTH),
			position: {
				lineStart: Math.max(1, startPosition.line - sectionLineStart),
				lineEnd: Math.max(1, endPosition.line - sectionLineStart),
				columnStart: startPosition.column,
				columnEnd: endPosition.column
			}
		}
	};
}

function getLineStartOffset(source: string, lineStarts: number[], zeroBasedLine: number): number {
	return lineStarts[zeroBasedLine] ?? source.length;
}

function offsetToLineColumn(lineStarts: number[], offset: number): { line: number; column: number } {
	let low = 0;
	let high = lineStarts.length - 1;
	while (low <= high) {
		const middle = Math.floor((low + high) / 2);
		const lineStart = lineStarts[middle] || 0;
		if (lineStart <= offset) {
			low = middle + 1;
		} else {
			high = middle - 1;
		}
	}
	const lineIndex = Math.max(0, high);
	return {
		line: lineIndex + 1,
		column: offset - (lineStarts[lineIndex] || 0) + 1
	};
}

interface RenderedMatch {
	start: number;
	end: number;
}

function findBestRenderedMatch(renderedText: string, mark: SideMark): RenderedMatch | null {
	const context = getRenderedAnchorContext(mark);
	for (const selectedText of toRenderedTextCandidates(mark.anchor.selectedText)) {
		const start = findBestRenderedTextStart(renderedText, selectedText, mark, context);
		if (start >= 0) {
			return { start, end: start + selectedText.length };
		}
		const flexibleMatch = findWhitespaceInsensitiveMatch(
			renderedText,
			selectedText,
			mark,
			context
		);
		if (flexibleMatch) {
			return flexibleMatch;
		}
	}
	return null;
}

function findBestRenderedTextStart(
	renderedText: string,
	selectedText: string,
	mark: SideMark,
	context: RenderedAnchorContext
): number {
	const preferredOffset = estimateRenderedPositionOffset(
		renderedText,
		mark.anchor.position.lineStart,
		mark.anchor.position.columnStart
	);
	return findBestTextStartNearOffset(renderedText, selectedText, preferredOffset, context);
}

interface RenderedAnchorContext {
	prefix: string;
	suffix: string;
}

function getRenderedAnchorContext(mark: SideMark): RenderedAnchorContext {
	return {
		prefix: normalizeRenderedContext(stripMarkdownSyntax(mark.anchor.prefix)).slice(-80),
		suffix: normalizeRenderedContext(stripMarkdownSyntax(mark.anchor.suffix)).slice(0, 80)
	};
}

function normalizeRenderedContext(text: string): string {
	return text.replace(/\s+/g, " ");
}

function findBestTextStartNearOffset(
	text: string,
	selectedText: string,
	preferredOffset: number,
	context: RenderedAnchorContext
): number {
	const candidates: number[] = [];
	let searchFrom = 0;
	while (searchFrom <= text.length) {
		const index = text.indexOf(selectedText, searchFrom);
		if (index < 0) {
			break;
		}
		candidates.push(index);
		searchFrom = index + Math.max(1, selectedText.length);
	}
	if (candidates.length === 0) {
		return -1;
	}
	if (candidates.length === 1) {
		return candidates[0] || 0;
	}
	return chooseBestCandidate(candidates, (start) => start + selectedText.length, text, preferredOffset, context);
}

function chooseBestCandidate(
	candidates: number[],
	getEnd: (start: number) => number,
	text: string,
	preferredOffset: number,
	context: RenderedAnchorContext
): number {
	return candidates.sort((left, right) => {
		const rightScore = scoreCandidate(right, getEnd(right), text, preferredOffset, context);
		const leftScore = scoreCandidate(left, getEnd(left), text, preferredOffset, context);
		return rightScore - leftScore;
	})[0] || candidates[0] || 0;
}

function scoreCandidate(
	start: number,
	end: number,
	text: string,
	preferredOffset: number,
	context: RenderedAnchorContext
): number {
	const renderedPrefix = text.slice(Math.max(0, start - context.prefix.length), start);
	const renderedSuffix = text.slice(end, end + context.suffix.length);
	const contextScore = commonSuffixLength(renderedPrefix, context.prefix)
		+ commonPrefixLength(renderedSuffix, context.suffix);
	const distanceScore = 1 / (1 + Math.abs(start - preferredOffset));
	return contextScore * 1000 + distanceScore;
}

function commonSuffixLength(left: string, right: string): number {
	let length = 0;
	while (length < left.length && length < right.length && left[left.length - length - 1] === right[right.length - length - 1]) {
		length += 1;
	}
	return length;
}

function commonPrefixLength(left: string, right: string): number {
	let length = 0;
	while (length < left.length && length < right.length && left[length] === right[length]) {
		length += 1;
	}
	return length;
}

function toRenderedTextCandidates(selectedText: string): string[] {
	const normalized = normalizeWhitespace(selectedText).trim();
	const stripped = normalizeWhitespace(stripMarkdownSyntax(selectedText)).trim();
	const candidates = [
		selectedText,
		normalized,
		stripped
	].filter(Boolean);
	return Array.from(new Set(candidates));
}

function stripMarkdownSyntax(text: string): string {
	return text
		.replace(/^[\t ]*(?:[-+*]|\d+[.)])[\t ]+/gm, "")
		.replace(/^[\t ]{0,3}#{1,6}[\t ]+/gm, "")
		.replace(/^[\t ]{0,3}>[\t ]?/gm, "")
		.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		.replace(/\]\([^)]+\)/g, "")
		.replace(/`([^`]+)`/g, "$1")
		.replace(/\*\*(.*?)\*\*/g, "$1")
		.replace(/(^|[^\w])__([^\n]+?)__(?=$|[^\w])/g, "$1$2")
		.replace(/\*([^*\n]+)\*/g, "$1")
		.replace(/(^|[^\w])_([^\n]+?)_(?=$|[^\w])/g, "$1$2")
		.replace(/~~(.*?)~~/g, "$1")
		.replace(/<[^>]+>/g, "");
}

function normalizeWhitespace(text: string): string {
	return text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n");
}

function findWhitespaceInsensitiveMatch(
	renderedText: string,
	selectedText: string,
	mark: SideMark,
	context: RenderedAnchorContext
): RenderedMatch | null {
	const rendered = buildNonWhitespaceIndex(renderedText);
	const selected = selectedText.replace(/\s+/g, "");
	if (!selected) {
		return null;
	}
	const preferredOriginalOffset = estimateRenderedPositionOffset(
		renderedText,
		mark.anchor.position.lineStart,
		mark.anchor.position.columnStart
	);
	const candidates: number[] = [];
	let searchFrom = 0;
	while (searchFrom <= rendered.text.length) {
		const index = rendered.text.indexOf(selected, searchFrom);
		if (index < 0) {
			break;
		}
		candidates.push(index);
		searchFrom = index + Math.max(1, selected.length);
	}
	if (candidates.length === 0) {
		return null;
	}
	const start = candidates.sort((left, right) => {
		const leftStart = rendered.offsets[left] || 0;
		const rightStart = rendered.offsets[right] || 0;
		const leftEnd = (rendered.offsets[left + selected.length - 1] ?? leftStart) + 1;
		const rightEnd = (rendered.offsets[right + selected.length - 1] ?? rightStart) + 1;
		const rightScore = scoreCandidate(rightStart, rightEnd, renderedText, preferredOriginalOffset, context);
		const leftScore = scoreCandidate(leftStart, leftEnd, renderedText, preferredOriginalOffset, context);
		return rightScore - leftScore;
	})[0] || candidates[0] || 0;
	const originalStart = rendered.offsets[start];
	const originalEnd = rendered.offsets[start + selected.length - 1];
	if (originalStart === undefined || originalEnd === undefined) {
		return null;
	}
	return {
		start: originalStart,
		end: originalEnd + 1
	};
}

function buildNonWhitespaceIndex(text: string): { text: string; offsets: number[] } {
	let indexedText = "";
	const offsets: number[] = [];
	for (let index = 0; index < text.length; index += 1) {
		const char = text[index] || "";
		if (/\s/.test(char)) {
			continue;
		}
		indexedText += char;
		offsets.push(index);
	}
	return { text: indexedText, offsets };
}

export function findReadingMatchForTest(renderedText: string, mark: SideMark): RenderedMatch | null {
	return findBestRenderedMatch(renderedText, mark);
}

function estimateRenderedPositionOffset(renderedText: string, lineNumber: number, columnNumber: number): number {
	if (lineNumber <= 1) {
		return Math.min(renderedText.length, Math.max(0, columnNumber - 1));
	}
	const lines = renderedText.split(/\n/);
	let offset = 0;
	for (let index = 0; index < Math.min(lineNumber - 1, lines.length); index += 1) {
		offset += (lines[index]?.length || 0) + 1;
	}
	return Math.min(renderedText.length, offset + Math.max(0, columnNumber - 1));
}
