import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import esbuild from "esbuild";
import { JSDOM } from "jsdom";

await mkdir("test/.tmp", { recursive: true });
await esbuild.build({
	entryPoints: ["src/reading-view-renderer.ts"],
	bundle: true,
	format: "esm",
	platform: "browser",
	outfile: "test/.tmp/reading-view-renderer.mjs"
});

const {
	buildSourceLineStarts,
	findReadingMatchForTest,
	getReadingMarksForSection,
	renderReadingMarks
} = await import("./.tmp/reading-view-renderer.mjs");

function createMark({
	id = "mark-1",
	selectedText = "",
	startOffset = 0,
	endOffset = selectedText.length,
	lineStart = 1,
	lineEnd = lineStart,
	columnStart = 1,
	textColor = "default",
	backgroundColor = "red-light"
} = {}) {
	return {
		id,
		filePath: "note.md",
		anchor: {
			startOffset,
			endOffset,
			selectedText,
			prefix: "",
			suffix: "",
			position: {
				lineStart,
				lineEnd,
				columnStart,
				columnEnd: 1
			}
		},
		mark: {
			kind: "highlight",
			color: "green",
			textColor,
			backgroundColor
		},
		note: {
			content: "",
			createdAt: "",
			updatedAt: ""
		},
		status: "active"
	};
}

const boldMark = createMark({ selectedText: "**全生命周期管理**" });
const boldMatch = findReadingMatchForTest("1. 全生命周期管理：创建、编辑", boldMark);
assert.deepEqual(boldMatch, { start: 3, end: 10 });

const listMark = createMark({
	selectedText: "1. **全生命周期管理**：创建、编辑\n2. 快照固化：创建时复制"
});
const matchedList = findReadingMatchForTest("全生命周期管理：创建、编辑快照固化：创建时复制", listMark);
assert.deepEqual(matchedList, { start: 0, end: 23 });

const underscoredEmphasisMark = createMark({ selectedText: "__foo_bar__" });
const underscoredEmphasisMatch = findReadingMatchForTest("foo_bar", underscoredEmphasisMark);
assert.deepEqual(underscoredEmphasisMatch, { start: 0, end: 7 });

const sameLineRepeatedMark = createMark({ selectedText: "same", columnStart: 6 });
const sameLineRepeatedMatch = findReadingMatchForTest("same same same", sameLineRepeatedMark);
assert.deepEqual(sameLineRepeatedMatch, { start: 5, end: 9 });

const markdownContextSource = "[xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx](url) same same";
const markdownContextStart = markdownContextSource.indexOf("same");
const markdownContextMark = createMark({
	selectedText: "same",
	startOffset: markdownContextStart,
	endOffset: markdownContextStart + 4,
	columnStart: markdownContextStart + 1,
	lineEnd: 1
});
markdownContextMark.anchor.prefix = markdownContextSource.slice(Math.max(0, markdownContextStart - 40), markdownContextStart);
const markdownContextMatch = findReadingMatchForTest("xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx same same", markdownContextMark);
assert.deepEqual(markdownContextMatch, { start: 41, end: 45 });

const sectionSource = "**依赖关系**：\n- `PERM_CONTACT` 依赖 `VIEW_PHONE`\n- 前端不参与最终校验";
const sectionMark = createMark({
	id: "cross-section",
	selectedText: sectionSource,
	startOffset: 0,
	endOffset: sectionSource.length,
	lineStart: 1,
	lineEnd: 3
});
const sectionLineStarts = buildSourceLineStarts(sectionSource);
const firstSectionMarks = getReadingMarksForSection(sectionSource, [sectionMark], 0, 0, sectionLineStarts);
const listSectionMarks = getReadingMarksForSection(sectionSource, [sectionMark], 1, 2, sectionLineStarts);
assert.equal(firstSectionMarks.length, 1);
assert.equal(firstSectionMarks[0].anchor.selectedText, "**依赖关系**：\n");
assert.equal(firstSectionMarks[0].anchor.position.lineStart, 1);
assert.equal(listSectionMarks.length, 1);
assert.equal(listSectionMarks[0].anchor.selectedText, "- `PERM_CONTACT` 依赖 `VIEW_PHONE`\n- 前端不参与最终校验");
assert.equal(listSectionMarks[0].anchor.position.lineStart, 1);

