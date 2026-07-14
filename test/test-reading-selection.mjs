import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import esbuild from "esbuild";
import { JSDOM } from "jsdom";

await mkdir("test/.tmp", { recursive: true });
await esbuild.build({
	entryPoints: ["src/reading-selection.ts"],
	bundle: true,
	format: "esm",
	platform: "browser",
	outfile: "test/.tmp/reading-selection.mjs"
});

const { findSourceRangeForReadingSelection, getReadingSelectionContext } = await import(
	"./.tmp/reading-selection.mjs"
);

const source = [
	"4. **上拍与下单**：审批回调落库逻辑中后即返回；推送履约消息并自治费单行上拍（失败由 MQ 整单重试，支持续跑）→ 至 `placeOrder`（失败由 MQ 重投）",
	"5. **逆向释放**：订单取消/售后再次销售时不改 `holding_item` 状态、不释放规则占用额度，仅触发重新上指；需等",
	"6. **并发安全**：物品操作按 `product_no` 加分布式锁（与 A 匹配引擎同一把锁）；剔除不物理删除；下游契约对齐"
].join("\n");

const selectedText = [
	"逆向释放：订单取消/售后再次销售时不改 holding_item 状态、不释放规则占用额度，仅触发重新上指；需等",
	"并发安全：物品操作按 product_no 加分布式锁（与 A 匹配引擎同一把锁）；剔除不物理删除；下游契约对齐"
].join("\n");

const selectionScope = {
	sourceStartOffset: 0,
	sourceEndOffset: source.length,
	renderedOffset: 0,
	prefix: "至 placeOrder（失败由 MQ 重投）",
	suffix: ""
};
const range = findSourceRangeForReadingSelection(source, selectedText, selectionScope);
assert.ok(range);
assert.equal(source.slice(range.from, range.to), [
	"**逆向释放**：订单取消/售后再次销售时不改 `holding_item` 状态、不释放规则占用额度，仅触发重新上指；需等",
	"6. **并发安全**：物品操作按 `product_no` 加分布式锁（与 A 匹配引擎同一把锁）；剔除不物理删除；下游契约对齐"
].join("\n"));

const numberedSelectedText = [
	"5. 逆向释放：订单取消/售后再次销售时不改 holding_item 状态、不释放规则占用额度，仅触发重新上指；需等",
	"6. 并发安全：物品操作按 product_no 加分布式锁（与 A 匹配引擎同一把锁）；剔除不物理删除；下游契约对齐"
].join("\n");

const numberedRange = findSourceRangeForReadingSelection(source, numberedSelectedText, selectionScope);
assert.ok(numberedRange);
assert.equal(numberedRange.from, range.from);
assert.equal(numberedRange.to, range.to);

const repeatedSource = [
	"并行建议：",
	"- Task 9 依赖 Task 6 的上拍 repository。",
	"",
	"| 接口 | 涉及任务 |",
	"| --- | --- |",
	"| createByOnSaleProduct | Task 6 |"
].join("\n");
const listStart = repeatedSource.indexOf("- Task 9");
const listEnd = repeatedSource.indexOf("\n\n");
const listTask = repeatedSource.indexOf("Task 6", listStart);
const listRange = findSourceRangeForReadingSelection(repeatedSource, "Task 6", {
	sourceStartOffset: listStart,
	sourceEndOffset: listEnd,
	renderedOffset: 13,
	prefix: "Task 9 依赖 ",
	suffix: " 的上拍 repository。"
});
assert.deepEqual(listRange, { from: listTask, to: listTask + "Task 6".length });

const wholeSectionSource = "Task 6";
assert.deepEqual(findSourceRangeForReadingSelection(wholeSectionSource, wholeSectionSource, {
	sourceStartOffset: 0,
	sourceEndOffset: wholeSectionSource.length,
	renderedOffset: 0,
	prefix: "",
	suffix: ""
}), { from: 0, to: wholeSectionSource.length });

const distinctContextSource = "第一处 Task 6 前文。第二处 Task 6 后文。";
const secondTask = distinctContextSource.lastIndexOf("Task 6");
assert.deepEqual(findSourceRangeForReadingSelection(distinctContextSource, "Task 6", {
	sourceStartOffset: 0,
	sourceEndOffset: distinctContextSource.length,
	renderedOffset: secondTask,
	prefix: "第二处 ",
	suffix: " 后文。"
}), { from: secondTask, to: secondTask + "Task 6".length });

