import type { TextAnchor } from "./types";

const CONTEXT_LENGTH = 40;

export interface RelocateAnchorOptions {
	trustStoredPosition?: boolean;
	allowUniqueTextFallback?: boolean;
}

export function createTextAnchor(source: string, startOffset: number, endOffset: number): TextAnchor {
	const start = Math.max(0, Math.min(startOffset, endOffset, source.length));
	const end = Math.max(start, Math.min(Math.max(startOffset, endOffset), source.length));
	const startPosition = offsetToLineColumn(source, start);
	const endPosition = offsetToLineColumn(source, end);
	return {
		startOffset: start,
		endOffset: end,
		selectedText: source.slice(start, end),
		prefix: source.slice(Math.max(0, start - CONTEXT_LENGTH), start),
		suffix: source.slice(end, end + CONTEXT_LENGTH),
		position: {
			lineStart: startPosition.line,
			lineEnd: endPosition.line,
			columnStart: startPosition.column,
			columnEnd: endPosition.column
		}
	};
}

export function relocateAnchor(
	source: string,
	anchor: TextAnchor,
	options: RelocateAnchorOptions = {}
): TextAnchor | null {
	const trustStoredPosition = options.trustStoredPosition ?? true;
	const allowUniqueTextFallback = options.allowUniqueTextFallback ?? true;
	if (!anchor.selectedText) {
		return null;
	}
	if (trustStoredPosition && source.slice(anchor.startOffset, anchor.endOffset) === anchor.selectedText) {
		return createTextAnchor(source, anchor.startOffset, anchor.endOffset);
	}

	const contextual = findByContext(source, anchor);
	if (contextual !== null) {
		return createTextAnchor(source, contextual, contextual + anchor.selectedText.length);
	}
	if (!allowUniqueTextFallback) {
		return null;
	}

	const matches = findExactMatches(source, anchor.selectedText);
	if (matches.length === 1) {
		const match = matches[0];
		if (match !== undefined) {
			return createTextAnchor(source, match, match + anchor.selectedText.length);
		}
	}

	return null;
}

function findByContext(source: string, anchor: TextAnchor): number | null {
	let searchFrom = 0;
	let best: { index: number; score: number } | null = null;
	let ambiguous = false;
	while (searchFrom <= source.length) {
		const index = source.indexOf(anchor.selectedText, searchFrom);
		if (index < 0) {
			break;
		}
		const end = index + anchor.selectedText.length;
		const prefix = source.slice(Math.max(0, index - anchor.prefix.length), index);
		const suffix = source.slice(end, end + anchor.suffix.length);
		const score = similarity(prefix, anchor.prefix) + similarity(suffix, anchor.suffix);
		if (!best || score > best.score) {
			best = { index, score };
			ambiguous = false;
		} else if (score === best.score) {
			ambiguous = true;
		}
		searchFrom = end;
	}
	return best && best.score >= 1.4 && !ambiguous ? best.index : null;
}

function findExactMatches(source: string, selectedText: string): number[] {
	const matches: number[] = [];
	let searchFrom = 0;
	while (searchFrom <= source.length) {
		const index = source.indexOf(selectedText, searchFrom);
		if (index < 0) {
			break;
		}
		matches.push(index);
		searchFrom = index + Math.max(1, selectedText.length);
	}
	return matches;
}

function similarity(left: string, right: string): number {
	const maxLength = Math.max(left.length, right.length);
	if (maxLength === 0) {
		return 1;
	}
	let same = 0;
	for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
		if (left[index] === right[index]) {
			same += 1;
		}
	}
	return same / maxLength;
}

function offsetToLineColumn(source: string, offset: number): { line: number; column: number } {
	let line = 1;
	let column = 1;
	for (let index = 0; index < offset; index += 1) {
		if (source[index] === "\n") {
			line += 1;
			column = 1;
		} else {
			column += 1;
		}
	}
	return { line, column };
}
