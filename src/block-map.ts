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

const LARK_BINDING_KEYS = new Set([
	"lark_doc_url",
	"lark_doc_token",
	"lark_remote_root",
	"lark_remote_parent_path"
]);

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

export function findRemoteBlockId(
	markdown: string,
	units: RemoteUnit[],
	startOffset: number,
	endOffset: number,
	titleBlockId?: string
): string | null {
	const block = findFirstHitRemoteBlock(markdown, startOffset, endOffset);
	if (!block) {
		return null;
	}
	if (block.kind === "title") {
		return titleBlockId || null;
	}
	return units[block.index]?.blockId || null;
}

function findFirstHitRemoteBlock(markdown: string, startOffset: number, endOffset: number): MarkdownBlock | null {
	const start = Math.min(startOffset, endOffset);
	const end = Math.max(startOffset, endOffset);
	return splitRemoteMarkdownBlocks(markdown).find((block) => block.endOffset > start && block.startOffset < end) || null;
}

function splitRemoteMarkdownBlocks(markdown: string): MarkdownBlock[] {
	const normalized = markdown.replace(/\r\n/g, "\n");
	const lines = normalized.split("\n");
	const lineStarts = createLineStarts(normalized);
	const hiddenLines = findHiddenFrontmatterLines(lines);
	const metadataBlock = findMetadataFrontmatterBlock(lines, hiddenLines);
	const titleLine = findDocumentTitleLine(lines, hiddenLines, metadataBlock);
	const blocks: MarkdownBlock[] = [];
	if (titleLine !== null) {
		pushRemoteBlock(blocks, markdown, lineStarts, titleLine, titleLine + 1, "title", -1);
	}
	if (metadataBlock) {
		pushRemoteBlock(blocks, markdown, lineStarts, metadataBlock.startLine, metadataBlock.endLine, "blockquote", 0);
	}

	let index = titleLine !== null ? titleLine + 1 : 0;
	if (metadataBlock && index < metadataBlock.endLine) {
		index = metadataBlock.endLine;
	}
	while (index < lines.length && (hiddenLines.has(index) || (lines[index] || "").trim() === "")) {
		index += 1;
	}

	let remoteBlockIndex = metadataBlock ? 1 : 0;
	while (index < lines.length) {
		const line = lines[index] || "";
		if (line.trim() === "" || hiddenLines.has(index)) {
			index += 1;
			continue;
		}

		const startLine = index;
		const kind = readRemoteBlockKind(line);
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
				&& readRemoteBlockKind(lines[index] || "") === "paragraph"
				&& !isMarkdownParagraphLabelBoundary(lines[index] || "")) {
				index += 1;
			}
		} else if (kind === "blockquote" || kind === "table") {
			index += 1;
			while (index < lines.length && readRemoteBlockKind(lines[index] || "") === kind) {
				index += 1;
			}
		} else {
			index += 1;
			while (index < lines.length
				&& (lines[index] || "").trim() !== ""
				&& !isRemoteBlockBoundary(lines[index] || "")
				&& !isMarkdownParagraphLabelBoundary(lines[index] || "")) {
				index += 1;
			}
		}

		pushRemoteBlock(blocks, markdown, lineStarts, startLine, index, kind, remoteBlockIndex);
		remoteBlockIndex += 1;
	}

	return blocks;
}

function pushRemoteBlock(
	blocks: MarkdownBlock[],
	markdown: string,
	lineStarts: number[],
	startLine: number,
	endLine: number,
	kind: string,
	index: number
): void {
	const startOffset = lineStarts[startLine] || 0;
	const endOffset = lineStarts[endLine] ?? markdown.length;
	blocks.push({
		index,
		kind,
		startOffset,
		endOffset,
		content: markdown.slice(startOffset, endOffset).trim()
	});
}

function findHiddenFrontmatterLines(lines: string[]): Set<number> {
	const hiddenLines = new Set<number>();
	const frontmatter = readFrontmatterRange(lines);
	if (!frontmatter) {
		return hiddenLines;
	}

	const visibleLines = getVisibleFrontmatterLines(lines, frontmatter);
	if (visibleLines.length > 0) {
		return hiddenLines;
	}

	for (let index = frontmatter.startLine; index < frontmatter.endLine; index += 1) {
		hiddenLines.add(index);
	}
	return hiddenLines;
}

function findMetadataFrontmatterBlock(
	lines: string[],
	hiddenLines: Set<number>
): { startLine: number; endLine: number } | null {
	if (hiddenLines.size > 0) {
		return null;
	}
	const frontmatter = readFrontmatterRange(lines);
	if (!frontmatter) {
		return null;
	}
	const visibleLines = getVisibleFrontmatterLines(lines, frontmatter);
	return visibleLines.length > 0 ? frontmatter : null;
}

function readFrontmatterRange(lines: string[]): { startLine: number; endLine: number } | null {
	if ((lines[0] || "").trim() !== "---") {
		return null;
	}

	for (let index = 1; index < lines.length; index += 1) {
		if ((lines[index] || "").trim() === "---") {
			return { startLine: 0, endLine: index + 1 };
		}
	}
	return null;
}

function getVisibleFrontmatterLines(lines: string[], range: { startLine: number; endLine: number }): string[] {
	return lines.slice(range.startLine + 1, range.endLine - 1).filter((line) => {
		return !LARK_BINDING_KEYS.has(getYamlKey(line));
	});
}

function getYamlKey(line: string): string {
	const match = line.match(/^([^:#\s][^:]*):/);
	return match?.[1]?.trim() || "";
}

function findDocumentTitleLine(
	lines: string[],
	hiddenLines: Set<number>,
	metadataBlock: { startLine: number; endLine: number } | null
): number | null {
	let index = 0;
	if (metadataBlock) {
		index = metadataBlock.endLine;
	}
	while (index < lines.length && (hiddenLines.has(index) || (lines[index] || "").trim() === "")) {
		index += 1;
	}
	return /^#\s+/.test(lines[index] || "") ? index : null;
}

function isRemoteBlockBoundary(line: string): boolean {
	return readRemoteBlockKind(line) !== "paragraph";
}

function isMarkdownParagraphLabelBoundary(line: string): boolean {
	return /^\*\*[^*\n]+?\*\*[：:]\s*$/.test(line.trim());
}

function readRemoteBlockKind(line: string): string {
	if (/^#{2,6}\s+/.test(line)) return "heading";
	if (/^\s{0,3}```/.test(line)) return "code";
	if (/^\s*>/.test(line)) return "blockquote";
	if (/^\s*(?:[-+*]|\d+\.)\s+/.test(line)) return "list";
	if (/^\s*[|]/.test(line)) return "table";
	if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) return "hr";
	return "paragraph";
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