const ambiguousSource = "同段 Task 6 相同。同段 Task 6 相同。";
assert.equal(findSourceRangeForReadingSelection(ambiguousSource, "Task 6", {
	sourceStartOffset: 0,
	sourceEndOffset: ambiguousSource.length,
	renderedOffset: 0,
	prefix: "同段 ",
	suffix: " 相同。"
}), null);

const dom = new JSDOM('<div id="section"><p>前文 Task 6 后文</p></div>');
const section = dom.window.document.querySelector("#section");
const text = section.querySelector("p").firstChild;
const domRange = dom.window.document.createRange();
domRange.setStart(text, 3);
domRange.setEnd(text, 9);
assert.deepEqual(getReadingSelectionContext([section], domRange), {
	renderedOffset: 2,
	prefix: "前文",
	suffix: "后文"
});

const listSource = [
	"## 目标 测试一下",
	"",
	"5. 前项",
	"6. **并发安全**：物品操作按 product_no 加分布式锁（与 A 匹配引擎同一把锁）；剔除不物理删除；下游契约对齐"
].join("\n");
const listDom = new JSDOM([
	'<div id="section">',
	'<h2>目标 测试一下</h2>',
	'<ol start="5">',
	'<li>前项</li>',
	'<li id="target"><strong>并发安全</strong>：物品操作按 product_no 加分布式锁（与 A 匹配引擎同一把锁）；剔除不物理删除；下游契约对齐</li>',
	'</ol>',
	'</div>'
].join(""));
const listSection = listDom.window.document.querySelector("#section");
const targetItem = listDom.window.document.querySelector("#target");
const strongText = targetItem.querySelector("strong").firstChild;
const trailingText = targetItem.lastChild;
const formattedRange = listDom.window.document.createRange();
formattedRange.setStart(strongText, 0);
formattedRange.setEnd(trailingText, trailingText.data.length);
const formattedContext = getReadingSelectionContext([listSection], formattedRange);
const expectedListStart = listSource.indexOf("**并发安全**");
const expectedListRange = { from: expectedListStart, to: listSource.length };
assert.deepEqual(findSourceRangeForReadingSelection(listSource, formattedRange.toString(), {
	sourceStartOffset: 0,
	sourceEndOffset: listSource.length,
	...formattedContext
}), expectedListRange);

const itemBoundaryRange = listDom.window.document.createRange();
itemBoundaryRange.setStart(targetItem, 0);
itemBoundaryRange.setEnd(targetItem, targetItem.childNodes.length);
const itemBoundaryContext = getReadingSelectionContext([listSection], itemBoundaryRange);
assert.deepEqual(findSourceRangeForReadingSelection(listSource, itemBoundaryRange.toString(), {
	sourceStartOffset: 0,
	sourceEndOffset: listSource.length,
	...itemBoundaryContext
}), expectedListRange);

const tableSource = [
	"| 展示名 | 数据来源 | 对应回收单字段 |",
	"|---|---|---|",
	"| 回收商名称 | `partner_account` 主账号 `name`（`account_type=1`） | `recycle_order.partner_id` |",
	"| 回收商手机号 | `partner_account` 主账号 `phone` | `recycle_order.partner_id` |"
].join("\n");
const tableDom = new JSDOM([
	'<div id="table-section"><table>',
	'<thead><tr><th>展示名</th><th>数据来源</th><th>对应回收单字段</th></tr></thead>',
	'<tbody>',
	'<tr><td>回收商名称</td><td id="reported-cell"><code id="reported-start">partner_account</code> 主账号 ',
	'<code>name</code>（<code>account_type=1</code>）</td>',
	'<td><code>recycle_order.partner_id</code></td></tr>',
	'<tr><td>回收商手机号</td><td><code>partner_account</code> 主账号 <code>phone</code></td>',
	'<td><code id="second-partner-id">recycle_order.partner_id</code></td></tr>',
	'</tbody></table></div>'
].join(""));
const tableSection = tableDom.window.document.querySelector("#table-section");
const reportedCell = tableDom.window.document.querySelector("#reported-cell");
const reportedStart = tableDom.window.document.querySelector("#reported-start").firstChild;
const reportedEnd = reportedCell.lastChild;
const reportedRange = tableDom.window.document.createRange();
reportedRange.setStart(reportedStart, 0);
reportedRange.setEnd(reportedEnd, reportedEnd.data.length);
const reportedContext = getReadingSelectionContext([tableSection], reportedRange);
const reportedSourceRange = findSourceRangeForReadingSelection(tableSource, reportedRange.toString(), {
	sourceStartOffset: 0,
	sourceEndOffset: tableSource.length,
	...reportedContext
});
const reportedSourceStart = tableSource.indexOf("`partner_account`");
const reportedSourceEnd = tableSource.indexOf("）", reportedSourceStart) + 1;
assert.deepEqual(reportedSourceRange, { from: reportedSourceStart, to: reportedSourceEnd });
assert.equal(tableSource.slice(reportedSourceRange.from, reportedSourceRange.to),
	"`partner_account` 主账号 `name`（`account_type=1`）");

