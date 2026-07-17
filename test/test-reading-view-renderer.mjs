import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
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
	getReadingMarkElements,
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
	kind = "highlight",
	color = "green",
	textColor = "default",
	backgroundColor = "red-light",
	noteContent = "",
	prefix = "",
	suffix = ""
} = {}) {
	return {
		id,
		filePath: "note.md",
		anchor: {
			startOffset,
			endOffset,
			selectedText,
			prefix,
			suffix,
			position: {
				lineStart,
				lineEnd,
				columnStart,
				columnEnd: 1
			}
		},
		mark: {
			kind,
			color,
			textColor,
			backgroundColor
		},
		note: {
			content: noteContent,
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

const duplicateSource = "- 第一个 Task 6\n\n| 第二个 Task 6 |";
const tableStart = duplicateSource.indexOf("| 第二个");
const tableTask = duplicateSource.lastIndexOf("Task 6");
const duplicateMark = createMark({
	id: "table-task-6",
	selectedText: "Task 6",
	startOffset: tableTask,
	endOffset: tableTask + 6,
	lineStart: 3
});
assert.equal(getReadingMarksForSection(duplicateSource, [duplicateMark], 0, 0).length, 0);
assert.equal(getReadingMarksForSection(duplicateSource, [duplicateMark], 2, 2).length, 1);
assert.ok(tableStart < tableTask);

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

const groupedMarkDom = new JSDOM(`
	<div class="markdown-preview-view" id="preview">
		<p id="first">first</p>
		<p id="second">second</p>
	</div>
`);
const groupedMarkPreview = groupedMarkDom.window.document.querySelector("#preview");
const groupedMarkFirst = groupedMarkDom.window.document.querySelector("#first");
const groupedMarkSecond = groupedMarkDom.window.document.querySelector("#second");
renderReadingMarks(groupedMarkFirst, "first", [createMark({
	id: "grouped-mark",
	selectedText: "first"
})], () => undefined);
renderReadingMarks(groupedMarkSecond, "second", [createMark({
	id: "grouped-mark",
	selectedText: "second"
})], () => undefined);
assert.equal(getReadingMarkElements(groupedMarkPreview, "grouped-mark").length, 2);

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

const commentSource = [
	"**后台查询字段来源**：",
	"",
	"- 主账号名称：`partner_account.name`（`WHERE account_type=1`）",
	"- 主账号手机号：`partner_account.phone`（`WHERE account_type=1`）",
	"- 主账号创建时间：`pjt_partner_info.create_dt"
].join("\n");
const commentRenderedText = [
	"后台查询字段来源：",
	"主账号名称：partner_account.name（WHERE account_type=1）",
	"主账号手机号：partner_account.phone（WHERE account_type=1）",
	"主账号创建时间：pjt_partner_info.create_dt"
].join("\n");
const commentDom = new JSDOM(`
	<div id="root"><p><strong>后台查询字段来源</strong>：</p><ul><li>主账号名称：<code>partner_account.name</code>（<code>WHERE account_type=1</code>）</li><li>主账号手机号：<code>partner_account.phone</code>（<code>WHERE account_type=1</code>）</li><li>主账号创建时间：<code>pjt_partner_info.create_dt</code></li></ul></div>
`);
const commentRoot = commentDom.window.document.querySelector("#root");
const commentOriginalHtml = commentRoot.innerHTML;
const commentMark = createMark({
	id: "continuous-comment",
	selectedText: commentSource,
	startOffset: 3795,
	endOffset: 3959,
	lineStart: 121,
	lineEnd: 125,
	kind: "comment",
	color: "yellow",
	backgroundColor: "none",
	noteContent: "22",
	prefix: "hone` 不再下沉到此表，改为存入 `partner_account`。\n\n\n",
	suffix: "`\n\n### 6.2.4 统一账号表（partner_account）"
});
assert.deepEqual(findReadingMatchForTest(commentRenderedText, commentMark), {
	start: 0,
	end: commentRenderedText.length
});
renderReadingMarks(commentRoot, commentSource, [commentMark], () => undefined);
const commentWrappers = Array.from(
	commentRoot.querySelectorAll('[data-side-mark-reading-id="continuous-comment"]')
);
assert.equal(commentWrappers.map((wrapper) => wrapper.textContent).join(""), commentRoot.textContent);
assert.equal(commentWrappers.every((wrapper) => wrapper.classList.contains("side-mark--comment")), true);
for (const code of commentRoot.querySelectorAll("code")) {
	assert.equal(code.parentElement.dataset.sideMarkReadingId, "continuous-comment");
	assert.equal(code.classList.contains("side-mark-reading-inline-content"), true);
}
const commentFirstRenderHtml = commentRoot.innerHTML;
renderReadingMarks(commentRoot, commentSource, [commentMark], () => undefined);
assert.equal(commentRoot.innerHTML, commentFirstRenderHtml);
renderReadingMarks(commentRoot, commentSource, [], () => undefined);
assert.equal(commentRoot.innerHTML, commentOriginalHtml);

const escapedLiteralAndPartialCodeMark = createMark({
	id: "escaped-literal-partial-code",
	selectedText: "\\`literal and `partial",
	startOffset: 0,
	endOffset: 22,
	suffix: "`"
});
assert.deepEqual(findReadingMatchForTest("`literal and partial", escapedLiteralAndPartialCodeMark), {
	start: 0,
	end: 20
});
const evenBackslashesAndPartialCodeMark = createMark({
	id: "even-backslashes-partial-code",
	selectedText: "\\\\`partial",
	startOffset: 0,
	endOffset: 10,
	suffix: "`"
});
assert.deepEqual(findReadingMatchForTest("\\partial", evenBackslashesAndPartialCodeMark), {
	start: 0,
	end: 8
});
const oddBackslashesAndLiteralTickMark = createMark({
	id: "odd-backslashes-literal-tick",
	selectedText: "\\\\\\`literal",
	startOffset: 0,
	endOffset: 11,
	suffix: "`"
});
assert.deepEqual(findReadingMatchForTest("\\`literal", oddBackslashesAndLiteralTickMark), {
	start: 0,
	end: 9
});
const escapedTickBeforeCodeSpanMark = createMark({
	id: "escaped-tick-before-code-span",
	selectedText: "\\``code`",
	startOffset: 0,
	endOffset: 8
});
assert.deepEqual(findReadingMatchForTest("`code", escapedTickBeforeCodeSpanMark), {
	start: 0,
	end: 5
});
const mixedTickRunsWithSuffixBoundaryMark = createMark({
	id: "mixed-tick-runs-suffix-boundary",
	selectedText: "value ` literal and ``partial",
	startOffset: 0,
	endOffset: 29,
	suffix: "``"
});
assert.deepEqual(
	findReadingMatchForTest("value ` literal and partial", mixedTickRunsWithSuffixBoundaryMark),
	{ start: 0, end: 27 }
);
const mixedTickRunsWithPrefixBoundaryMark = createMark({
	id: "mixed-tick-runs-prefix-boundary",
	selectedText: "partial`` and value ` literal",
	startOffset: 0,
	endOffset: 29,
	prefix: "``"
});
assert.deepEqual(
	findReadingMatchForTest("partial and value ` literal", mixedTickRunsWithPrefixBoundaryMark),
	{ start: 0, end: 27 }
);
const sameLengthTickRunsWithPrefixBoundaryMark = createMark({
	id: "same-length-tick-runs-prefix-boundary",
	selectedText: "partial` and value ` literal",
	startOffset: 0,
	endOffset: 28,
	prefix: "`"
});
assert.deepEqual(
	findReadingMatchForTest("partial and value ` literal", sameLengthTickRunsWithPrefixBoundaryMark),
	{ start: 0, end: 27 }
);
const backslashBeforePrefixClosingRunMark = createMark({
	id: "backslash-before-prefix-closing-run",
	selectedText: "partial\\` and literal",
	startOffset: 0,
	endOffset: 21,
	prefix: "`"
});
assert.deepEqual(
	findReadingMatchForTest("partial\\ and literal", backslashBeforePrefixClosingRunMark),
	{ start: 0, end: 20 }
);
const prefixAndSuffixBoundaryMark = createMark({
	id: "prefix-and-suffix-boundary",
	selectedText: "left` middle `right",
	startOffset: 0,
	endOffset: 19,
	prefix: "`",
	suffix: "`"
});
assert.deepEqual(findReadingMatchForTest("left middle right", prefixAndSuffixBoundaryMark), {
	start: 0,
	end: 17
});
const mismatchedBoundaryRunMark = createMark({
	id: "mismatched-boundary-run",
	selectedText: "value ` literal",
	startOffset: 0,
	endOffset: 15,
	suffix: "``"
});
assert.equal(findReadingMatchForTest("value  literal", mismatchedBoundaryRunMark), null);
const doubleCodeMark = createMark({
	id: "double-code",
	selectedText: "``code ` tick``",
	startOffset: 0,
	endOffset: 15
});
assert.deepEqual(findReadingMatchForTest("code ` tick", doubleCodeMark), { start: 0, end: 11 });
const markdownLiteralInCompleteCodeMark = createMark({
	id: "markdown-literal-complete-code",
	selectedText: "`**code**`",
	startOffset: 0,
	endOffset: 10
});
assert.deepEqual(findReadingMatchForTest("**code**", markdownLiteralInCompleteCodeMark), {
	start: 0,
	end: 8
});
const placeholderCollisionMark = createMark({
	id: "placeholder-collision",
	selectedText: "`x` \uE000**0**\uE001",
	startOffset: 0,
	endOffset: 11
});
assert.deepEqual(findReadingMatchForTest("x \uE0000\uE001", placeholderCollisionMark), {
	start: 0,
	end: 5
});
const markdownLiteralInSuffixCodeMark = createMark({
	id: "markdown-literal-suffix-code",
	selectedText: "`**code**",
	startOffset: 0,
	endOffset: 9,
	suffix: "`"
});
assert.deepEqual(findReadingMatchForTest("**code**", markdownLiteralInSuffixCodeMark), {
	start: 0,
	end: 8
});
const markdownLiteralInPrefixCodeMark = createMark({
	id: "markdown-literal-prefix-code",
	selectedText: "_code_`",
	startOffset: 0,
	endOffset: 7,
	prefix: "`"
});
assert.deepEqual(findReadingMatchForTest("_code_", markdownLiteralInPrefixCodeMark), {
	start: 0,
	end: 6
});
const visibleUnpairedTickMark = createMark({
	id: "visible-unpaired-tick",
	selectedText: "value ` literal",
	startOffset: 0,
	endOffset: 15
});
assert.equal(findReadingMatchForTest("value  literal", visibleUnpairedTickMark), null);

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

const partialCommentCodeDom = new JSDOM('<div id="root"><p><code>abcdef</code></p></div>');
const partialCommentCodeRoot = partialCommentCodeDom.window.document.querySelector("#root");
const partialCommentMark = createMark({
	id: "partial-comment-code",
	selectedText: "cd",
	startOffset: 2,
	endOffset: 4,
	columnStart: 3,
	kind: "comment",
	color: "yellow",
	backgroundColor: "none",
	noteContent: "comment"
});
renderReadingMarks(partialCommentCodeRoot, "abcdef", [partialCommentMark], () => undefined);
const partialCommentCode = partialCommentCodeRoot.querySelector("code");
assert.equal(partialCommentCode.parentElement, partialCommentCodeRoot.querySelector("p"));
assert.equal(partialCommentCode.classList.contains("side-mark-reading-inline-content"), false);
assert.equal(partialCommentCode.querySelector(".side-mark--comment").textContent, "cd");

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

const repeatedTableSource = [
	"| 测试数据 | 测试数据 | 测试数据 |",
	"| --- | --- | --- |",
	"| 测试数据 | 测试数据 | 测试数据 |"
].join("\n");
const repeatedTableDom = new JSDOM([
	"<table id=\"root\">",
	"<thead><tr><th>测试数据</th><th>测试数据</th><th>测试数据</th></tr></thead>",
	"<tbody><tr><td>测试数据</td><td>测试数据</td><td>测试数据</td></tr></tbody>",
	"</table>"
].join(""));
const repeatedTableRoot = repeatedTableDom.window.document.querySelector("#root");
const repeatedTableMarkStart = repeatedTableSource.lastIndexOf("\n") + 3;
const repeatedTableMark = createMark({
	id: "repeated-table-bottom-left",
	selectedText: "测试数据",
	startOffset: repeatedTableMarkStart,
	endOffset: repeatedTableMarkStart + "测试数据".length,
	lineStart: 3,
	columnStart: 3,
	prefix: repeatedTableSource.slice(Math.max(0, repeatedTableMarkStart - 40), repeatedTableMarkStart),
	suffix: repeatedTableSource.slice(repeatedTableMarkStart + "测试数据".length, repeatedTableMarkStart + "测试数据".length + 40)
});
renderReadingMarks(repeatedTableRoot, repeatedTableSource, [repeatedTableMark], () => undefined, {
	tableSourceRange: { from: 0, to: repeatedTableSource.length }
});
assert.equal(
	repeatedTableRoot.rows[1]?.cells[0]?.querySelector('[data-side-mark-reading-id="repeated-table-bottom-left"]')?.textContent,
	"测试数据"
);
assert.equal(
	repeatedTableRoot.rows[0]?.cells[2]?.querySelector('[data-side-mark-reading-id="repeated-table-bottom-left"]'),
	null
);
const repeatedTableStarts = [];
let repeatedTableSearchFrom = 0;
while (repeatedTableSearchFrom < repeatedTableSource.length) {
	const start = repeatedTableSource.indexOf("测试数据", repeatedTableSearchFrom);
	if (start < 0) {
		break;
	}
	repeatedTableStarts.push(start);
	repeatedTableSearchFrom = start + "测试数据".length;
}
const repeatedTableMarks = repeatedTableStarts.map((start, index) => createMark({
	id: `repeated-table-${index}`,
	selectedText: "测试数据",
	startOffset: start,
	endOffset: start + "测试数据".length
}));
renderReadingMarks(repeatedTableRoot, repeatedTableSource, repeatedTableMarks, () => undefined, {
	tableSourceRange: { from: 0, to: repeatedTableSource.length }
});
for (let rowIndex = 0; rowIndex < 2; rowIndex += 1) {
	for (let cellIndex = 0; cellIndex < 3; cellIndex += 1) {
		const markId = `repeated-table-${rowIndex * 3 + cellIndex}`;
		assert.equal(
			repeatedTableRoot.rows[rowIndex]?.cells[cellIndex]?.querySelector(`[data-side-mark-reading-id="${markId}"]`)?.textContent,
			"测试数据"
		);
		assert.equal(repeatedTableRoot.querySelectorAll(`[data-side-mark-reading-id="${markId}"]`).length, 1);
	}
}

const crossCellSource = [
	"| 左列 | 右列 |",
	"| --- | --- |",
	"| 左侧文本 | 右侧文本 |"
].join("\n");
const crossCellDom = new JSDOM([
	"<table id=\"root\">",
	"<thead><tr><th>左列</th><th>右列</th></tr></thead>",
	"<tbody><tr><td>左侧文本</td><td>右侧文本</td></tr></tbody>",
	"</table>"
].join(""));
const crossCellRoot = crossCellDom.window.document.querySelector("#root");
const crossCellStart = crossCellSource.indexOf("侧文本");
const crossCellEnd = crossCellSource.indexOf("右侧文本") + "右侧".length;
const crossCellMark = createMark({
	id: "cross-cell",
	selectedText: crossCellSource.slice(crossCellStart, crossCellEnd),
	startOffset: crossCellStart,
	endOffset: crossCellEnd,
	lineStart: 3,
	lineEnd: 3
});
renderReadingMarks(crossCellRoot, crossCellSource, [crossCellMark], () => undefined, {
	tableSourceRange: { from: 0, to: crossCellSource.length }
});
assert.deepEqual(
	Array.from(crossCellRoot.querySelectorAll('[data-side-mark-reading-id="cross-cell"]')).map((element) => element.textContent),
	["侧文本", "右侧"]
);

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

const readingRendererSource = await readFile("src/reading-view-renderer.ts", "utf8");
const stylesSource = await readFile("styles.css", "utf8");
assert.doesNotMatch(
	readingRendererSource,
	/READING_MARK_GROUP_HOVER_CLASS|readingMarkFeedbackRoots|hoveredReadingMarkIds|ensureReadingMarkGroupFeedback|setHoveredReadingMarkGroup|applyHoveredReadingMarkGroup/
);
assert.doesNotMatch(stylesSource, /\.side-mark-reading\.is-group-hovered/);
assert.match(
	stylesSource,
	/\.side-mark-reading\.side-mark-reading-continuous-paint\s*\{\s*border-radius:\s*0;\s*\}/
);

console.log("reading view renderer tests passed");
