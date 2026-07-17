export interface SourceRange {
	from: number;
	to: number;
}

export interface MarkdownTableCell {
	rowIndex: number;
	cellIndex: number;
	range: SourceRange;
}

export interface MarkdownTableMap {
	range: SourceRange;
	cells: MarkdownTableCell[];
}

export interface MarkdownTablePipeScan {
	structuralPipes: number[];
	escapedPipeBackslashes: number[];
}

interface SourceLine extends SourceRange {
	text: string;
}

interface ParsedTableRow {
	line: SourceLine;
	cells: SourceRange[];
}

export function buildMarkdownTableMaps(
	source: string,
	searchRange: SourceRange = { from: 0, to: source.length }
): MarkdownTableMap[] {
	const range = normalizeRange(searchRange, source.length);
	const lines = splitSourceLines(source, range);
	const fencedCodeLines = findFencedCodeLines(lines);
	const tables: MarkdownTableMap[] = [];
	for (let index = 1; index < lines.length; index += 1) {
		const headerLine = lines[index - 1];
		const delimiterLine = lines[index];
		if (!headerLine || !delimiterLine || fencedCodeLines.has(index - 1) || fencedCodeLines.has(index)) {
			continue;
		}
		const header = parseTableRow(headerLine);
		const delimiter = parseTableRow(delimiterLine);
		if (
			!header
			|| !delimiter
			|| header.cells.length !== delimiter.cells.length
			|| !delimiter.cells.every((cell) => /^:?-{3,}:?$/.test(source.slice(cell.from, cell.to)))
		) {
			continue;
		}

		const rows: ParsedTableRow[] = [header];
		let bodyIndex = index + 1;
		while (bodyIndex < lines.length && !fencedCodeLines.has(bodyIndex)) {
			const line = lines[bodyIndex];
			const row = line ? parseTableRow(line) : null;
			if (!row) {
				break;
			}
			rows.push(row);
			bodyIndex += 1;
		}

		const cells = rows.flatMap((row, rowIndex) => row.cells.map((cell, cellIndex) => ({
			rowIndex,
			cellIndex,
			range: cell
		})));
		const lastRow = rows[rows.length - 1] || header;
		tables.push({
			range: { from: header.line.from, to: lastRow.line.to },
			cells
		});
		index = bodyIndex - 1;
	}
	return tables;
}

export function findMarkdownTableCellRange(
	source: string,
	tableRange: SourceRange,
	rowIndex: number,
	cellIndex: number
): SourceRange | null {
	const table = buildMarkdownTableMaps(source, tableRange)[0];
	return table?.cells.find((cell) => cell.rowIndex === rowIndex && cell.cellIndex === cellIndex)?.range || null;
}

function normalizeRange(range: SourceRange, sourceLength: number): SourceRange {
	const from = Math.max(0, Math.min(range.from, sourceLength));
	const to = Math.max(from, Math.min(range.to, sourceLength));
	return { from, to };
}

function splitSourceLines(source: string, range: SourceRange): SourceLine[] {
	const lines: SourceLine[] = [];
	let lineStart = range.from;
	for (let index = range.from; index <= range.to; index += 1) {
		if (index < range.to && source[index] !== "\n") {
			continue;
		}
		const lineEnd = index > lineStart && source[index - 1] === "\r" ? index - 1 : index;
		lines.push({
			from: lineStart,
			to: lineEnd,
			text: source.slice(lineStart, lineEnd)
		});
		lineStart = index + 1;
	}
	return lines;
}