const secondPartnerId = tableDom.window.document.querySelector("#second-partner-id").firstChild;
const repeatedRange = tableDom.window.document.createRange();
repeatedRange.setStart(secondPartnerId, 0);
repeatedRange.setEnd(secondPartnerId, secondPartnerId.data.length);
const repeatedContext = getReadingSelectionContext([tableSection], repeatedRange);
const repeatedSourceRange = findSourceRangeForReadingSelection(tableSource, repeatedRange.toString(), {
	sourceStartOffset: 0,
	sourceEndOffset: tableSource.length,
	...repeatedContext
});
const repeatedSourceStart = tableSource.lastIndexOf("`recycle_order.partner_id`");
assert.deepEqual(repeatedSourceRange, {
	from: repeatedSourceStart + 1,
	to: repeatedSourceStart + 1 + "recycle_order.partner_id".length
});

const noOuterSource = [
	"展示名 | 数据来源",
	"--- | :---:",
	"回收商名称 | `partner_account`"
].join("\n");
const noOuterDom = new JSDOM([
	'<div id="no-outer-section"><table>',
	'<thead><tr><th>展示名</th><th>数据来源</th></tr></thead>',
	'<tbody><tr><td>回收商名称</td><td><code id="no-outer-code">partner_account</code></td></tr></tbody>',
	'</table></div>'
].join(""));
const noOuterSection = noOuterDom.window.document.querySelector("#no-outer-section");
const noOuterCode = noOuterDom.window.document.querySelector("#no-outer-code").firstChild;
const noOuterRange = noOuterDom.window.document.createRange();
noOuterRange.setStart(noOuterCode, 0);
noOuterRange.setEnd(noOuterCode, noOuterCode.data.length);
const noOuterContext = getReadingSelectionContext([noOuterSection], noOuterRange);
const noOuterSourceRange = findSourceRangeForReadingSelection(noOuterSource, noOuterRange.toString(), {
	sourceStartOffset: 0,
	sourceEndOffset: noOuterSource.length,
	...noOuterContext
});
const noOuterSourceStart = noOuterSource.indexOf("`partner_account`");
assert.deepEqual(noOuterSourceRange, {
	from: noOuterSourceStart + 1,
	to: noOuterSourceStart + 1 + "partner_account".length
});

const visiblePipeSource = [
	"| 转义 | 代码 |",
	"|---|---|",
	"| A\\|B | `left|right` |"
].join("\n");
const visiblePipeDom = new JSDOM([
	'<div id="visible-pipe-section"><table>',
	'<thead><tr><th>转义</th><th>代码</th></tr></thead>',
	'<tbody><tr><td id="escaped-pipe">A|B</td><td><code id="code-pipe">left|right</code></td></tr></tbody>',
	'</table></div>'
].join(""));
const visiblePipeSection = visiblePipeDom.window.document.querySelector("#visible-pipe-section");
const escapedPipe = visiblePipeDom.window.document.querySelector("#escaped-pipe").firstChild;
const escapedRange = visiblePipeDom.window.document.createRange();
escapedRange.setStart(escapedPipe, 0);
escapedRange.setEnd(escapedPipe, escapedPipe.data.length);
const escapedContext = getReadingSelectionContext([visiblePipeSection], escapedRange);
const escapedSourceRange = findSourceRangeForReadingSelection(visiblePipeSource, escapedRange.toString(), {
	sourceStartOffset: 0,
	sourceEndOffset: visiblePipeSource.length,
	...escapedContext
});
const escapedSourceStart = visiblePipeSource.indexOf("A\\|B");
assert.deepEqual(escapedSourceRange, { from: escapedSourceStart, to: escapedSourceStart + "A\\|B".length });

