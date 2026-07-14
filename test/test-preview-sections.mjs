import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import esbuild from "esbuild";
import { JSDOM } from "jsdom";

await mkdir("test/.tmp", { recursive: true });
await esbuild.build({
	entryPoints: ["src/preview-sections.ts"],
	bundle: true,
	format: "esm",
	platform: "node",
	outfile: "test/.tmp/preview-sections.mjs"
});

const { resolvePreviewSectionBounds, selectPreviewSections } = await import("./.tmp/preview-sections.mjs");

assert.deepEqual(resolvePreviewSectionBounds({
	start: { line: 21, col: 0, offset: 574 },
	end: { line: 26, col: 63, offset: 932 }
}), {
	lineStart: 21,
	lineEnd: 26,
	sourceStartOffset: 574,
	sourceEndOffset: 932
});

assert.deepEqual(resolvePreviewSectionBounds({ lineStart: 21, lineEnd: 26 }), {
	lineStart: 21,
	lineEnd: 26
});

assert.equal(resolvePreviewSectionBounds({ start: { line: 21 }, end: {} }), null);

function selectedIds(sections, range) {
	return selectPreviewSections(sections, range).map((section) => section.el.id);
}

const boundaryDom = new JSDOM([
	'<h3 id="heading-only">3.2 留货直销单状态机</h3>',
	'<div id="following-table"><table><tbody><tr><td>下一块表格</td></tr></tbody></table></div>'
].join(""));
const headingOnly = boundaryDom.window.document.querySelector("#heading-only");
const followingTable = boundaryDom.window.document.querySelector("#following-table");
const boundarySections = [
	{ el: headingOnly, lineStart: 45, lineEnd: 45, sourceStartOffset: 100, sourceEndOffset: 116 },
	{ el: followingTable, lineStart: 47, lineEnd: 49, sourceStartOffset: 118, sourceEndOffset: 180 }
];
const headingToTableBoundary = boundaryDom.window.document.createRange();
headingToTableBoundary.setStart(headingOnly.firstChild, 0);
headingToTableBoundary.setEnd(followingTable, 0);
assert.deepEqual(selectedIds(boundarySections, headingToTableBoundary), ["heading-only"]);

const crossBlockDom = new JSDOM([
	'<h3 id="heading">3.3 留货物品状态</h3>',
	'<p id="paragraph">状态从 <code>holding_item</code> 调整到目标状态。</p>',
	'<div id="table"><table><tbody><tr><td>表格内容</td></tr></tbody></table></div>'
].join(""));
const heading = crossBlockDom.window.document.querySelector("#heading");
const paragraph = crossBlockDom.window.document.querySelector("#paragraph");
const table = crossBlockDom.window.document.querySelector("#table");
const tableCellText = table.querySelector("td").firstChild;
const crossBlockSections = [
	{ el: heading, lineStart: 58, lineEnd: 58, sourceStartOffset: 200, sourceEndOffset: 220 },
	{ el: paragraph, lineStart: 60, lineEnd: 60, sourceStartOffset: 222, sourceEndOffset: 280 },
	{ el: table, lineStart: 62, lineEnd: 64, sourceStartOffset: 282, sourceEndOffset: 340 }
];
const headingThroughParagraph = crossBlockDom.window.document.createRange();
headingThroughParagraph.setStart(heading.firstChild, 0);
headingThroughParagraph.setEnd(paragraph.lastChild, paragraph.lastChild.data.length);
assert.deepEqual(selectedIds(crossBlockSections, headingThroughParagraph), ["heading", "paragraph"]);

const headingIntoTable = crossBlockDom.window.document.createRange();
headingIntoTable.setStart(heading.firstChild, 0);
headingIntoTable.setEnd(tableCellText, 2);
assert.deepEqual(selectedIds(crossBlockSections, headingIntoTable), ["heading", "paragraph", "table"]);

const afterHeadingThroughParagraph = crossBlockDom.window.document.createRange();
afterHeadingThroughParagraph.setStart(heading, heading.childNodes.length);
afterHeadingThroughParagraph.setEnd(paragraph.lastChild, paragraph.lastChild.data.length);
assert.deepEqual(selectedIds(crossBlockSections, afterHeadingThroughParagraph), ["paragraph"]);

const headingPairDom = new JSDOM([
	'<h3 id="first-heading">4. 设计方案</h3>',
	'<h4 id="next-heading">4.1 方案概览</h4>'
].join(""));
const firstHeading = headingPairDom.window.document.querySelector("#first-heading");
const nextHeading = headingPairDom.window.document.querySelector("#next-heading");
const headingPairSections = [
	{ el: firstHeading, lineStart: 70, lineEnd: 70, sourceStartOffset: 400, sourceEndOffset: 412 },
	{ el: nextHeading, lineStart: 72, lineEnd: 72, sourceStartOffset: 414, sourceEndOffset: 428 }
];
const headingThroughNextHeading = headingPairDom.window.document.createRange();
headingThroughNextHeading.setStart(firstHeading.firstChild, 0);
headingThroughNextHeading.setEnd(nextHeading.firstChild, nextHeading.firstChild.data.length);
assert.deepEqual(selectedIds(headingPairSections, headingThroughNextHeading), ["first-heading", "next-heading"]);

const reorderedSections = [
	crossBlockSections[0],
	{ ...crossBlockSections[1], lineStart: 57, lineEnd: 57, sourceStartOffset: 180, sourceEndOffset: 199 }
];
assert.deepEqual(selectPreviewSections(reorderedSections, headingThroughParagraph), []);

console.log("preview section tests passed");
