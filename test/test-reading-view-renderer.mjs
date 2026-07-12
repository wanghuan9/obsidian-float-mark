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

const continuousInlineDom = new JSDOM(
	'<div id="root"><p><span>所有</span> <code>代码</code> <span>引用</span></p></div>'
);
const continuousInlineRoot = continuousInlineDom.window.document.querySelector("#root");
const continuousInlineOriginalHtml = continuousInlineRoot.innerHTML;
const continuousInlineMark = createMark({
	id: "continuous-inline",
	selectedText: "所有 `代码` 引用",
	startOffset: 0,
	endOffset: 10,
	backgroundColor: "red-light"
});
renderReadingMarks(continuousInlineRoot, "所有 `代码` 引用", [continuousInlineMark], () => undefined);
const continuousInlineParagraph = continuousInlineRoot.querySelector("p");
const continuousInlineSpaces = Array.from(continuousInlineParagraph.childNodes)
	.filter((node) => node.nodeType === continuousInlineDom.window.Node.TEXT_NODE && node.textContent === " ");
const continuousInlineCode = continuousInlineRoot.querySelector("code");
assert.equal(continuousInlineSpaces.length, 0);
assert.equal(continuousInlineCode.parentElement.dataset.sideMarkReadingId, "continuous-inline");
assert.equal(continuousInlineCode.classList.contains("side-mark-reading-inline-content"), true);
assert.equal(continuousInlineCode.querySelector(".side-mark-reading"), null);
const continuousInlineFirstRenderHtml = continuousInlineRoot.innerHTML;
renderReadingMarks(continuousInlineRoot, "所有 `代码` 引用", [continuousInlineMark], () => undefined);
assert.equal(continuousInlineRoot.innerHTML, continuousInlineFirstRenderHtml);
renderReadingMarks(continuousInlineRoot, "所有 `代码` 引用", [], () => undefined);
assert.equal(continuousInlineRoot.innerHTML, continuousInlineOriginalHtml);

const partialCodeDom = new JSDOM('<div id="root"><p><code>abcdef</code></p></div>');
const partialCodeRoot = partialCodeDom.window.document.querySelector("#root");
const partialCodeOriginalHtml = partialCodeRoot.innerHTML;
const partialCodeMark = createMark({
	id: "partial-code",
	selectedText: "cd",
	startOffset: 2,
	endOffset: 4,
	columnStart: 3,
	backgroundColor: "red-light"
});
renderReadingMarks(partialCodeRoot, "abcdef", [partialCodeMark], () => undefined);
const partialCode = partialCodeRoot.querySelector("code");
assert.equal(partialCode.parentElement, partialCodeRoot.querySelector("p"));
assert.equal(partialCode.classList.contains("side-mark-reading-inline-content"), false);
assert.equal(partialCode.querySelector(".side-mark-reading").textContent, "cd");
renderReadingMarks(partialCodeRoot, "abcdef", [], () => undefined);
assert.equal(partialCodeRoot.innerHTML, partialCodeOriginalHtml);

const overlappingCodeDom = new JSDOM('<div id="root"><p><code>abcdef</code></p></div>');
const overlappingCodeRoot = overlappingCodeDom.window.document.querySelector("#root");
const overlappingCodeOriginalHtml = overlappingCodeRoot.innerHTML;
const overlappingCodeBackground = createMark({
	id: "overlapping-code-background",
	selectedText: "abcdef",
	startOffset: 0,
	endOffset: 6,
	backgroundColor: "red-light"
});
const overlappingCodeText = createMark({
	id: "overlapping-code-text",
	selectedText: "cd",
	startOffset: 2,
	endOffset: 4,
	columnStart: 3,
	textColor: "blue",
	backgroundColor: "none"
});
renderReadingMarks(
	overlappingCodeRoot,
	"abcdef",
	[overlappingCodeBackground, overlappingCodeText],
	() => undefined
);
const overlappingCode = overlappingCodeRoot.querySelector("code");
assert.equal(overlappingCode.parentElement.dataset.sideMarkReadingId, "overlapping-code-background");
assert.equal(
	overlappingCode.querySelector('[data-side-mark-reading-id="overlapping-code-text"]').textContent,
	"cd"
);
renderReadingMarks(overlappingCodeRoot, "abcdef", [], () => undefined);
assert.equal(overlappingCodeRoot.innerHTML, overlappingCodeOriginalHtml);

const textOnlyCodeDom = new JSDOM('<div id="root"><p><code>abcdef</code></p></div>');
const textOnlyCodeRoot = textOnlyCodeDom.window.document.querySelector("#root");
const textOnlyCodeMark = createMark({
	id: "text-only-code",
	selectedText: "abcdef",
	startOffset: 0,
	endOffset: 6,
	textColor: "blue",
	backgroundColor: "none"
});
renderReadingMarks(textOnlyCodeRoot, "abcdef", [textOnlyCodeMark], () => undefined);
const textOnlyCode = textOnlyCodeRoot.querySelector("code");
assert.equal(textOnlyCode.parentElement, textOnlyCodeRoot.querySelector("p"));
assert.equal(textOnlyCode.classList.contains("side-mark-reading-inline-content"), false);