const crossBlockSource = [
	"**依赖关系**：",
	"- `PERM_CONTACT` 依赖 `VIEW_PHONE`",
	"- 依赖关系写在枚举中，不落数据库关系表",
	"- 校验逻辑收归 `PermissionEnum.validateDependencies()` 静态方法，不单独建 Service",
	"- 前端根据依赖关系展示提示，不参与最终校验"
].join("\n");
const crossBlockMark = createMark({
	id: "cross-block",
	selectedText: crossBlockSource,
	startOffset: 0,
	endOffset: crossBlockSource.length,
	lineStart: 1,
	lineEnd: 5
});
const crossBlockDom = new JSDOM(`
	<div id="root"><p><strong>依赖关系</strong>：</p><ul><li><code>PERM_CONTACT</code> 依赖 <code>VIEW_PHONE</code></li><li>依赖关系写在枚举中，不落数据库关系表</li><li>校验逻辑收归 <code>PermissionEnum.validateDependencies()</code> 静态方法，不单独建 Service</li><li>前端根据依赖关系展示提示，不参与最终校验</li></ul></div>
`);
const crossBlockRoot = crossBlockDom.window.document.querySelector("#root");
const crossBlockOriginalHtml = crossBlockRoot.innerHTML;
const crossBlockOriginalText = crossBlockRoot.textContent;
renderReadingMarks(crossBlockRoot, crossBlockSource, [crossBlockMark], () => undefined);
assert.equal(crossBlockRoot.textContent, crossBlockOriginalText);
assert.equal(crossBlockRoot.querySelectorAll(":scope > p").length, 1);
assert.equal(crossBlockRoot.querySelectorAll(":scope > ul > li").length, 4);
assert.equal(crossBlockRoot.querySelectorAll(".side-mark-reading p, .side-mark-reading ul, .side-mark-reading li").length, 0);
assert.ok(crossBlockRoot.querySelectorAll(".side-mark-reading").length >= 8);
renderReadingMarks(crossBlockRoot, crossBlockSource, [], () => undefined);
assert.equal(crossBlockRoot.innerHTML, crossBlockOriginalHtml);

const boundaryDom = new JSDOM("<div id=\"root\"><p>first<strong>second</strong></p></div>");
const boundaryRoot = boundaryDom.window.document.querySelector("#root");
const boundaryMark = createMark({ id: "boundary", selectedText: "second", startOffset: 5, endOffset: 11 });
renderReadingMarks(boundaryRoot, "firstsecond", [boundaryMark], () => undefined);
const boundaryWrapper = boundaryRoot.querySelector("[data-side-mark-reading-id=\"boundary\"]");
assert.equal(boundaryWrapper.parentElement.tagName, "STRONG");
assert.equal(boundaryRoot.querySelector("p").childNodes[0].textContent, "first");

const repeatedDom = new JSDOM("<div id=\"root\"><p>same</p><p>same</p><p>same</p></div>");
const repeatedRoot = repeatedDom.window.document.querySelector("#root");
const repeatedMark = createMark({ id: "repeated", selectedText: "same", lineStart: 2 });
renderReadingMarks(repeatedRoot, "same\nsame\nsame", [repeatedMark], () => undefined);
const repeatedWrapper = repeatedRoot.querySelector("[data-side-mark-reading-id=\"repeated\"]");
assert.equal(repeatedWrapper.parentElement, repeatedRoot.querySelectorAll("p")[1]);

const softBreakDom = new JSDOM("<div id=\"root\"><p>same<br>same<br>same</p></div>");
const softBreakRoot = softBreakDom.window.document.querySelector("#root");
const softBreakMark = createMark({ id: "soft-break", selectedText: "same", lineStart: 2 });
renderReadingMarks(softBreakRoot, "same\nsame\nsame", [softBreakMark], () => undefined);
const softBreakWrapper = softBreakRoot.querySelector("[data-side-mark-reading-id=\"soft-break\"]");
assert.equal(softBreakWrapper.previousElementSibling.tagName, "BR");
assert.equal(softBreakWrapper.nextElementSibling.tagName, "BR");

const overlapDom = new JSDOM("<div id=\"root\"><p>abcdef</p></div>");
const overlapRoot = overlapDom.window.document.querySelector("#root");
const outerMark = createMark({ id: "outer", selectedText: "abcdef", startOffset: 0, endOffset: 6 });
const innerMark = createMark({
	id: "inner",
	selectedText: "cd",
	startOffset: 2,
	endOffset: 4,
	backgroundColor: "blue-light"
});
renderReadingMarks(overlapRoot, "abcdef", [outerMark, innerMark], () => undefined);
assert.equal(overlapRoot.textContent, "abcdef");
assert.equal(overlapRoot.querySelectorAll("[data-side-mark-reading-id=\"outer\"]").length, 3);
assert.equal(overlapRoot.querySelectorAll("[data-side-mark-reading-id=\"inner\"]").length, 1);
const innerWrapper = overlapRoot.querySelector("[data-side-mark-reading-id=\"inner\"]");
assert.equal(innerWrapper.parentElement.dataset.sideMarkReadingId, "outer");
const firstRenderHtml = overlapRoot.innerHTML;
renderReadingMarks(overlapRoot, "abcdef", [outerMark, innerMark], () => undefined);
assert.equal(overlapRoot.innerHTML, firstRenderHtml);
renderReadingMarks(overlapRoot, "abcdef", [], () => undefined);
assert.equal(overlapRoot.innerHTML, "<p>abcdef</p>");

console.log("reading view renderer tests passed");