const codePipe = visiblePipeDom.window.document.querySelector("#code-pipe").firstChild;
const codePipeRange = visiblePipeDom.window.document.createRange();
codePipeRange.setStart(codePipe, 0);
codePipeRange.setEnd(codePipe, codePipe.data.length);
const codePipeContext = getReadingSelectionContext([visiblePipeSection], codePipeRange);
const codePipeSourceRange = findSourceRangeForReadingSelection(visiblePipeSource, codePipeRange.toString(), {
	sourceStartOffset: 0,
	sourceEndOffset: visiblePipeSource.length,
	...codePipeContext
});
const codePipeSourceStart = visiblePipeSource.indexOf("`left|right`");
assert.deepEqual(codePipeSourceRange, {
	from: codePipeSourceStart + 1,
	to: codePipeSourceStart + 1 + "left|right".length
});

const blockquoteTableSource = [
	"> | 字段 | 值 |",
	"> |---|---|",
	"> | 状态 | 留货中 |"
].join("\n");
const blockquoteTableDom = new JSDOM([
	'<div id="blockquote-table-section"><blockquote><table>',
	'<thead><tr><th>字段</th><th>值</th></tr></thead>',
	'<tbody><tr><td id="blockquote-table-target">状态</td><td>留货中</td></tr></tbody>',
	'</table></blockquote></div>'
].join(""));
const blockquoteTableSection = blockquoteTableDom.window.document.querySelector("#blockquote-table-section");
const blockquoteTableTarget = blockquoteTableDom.window.document.querySelector("#blockquote-table-target").firstChild;
const blockquoteTableRange = blockquoteTableDom.window.document.createRange();
blockquoteTableRange.setStart(blockquoteTableTarget, 0);
blockquoteTableRange.setEnd(blockquoteTableTarget, blockquoteTableTarget.data.length);
const blockquoteTableContext = getReadingSelectionContext([blockquoteTableSection], blockquoteTableRange);
const blockquoteTableSourceRange = findSourceRangeForReadingSelection(
	blockquoteTableSource,
	blockquoteTableRange.toString(),
	{
		sourceStartOffset: 0,
		sourceEndOffset: blockquoteTableSource.length,
		...blockquoteTableContext
	}
);
const blockquoteTableSourceStart = blockquoteTableSource.indexOf("状态");
assert.deepEqual(blockquoteTableSourceRange, {
	from: blockquoteTableSourceStart,
	to: blockquoteTableSourceStart + "状态".length
});

const markdownLinkSource = "前文 [显示文本](https://example.com) 后文";
const markdownLinkRange = findDomBackedRange(
	markdownLinkSource,
	'<p>前文 <a id="target">显示文本</a> 后文</p>'
);
const markdownLinkStart = markdownLinkSource.indexOf("显示文本");
assert.deepEqual(markdownLinkRange, {
	from: markdownLinkStart,
	to: markdownLinkStart + "显示文本".length
});

const autolinkSource = "前文 <https://example.com> 后文";
const autolinkRange = findDomBackedRange(
	autolinkSource,
	'<p>前文 <a id="target">https://example.com</a> 后文</p>'
);
const autolinkStart = autolinkSource.indexOf("https://example.com");
assert.deepEqual(autolinkRange, {
	from: autolinkStart,
	to: autolinkStart + "https://example.com".length
});

const escapedPunctuationSource = "前文 \\*字面星号\\* 后文";
const escapedPunctuationRange = findDomBackedRange(
	escapedPunctuationSource,
	'<p>前文 <span id="target">*字面星号*</span> 后文</p>'
);
const escapedPunctuationStart = escapedPunctuationSource.indexOf("\\*");
assert.deepEqual(escapedPunctuationRange, {
	from: escapedPunctuationStart,
	to: escapedPunctuationStart + "\\*字面星号\\*".length
});

const htmlEntitySource = "前文 A &amp; B 后文";
const htmlEntityRange = findDomBackedRange(
	htmlEntitySource,
	'<p>前文 <span id="target">A &amp; B</span> 后文</p>'
);
const htmlEntityStart = htmlEntitySource.indexOf("A &amp; B");
assert.deepEqual(htmlEntityRange, {
	from: htmlEntityStart,
	to: htmlEntityStart + "A &amp; B".length
});