const fullOverlapCodeDom = new JSDOM('<div id="root"><p><code>abcdef</code></p></div>');
const fullOverlapCodeRoot = fullOverlapCodeDom.window.document.querySelector("#root");
const fullOverlapTextMark = createMark({
	id: "full-overlap-text",
	selectedText: "abcdef",
	startOffset: 0,
	endOffset: 6,
	textColor: "blue",
	backgroundColor: "none"
});
const fullOverlapBackgroundMark = createMark({
	id: "full-overlap-background",
	selectedText: "abcdef",
	startOffset: 0,
	endOffset: 6,
	backgroundColor: "red-light"
});
renderReadingMarks(
	fullOverlapCodeRoot,
	"abcdef",
	[fullOverlapTextMark, fullOverlapBackgroundMark],
	() => undefined
);
const fullOverlapCode = fullOverlapCodeRoot.querySelector("code");
assert.equal(fullOverlapCode.parentElement.dataset.sideMarkReadingId, "full-overlap-background");
assert.equal(fullOverlapCode.parentElement.parentElement.dataset.sideMarkReadingId, "full-overlap-text");

const fencedCodeDom = new JSDOM('<div id="root"><pre><code>abcdef</code></pre></div>');
const fencedCodeRoot = fencedCodeDom.window.document.querySelector("#root");
const fencedCodeOriginalHtml = fencedCodeRoot.innerHTML;
renderReadingMarks(fencedCodeRoot, "abcdef", [overlappingCodeBackground], () => undefined);
const fencedCode = fencedCodeRoot.querySelector("code");
assert.equal(fencedCode.parentElement, fencedCodeRoot.querySelector("pre"));
assert.equal(fencedCode.classList.contains("side-mark-reading-inline-content"), false);
renderReadingMarks(fencedCodeRoot, "abcdef", [], () => undefined);
assert.equal(fencedCodeRoot.innerHTML, fencedCodeOriginalHtml);

const formattedBlocksDom = new JSDOM('<div id="root"><blockquote><p>A</p>\n<p>B</p></blockquote></div>');
const formattedBlocksRoot = formattedBlocksDom.window.document.querySelector("#root");
const formattedBlocksOriginalHtml = formattedBlocksRoot.innerHTML;
const formattedBlocksMark = createMark({
	id: "formatted-blocks",
	selectedText: "A\nB",
	startOffset: 0,
	endOffset: 3,
	lineEnd: 2,
	backgroundColor: "red-light"
});
renderReadingMarks(formattedBlocksRoot, "A\nB", [formattedBlocksMark], () => undefined);
const formattedBlockquote = formattedBlocksRoot.querySelector("blockquote");
assert.equal(formattedBlockquote.childNodes[1].nodeType, formattedBlocksDom.window.Node.TEXT_NODE);
assert.equal(formattedBlockquote.childNodes[1].textContent, "\n");
renderReadingMarks(formattedBlocksRoot, "A\nB", [], () => undefined);
assert.equal(formattedBlocksRoot.innerHTML, formattedBlocksOriginalHtml);

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

const sameRangeDom = new JSDOM("<div id=\"root\"><p>abcdef</p></div>");
const sameRangeRoot = sameRangeDom.window.document.querySelector("#root");
const earlierSameRange = createMark({
	id: "earlier-same-range",
	selectedText: "cd",
	startOffset: 2,
	endOffset: 4,
	backgroundColor: "blue-light"
});
const laterSameRange = createMark({
	id: "later-same-range",
	selectedText: "cd",
	startOffset: 2,
	endOffset: 4,
	backgroundColor: "purple-light"
});
renderReadingMarks(sameRangeRoot, "abcdef", [earlierSameRange, laterSameRange], () => undefined);
const laterSameRangeWrapper = sameRangeRoot.querySelector(
	"[data-side-mark-reading-id=\"later-same-range\"]"
);
assert.equal(laterSameRangeWrapper.parentElement.dataset.sideMarkReadingId, "earlier-same-range");

const markdownOverlapDom = new JSDOM("<div id=\"root\"><ol><li>abcde</li></ol></div>");
const markdownOverlapRoot = markdownOverlapDom.window.document.querySelector("#root");
const markdownOuterMark = createMark({
	id: "markdown-outer",
	selectedText: "123. abc",
	startOffset: 0,
	endOffset: 8,
	backgroundColor: "red-light"
});
const markdownInnerMark = createMark({
	id: "markdown-inner",
	selectedText: "abcde",
	startOffset: 5,
	endOffset: 10,
	columnStart: 6,
	backgroundColor: "blue-light"
});
const markdownChildMark = createMark({
	id: "markdown-child",
	selectedText: "b",
	startOffset: 6,
	endOffset: 7,
	columnStart: 7,
	backgroundColor: "none"
});
renderReadingMarks(
	markdownOverlapRoot,
	"123. abcde",
	[markdownOuterMark, markdownInnerMark, markdownChildMark],
	() => undefined
);
const markdownChildWrapper = markdownOverlapRoot.querySelector(
	"[data-side-mark-reading-id=\"markdown-child\"]"
);
assert.equal(markdownChildWrapper.parentElement.dataset.sideMarkReadingId, "markdown-inner");
assert.equal(markdownChildWrapper.parentElement.parentElement.dataset.sideMarkReadingId, "markdown-outer");

