import { getActiveDocument } from "./dom-utils";
import type { SideMark } from "./types";

interface TextNodeRange {
	node: Text;
	start: number;
	end: number;
}

interface PlannedReadingMark {
	mark: SideMark;
	match: RenderedMatch;
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
	const fullText = ranges.map((range) => range.node.data).join("");
	const plannedMarks = activeMarks
		.map(({ mark }) => {
			const match = findBestRenderedMatch(fullText, mark);
			return match ? { mark, match } : null;
		})
		.filter((item): item is PlannedReadingMark => item !== null)
		.sort((left, right) => right.match.start - left.match.start || right.match.end - left.match.end);

	for (const item of plannedMarks) {
		wrapReadingMark(ranges, item.mark, item.match, onClick);
	}
}

function clearReadingMarks(container: HTMLElement): void {
	const wrappers = Array.from(container.querySelectorAll<HTMLElement>(".side-mark-reading"));
	for (const wrapper of wrappers) {
		wrapper.replaceWith(...Array.from(wrapper.childNodes));
	}
	container.normalize();
}

function wrapReadingMark(
	ranges: TextNodeRange[],
	mark: SideMark,
	match: RenderedMatch,
	onClick: (markId: string, rect: DOMRect) => void
): void {
	const start = match.start;
	const end = match.end;
	const startRange = ranges.find((range) => range.start <= start && range.end >= start);
	const endRange = ranges.find((range) => range.start <= end && range.end >= end);
	if (!startRange || !endRange) {
		return;
	}

	const activeDocument = getActiveDocument();
	const domRange = activeDocument.createRange();
	domRange.setStart(startRange.node, start - startRange.start);
	domRange.setEnd(endRange.node, end - endRange.start);
	const wrapper = activeDocument.createElement("span");
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
		event.preventDefault();
		event.stopPropagation();
		onClick(mark.id, wrapper.getBoundingClientRect());
	});

	try {
		wrapper.append(domRange.extractContents());
		domRange.insertNode(wrapper);
	} catch {
	}
}

function collectTextNodes(container: HTMLElement): TextNodeRange[] {
	const nodes: TextNodeRange[] = [];
	const walker = getActiveDocument().createTreeWalker(container, NodeFilter.SHOW_TEXT, {
		acceptNode(node) {
			const parent = node.parentElement;
			if (!parent || parent.closest(".side-mark-reading")) {
				return NodeFilter.FILTER_REJECT;
			}
			if (parent.closest("script, style")) {
				return NodeFilter.FILTER_REJECT;
			}
			return node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
		}
	});
	let offset = 0;
	let node = walker.nextNode();
	while (node) {
		const text = node as Text;
		const length = text.data.length;
		nodes.push({ node: text, start: offset, end: offset + length });
		offset += length;
		node = walker.nextNode();
	}
	return nodes;
}

interface RenderedMatch {
	start: number;
	end: number;
}

function findBestRenderedMatch(renderedText: string, mark: SideMark): RenderedMatch | null {
	for (const selectedText of toRenderedTextCandidates(mark.anchor.selectedText)) {
		const start = findBestRenderedTextStart(renderedText, selectedText, mark.anchor.position.lineStart);
		if (start >= 0) {
			return { start, end: start + selectedText.length };
		}
		const flexibleMatch = findWhitespaceInsensitiveMatch(renderedText, selectedText, mark.anchor.position.lineStart);
		if (flexibleMatch) {
			return flexibleMatch;
		}
	}
	return null;
}

function findBestRenderedTextStart(renderedText: string, selectedText: string, lineStart: number): number {
	const candidates: number[] = [];
	let searchFrom = 0;
	while (searchFrom <= renderedText.length) {
		const index = renderedText.indexOf(selectedText, searchFrom);
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
	const preferredLineOffset = estimateRenderedLineOffset(renderedText, lineStart);
	return candidates.sort((left, right) =>
		Math.abs(left - preferredLineOffset) - Math.abs(right - preferredLineOffset)
	)[0] || candidates[0] || 0;
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
		.replace(/`([^`]+)`/g, "$1")
		.replace(/(\*\*|__)(.*?)\1/g, "$2")
		.replace(/(\*|_)(.*?)\1/g, "$2")
		.replace(/~~(.*?)~~/g, "$1")
		.replace(/<[^>]+>/g, "");
}

function normalizeWhitespace(text: string): string {
	return text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n");
}

function findWhitespaceInsensitiveMatch(
	renderedText: string,
	selectedText: string,
	lineStart: number
): RenderedMatch | null {
	const rendered = buildNonWhitespaceIndex(renderedText);
	const selected = selectedText.replace(/\s+/g, "");
	if (!selected) {
		return null;
	}
	const start = findBestRenderedTextStart(rendered.text, selected, lineStart);
	if (start < 0) {
		return null;
	}
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

function estimateRenderedLineOffset(renderedText: string, lineNumber: number): number {
	if (lineNumber <= 1) {
		return 0;
	}
	const lines = renderedText.split(/\n/);
	let offset = 0;
	for (let index = 0; index < Math.min(lineNumber - 1, lines.length); index += 1) {
		offset += (lines[index]?.length || 0) + 1;
	}
	return offset;
}