const literalCodeSource = "`\\*literal\\* &amp;` 后文";
const literalCodeDom = new JSDOM(
	'<div id="literal-code-section"><p><code id="literal-code-start">\\*literal\\* &amp;amp;</code> 后文</p></div>'
);
const literalCodeSection = literalCodeDom.window.document.querySelector("#literal-code-section");
const literalCodeStart = literalCodeDom.window.document.querySelector("#literal-code-start").firstChild;
const literalCodeEnd = literalCodeDom.window.document.querySelector("p").lastChild;
const literalCodeRange = literalCodeDom.window.document.createRange();
literalCodeRange.setStart(literalCodeStart, 0);
literalCodeRange.setEnd(literalCodeEnd, literalCodeEnd.data.length);
const literalCodeContext = getReadingSelectionContext([literalCodeSection], literalCodeRange);
assert.deepEqual(findSourceRangeForReadingSelection(literalCodeSource, literalCodeRange.toString(), {
	sourceStartOffset: 0,
	sourceEndOffset: literalCodeSource.length,
	...literalCodeContext
}), { from: 0, to: literalCodeSource.length });

const inlineHtmlSource = "前文 <span>目标</span> 后文";
const inlineHtmlRange = findDomBackedRange(
	inlineHtmlSource,
	'<p>前文 <span id="target">目标</span> 后文</p>'
);
const inlineHtmlStart = inlineHtmlSource.indexOf("目标");
assert.deepEqual(inlineHtmlRange, { from: inlineHtmlStart, to: inlineHtmlStart + "目标".length });

const reportedHeadingsSource = [
	"| 对象 | 处理说明 |",
	"|---|---|",
	"| recyclePartnerPhone | 列表不再返回手机号 |",
	"**前端对接说明**",
	"1. 列表筛选规则。",
	"#### 5.1.2 聚合详情接口变更说明",
	"接口路径：aggregate-detail",
	"| 对象 | 处理说明 |",
	"|---|---|",
	"| businessTags | 追加留货标签 |",
	"**前端对接说明**",
	"1. 未留货时不展示。",
	"#### 5.1.3 导出 V2 接口变更说明"
].join("\n");
const reportedHeadingsHtml = [
	'<table><thead><tr><th>对象</th><th>处理说明</th></tr></thead>',
	'<tbody><tr><td>recyclePartnerPhone</td><td>列表不再返回手机号</td></tr></tbody></table>',
	'<p><strong>前端对接说明</strong></p><ol><li>列表筛选规则。</li></ol>',
	'<h4 id="aggregate-heading">5.1.2 聚合详情接口变更说明</h4><p>接口路径：aggregate-detail</p>',
	'<table><thead><tr><th>对象</th><th>处理说明</th></tr></thead>',
	'<tbody><tr><td>businessTags</td><td>追加留货标签</td></tr></tbody></table>',
	'<p><strong id="second-frontend-note">前端对接说明</strong></p><ol><li>未留货时不展示。</li></ol>',
	'<h4 id="export-heading">5.1.3 导出 V2 接口变更说明</h4>'
].join("");
const secondFrontendRange = findDomBackedRange(
	reportedHeadingsSource,
	reportedHeadingsHtml,
	"#second-frontend-note"
);
const secondFrontendStart = reportedHeadingsSource.lastIndexOf("前端对接说明");
assert.deepEqual(secondFrontendRange, {
	from: secondFrontendStart,
	to: secondFrontendStart + "前端对接说明".length
});
for (const [selector, heading] of [
	["#aggregate-heading", "5.1.2 聚合详情接口变更说明"],
	["#export-heading", "5.1.3 导出 V2 接口变更说明"]
]) {
	const headingRange = findDomBackedRange(reportedHeadingsSource, reportedHeadingsHtml, selector);
	const headingStart = reportedHeadingsSource.indexOf(heading);
	assert.deepEqual(headingRange, { from: headingStart, to: headingStart + heading.length });
}

const incompatibleHeadingSource = "### 3.4 业务标签";
const incompatibleHeadingText = "3.4 业务标签";
const incompatibleHeadingStart = incompatibleHeadingSource.indexOf(incompatibleHeadingText);
assert.deepEqual(findSourceRangeForReadingSelection(incompatibleHeadingSource, incompatibleHeadingText, {
	sourceStartOffset: 0,
	sourceEndOffset: incompatibleHeadingSource.length,
	renderedOffset: 100,
	prefix: "来自更宽 DOM 包装器的前文",
	suffix: "来自更宽 DOM 包装器的后文"
}), {
	from: incompatibleHeadingStart,
	to: incompatibleHeadingStart + incompatibleHeadingText.length
});

