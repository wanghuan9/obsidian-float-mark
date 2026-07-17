import { buildMarkdownTableMaps } from "./markdown-table-map";

export interface MarkdownTableCellCoordinate {
	rowIndex: number;
	cellIndex: number;
}

export function buildLarkTableFetchArgs(doc: string, tableBlockId: string): string[] {
	return [
		"docs",
		"+fetch",
		"--as",
		"user",
		"--doc",
		doc,
		"--scope",
		"range",
		"--start-block-id",
		tableBlockId,
		"--end-block-id",
		tableBlockId,
		"--detail",
		"with-ids",
		"--format",
		"json"
	];
}

export function findMarkdownTableCellCoordinate(
	source: string,
	startOffset: number,
	endOffset: number
): MarkdownTableCellCoordinate | null {
	for (const table of buildMarkdownTableMaps(source)) {
		const cell = table.cells.find((candidate) =>
			candidate.range.from < endOffset && candidate.range.to > startOffset
		);
		if (cell) {
			return { rowIndex: cell.rowIndex, cellIndex: cell.cellIndex };
		}
	}
	return null;
}

export function findRemoteTableCellBlockId(
	xml: string,
	rowIndex: number,
	cellIndex: number
): string | null {
	const rows = Array.from(xml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi));
	const rowContent = rows[rowIndex]?.[1];
	if (!rowContent) {
		return null;
	}
	const cells = Array.from(rowContent.matchAll(/<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi));
	const cellContent = cells[cellIndex]?.[2];
	if (!cellContent) {
		return null;
	}
	const block = cellContent.match(/<(?:p|h[1-9]|li|code|quote|blockquote|todo|checkbox)\b[^>]*\bid=(['"])([^'"]+)\1/i);
	return block?.[2] || null;
}
