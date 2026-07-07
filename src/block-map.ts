export interface MarkdownBlock {
	index: number;
	kind: string;
	startOffset: number;
	endOffset: number;
	content: string;
}

export interface RemoteUnit {
	kind: string;
	hash: string;
	blockId: string;
}

export function splitMarkdownBlocks(markdown: string): MarkdownBlock[] {
	const lines = markdown.replace(/\r\n/g, "\n").split("\n");
	const blocks: MarkdownBlock[] = [];
	const lineStarts = createLineStarts(markdown.replace(/\r\n/g, "\n"));
	let index = 0;
	while (index < lines.length) {
		const line = lines[index] || "";
		if (line.trim() === "") {
			index += 1;
			continue;
		}

		const startLine = index;
		const kind = readBlockKind(line);
		if (kind === "heading" || kind === "hr") {
			index += 1;
		} else if (kind === "code") {
			index += 1;
			while (index < lines.length && !/^\s{0,3}```/.test(lines[index] || "")) {
				index += 1;
			}
			if (index < lines.length) {
				index += 1;
			}
		} else if (kind === "list") {
			index += 1;
			while (index < lines.length
				&& (lines[index] || "").trim() !== ""
				&& (readBlockKind(lines[index] || "") === "list" || /^\s+/.test(lines[index] || ""))) {
				index += 1;
			}
		} else if (kind === "blockquote" || kind === "table") {
			index += 1;
			while (index < lines.length && readBlockKind(lines[index] || "") === kind) {
				index += 1;
			}
		} else {
			index += 1;
			while (index < lines.length && (lines[index] || "").trim() !== "" && readBlockKind(lines[index] || "") === "paragraph") {
				index += 1;
			}
		}

		const startOffset = lineStarts[startLine] || 0;
		const endOffset = lineStarts[index] ?? markdown.length;
		blocks.push({
			index: blocks.length,
			kind,
			startOffset,
			endOffset,
			content: markdown.slice(startOffset, endOffset).trim()
		});
	}
	return blocks;
}

export function findFirstHitBlock(markdown: string, startOffset: number, endOffset: number): MarkdownBlock | null {
	const start = Math.min(startOffset, endOffset);
	const end = Math.max(startOffset, endOffset);
	return splitMarkdownBlocks(markdown).find((block) => block.endOffset > start && block.startOffset < end) || null;
}

export function findRemoteBlockId(markdown: string, units: RemoteUnit[], startOffset: number, endOffset: number): string | null {
	const block = findFirstHitBlock(markdown, startOffset, endOffset);
	if (!block) {
		return null;
	}
	return units[block.index]?.blockId || null;
}

function createLineStarts(markdown: string): number[] {
	const starts = [0];
	for (let index = 0; index < markdown.length; index += 1) {
		if (markdown[index] === "\n") {
			starts.push(index + 1);
		}
	}
	starts.push(markdown.length);
	return starts;
}

function readBlockKind(line: string): string {
	if (/^#{1,6}\s+/.test(line)) return "heading";
	if (/^\s{0,3}```/.test(line)) return "code";
	if (/^\s*>/.test(line)) return "blockquote";
	if (/^\s*(?:[-+*]|\d+\.)\s+/.test(line)) return "list";
	if (/^\s*[|]/.test(line)) return "table";
	if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) return "hr";
	return "paragraph";
}