const clippedSource = "aaaa\nbbbbbbb\ncccc";
const clippedDom = new JSDOM("<div id=\"root\"><p>bbbbbbb</p></div>");
const clippedRoot = clippedDom.window.document.querySelector("#root");
const earlierClippedMark = createMark({
	id: "earlier-clipped",
	selectedText: clippedSource.slice(0, 14),
	startOffset: 0,
	endOffset: 14,
	lineStart: 1,
	lineEnd: 3,
	backgroundColor: "red-light"
});
const laterClippedMark = createMark({
	id: "later-clipped",
	selectedText: clippedSource.slice(2, 16),
	startOffset: 2,
	endOffset: 16,
	lineStart: 1,
	lineEnd: 3,
	columnStart: 3,
	backgroundColor: "blue-light"
});
const clippedChildMark = createMark({
	id: "clipped-child",
	selectedText: clippedSource.slice(7, 8),
	startOffset: 7,
	endOffset: 8,
	lineStart: 2,
	lineEnd: 2,
	columnStart: 3,
	backgroundColor: "none"
});
const clippedMarks = getReadingMarksForSection(
	clippedSource,
	[earlierClippedMark, laterClippedMark, clippedChildMark],
	1,
	1
);
renderReadingMarks(clippedRoot, clippedSource, clippedMarks, () => undefined);
const clippedChildWrapper = clippedRoot.querySelector(
	"[data-side-mark-reading-id=\"clipped-child\"]"
);
assert.equal(clippedChildWrapper.parentElement.dataset.sideMarkReadingId, "earlier-clipped");
assert.equal(clippedChildWrapper.parentElement.parentElement.dataset.sideMarkReadingId, "later-clipped");

const partialStyleSource = "不复用现有 `@CheckPermission`，避免污染现有权限语义";
const partialStyleRenderedText = "不复用现有 @CheckPermission，避免污染现有权限语义";
const partialStyleSelectedText = "，避免污";
const partialStyleStart = partialStyleSource.indexOf(partialStyleSelectedText);
const partialStyleDom = new JSDOM(
	"<div id=\"root\"><p>不复用现有 <code>@CheckPermission</code>，避免污染现有权限语义</p></div>"
);
const partialStyleRoot = partialStyleDom.window.document.querySelector("#root");
const partialStyleOuterMark = createMark({
	id: "partial-style-outer",
	selectedText: partialStyleSource,
	startOffset: 0,
	endOffset: partialStyleSource.length,
	backgroundColor: "red-light"
});
const partialStyleInnerMark = createMark({
	id: "partial-style-inner",
	selectedText: partialStyleSelectedText,
	startOffset: partialStyleStart,
	endOffset: partialStyleStart + partialStyleSelectedText.length,
	columnStart: partialStyleStart + 1,
	textColor: "red",
	backgroundColor: "none"
});
let partialStyleClickCount = 0;
renderReadingMarks(partialStyleRoot, partialStyleSource, [partialStyleOuterMark, partialStyleInnerMark], () => {
	partialStyleClickCount += 1;
});
assert.equal(partialStyleRoot.textContent, partialStyleRenderedText);
const partialStyleOuterWrappers = Array.from(
	partialStyleRoot.querySelectorAll("[data-side-mark-reading-id=\"partial-style-outer\"]")
);
const partialStyleInnerWrapper = partialStyleRoot.querySelector(
	"[data-side-mark-reading-id=\"partial-style-inner\"]"
);
assert.equal(partialStyleOuterWrappers.map((wrapper) => wrapper.textContent).join(""), partialStyleRenderedText);
assert.equal(partialStyleOuterWrappers.some((wrapper) => wrapper.classList.contains("side-mark--text-red")), false);
assert.equal(partialStyleInnerWrapper.classList.contains("side-mark--text-red"), true);
assert.equal(partialStyleInnerWrapper.classList.contains("side-mark--background-none"), true);
assert.equal(partialStyleInnerWrapper.parentElement.dataset.sideMarkReadingId, "partial-style-outer");

const partialStyleSelection = partialStyleDom.window.getSelection();
const partialStyleRange = partialStyleDom.window.document.createRange();
partialStyleRange.selectNodeContents(partialStyleInnerWrapper);
partialStyleSelection.addRange(partialStyleRange);
partialStyleInnerWrapper.dispatchEvent(new partialStyleDom.window.MouseEvent("click", { bubbles: true }));
assert.equal(partialStyleClickCount, 0);

partialStyleSelection.removeAllRanges();
partialStyleInnerWrapper.dispatchEvent(new partialStyleDom.window.MouseEvent("click", { bubbles: true }));
assert.equal(partialStyleClickCount, 1);

console.log("reading view renderer tests passed");
