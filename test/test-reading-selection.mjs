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

console.log("reading selection tests passed");