for (const artifact of ["\u200B", "\u200C", "\u200D", "\uFEFF"]) {
	assert.deepEqual(findSourceRangeForReadingSelection(
		"### 4.1 方案概览",
		`${artifact}4.1 方案概览`,
		{
			sourceStartOffset: 0,
			sourceEndOffset: "### 4.1 方案概览".length,
			renderedOffset: 100,
			prefix: "不匹配前文",
			suffix: "不匹配后文"
		}
	), { from: 4, to: "### 4.1 方案概览".length });
}

const artifactTableSource = [
	"| 项目 | 改造点 |",
	"|---|---|",
	"| pjt-partner-api | 无模型入参变更；导出结果随 titans `FixedSheetWriter` 调整 |"
].join("\n");
const artifactTableSelection = "无模型入参变更；导出结果随 titans FixedSheetWriter 调整\uFFFC";
const artifactTableStart = artifactTableSource.indexOf("无模型入参变更");
const artifactTableEnd = artifactTableSource.indexOf(" 调整", artifactTableStart) + " 调整".length;
assert.deepEqual(findSourceRangeForReadingSelection(artifactTableSource, artifactTableSelection, {
	sourceStartOffset: 0,
	sourceEndOffset: artifactTableSource.length,
	renderedOffset: 0,
	prefix: "",
	suffix: ""
}), { from: artifactTableStart, to: artifactTableEnd });

const indistinguishableHeadingsSource = "### 相同标题\n\n### 相同标题";
assert.equal(findSourceRangeForReadingSelection(indistinguishableHeadingsSource, "相同标题", {
	sourceStartOffset: 0,
	sourceEndOffset: indistinguishableHeadingsSource.length,
	renderedOffset: 0,
	prefix: "",
	suffix: ""
}), null);
assert.equal(findSourceRangeForReadingSelection(indistinguishableHeadingsSource, "\u200B相同标题", {
	sourceStartOffset: 0,
	sourceEndOffset: indistinguishableHeadingsSource.length,
	renderedOffset: 0,
	prefix: "",
	suffix: ""
}), null);

const distantUniqueSource = "**目**标";
assert.equal(findSourceRangeForReadingSelection(distantUniqueSource, "目标", {
	sourceStartOffset: 0,
	sourceEndOffset: distantUniqueSource.length,
	renderedOffset: 100,
	prefix: "完全不同",
	suffix: "也不相同"
}), null);

const mixedFormatSource = "**foo** bar 结束。后面 foo bar";
const mixedFormatRange = findSourceRangeForReadingSelection(mixedFormatSource, "foo bar", {
	sourceStartOffset: 0,
	sourceEndOffset: mixedFormatSource.length,
	renderedOffset: 0,
	prefix: "",
	suffix: " 结束。后面 foo bar"
});
assert.deepEqual(mixedFormatRange, { from: 0, to: "**foo** bar".length });

const duplicateCandidateSource = "前文 **foo** 后文";
const duplicateCandidateStart = duplicateCandidateSource.indexOf("foo");
assert.deepEqual(findSourceRangeForReadingSelection(duplicateCandidateSource, "foo", {
	sourceStartOffset: 0,
	sourceEndOffset: duplicateCandidateSource.length,
	renderedOffset: 2,
	prefix: "前文 ",
	suffix: " 后文"
}), { from: duplicateCandidateStart, to: duplicateCandidateStart + "foo".length });

function findDomBackedRange(source, html, selector = "#target") {
	const dom = new JSDOM(`<div id="section">${html}</div>`);
	const section = dom.window.document.querySelector("#section");
	const target = dom.window.document.querySelector(selector).firstChild;
	const range = dom.window.document.createRange();
	range.setStart(target, 0);
	range.setEnd(target, target.data.length);
	const context = getReadingSelectionContext([section], range);
	return findSourceRangeForReadingSelection(source, range.toString(), {
		sourceStartOffset: 0,
		sourceEndOffset: source.length,
		...context
	});
}

console.log("reading selection tests passed");