function findFencedCodeLines(lines: SourceLine[]): Set<number> {
	const fencedLines = new Set<number>();
	let activeFence: { marker: string; length: number } | null = null;
	for (let index = 0; index < lines.length; index += 1) {
		const content = getTableLineContent(lines[index]?.text || "").text;
		if (activeFence) {
			fencedLines.add(index);
			if (isClosingFence(content, activeFence)) {
				activeFence = null;
			}
			continue;
		}
		const opening = content.match(/^[ \t]{0,3}(`{3,}|~{3,})/);
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

function parseTableRow(line: SourceLine): ParsedTableRow | null {
	const content = getTableLineContent(line.text);
	if (/^(?: {4}|\t)/.test(content.text)) {
		return null;
	}
	const delimiters = scanMarkdownTablePipes(content.text).structuralPipes;
	if (delimiters.length === 0) {
		return null;
	}
	const firstContentIndex = findFirstNonWhitespaceIndex(content.text);
	const lastContentIndex = findLastNonWhitespaceIndex(content.text);
	const hasLeadingDelimiter = delimiters[0] === firstContentIndex;
	const lastDelimiter = delimiters[delimiters.length - 1];
	const hasTrailingDelimiter = lastDelimiter !== undefined && lastDelimiter === lastContentIndex;
	const internalStart = hasLeadingDelimiter ? 1 : 0;
	const internalEnd = hasTrailingDelimiter ? delimiters.length - 1 : delimiters.length;
	const cells: SourceRange[] = [];
	let cellStart = hasLeadingDelimiter ? (delimiters[0] || 0) + 1 : 0;
	for (let index = internalStart; index < internalEnd; index += 1) {
		const delimiter = delimiters[index];
		if (delimiter === undefined) {
			continue;
		}
		cells.push(trimCellRange(content.text, line.from + content.offset, cellStart, delimiter));
		cellStart = delimiter + 1;
	}
	const cellEnd = hasTrailingDelimiter ? lastDelimiter || 0 : content.text.length;
	cells.push(trimCellRange(content.text, line.from + content.offset, cellStart, cellEnd));
	return { line, cells };
}

function getTableLineContent(line: string): { text: string; offset: number } {
	let text = line;
	let offset = 0;
	while (true) {
		const prefix = text.match(/^[ \t]{0,3}>[ \t]?/)?.[0];
		if (!prefix) {
			return { text, offset };
		}
		text = text.slice(prefix.length);
		offset += prefix.length;
	}
}

export function scanMarkdownTablePipes(line: string): MarkdownTablePipeScan {
	const structuralPipes: number[] = [];
	const escapedPipeBackslashes: number[] = [];
	let codeRunLength = 0;
	let index = 0;
	while (index < line.length) {
		if (line[index] === "`") {
			const runLength = countCharacterRun(line, index, "`");
			if (
				codeRunLength === 0
				&& countPrecedingBackslashes(line, index) % 2 === 0
				&& hasClosingCodeRun(line, index + runLength, runLength)
			) {
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

function hasClosingCodeRun(text: string, start: number, runLength: number): boolean {
	let index = start;
	while (index < text.length) {
		if (text[index] !== "`") {
			index += 1;
			continue;
		}
		const candidateLength = countCharacterRun(text, index, "`");
		if (candidateLength === runLength) {
			return true;
		}
		index += candidateLength;
	}
	return false;
}

function countCharacterRun(text: string, start: number, character: string): number {
	let length = 0;
	while (text[start + length] === character) {
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

function trimCellRange(line: string, lineOffset: number, start: number, end: number): SourceRange {
	let from = start;
	let to = Math.max(start, end);
	while (from < to && /[\t ]/.test(line[from] || "")) {
		from += 1;
	}
	while (to > from && /[\t ]/.test(line[to - 1] || "")) {
		to -= 1;
	}
	return { from: lineOffset + from, to: lineOffset + to };
}

function findFirstNonWhitespaceIndex(line: string): number {
	for (let index = 0; index < line.length; index += 1) {
		if (!/[\t ]/.test(line[index] || "")) {
			return index;
		}
	}
	return -1;
}

function findLastNonWhitespaceIndex(line: string): number {
	for (let index = line.length - 1; index >= 0; index -= 1) {
		if (!/[\t ]/.test(line[index] || "")) {
			return index;
		}
	}
	return -1;
}
