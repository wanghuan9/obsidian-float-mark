import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import esbuild from "esbuild";

await mkdir("test/.tmp", { recursive: true });
await esbuild.build({
	entryPoints: ["src/reading-selection.ts"],
	bundle: true,
	format: "esm",
	platform: "browser",
	outfile: "test/.tmp/reading-selection.mjs"
});

const { findSourceRangeForReadingSelection } = await import("./.tmp/reading-selection.mjs");

const source = [
	"4. **上拍与下单**：审批回调落库逻辑中后即返回；推送履约消息并自治费单行上拍（失败由 MQ 整单重试，支持续跑）→ 至 `placeOrder`（失败由 MQ 重投）",
	"5. **逆向释放**：订单取消/售后再次销售时不改 `holding_item` 状态、不释放规则占用额度，仅触发重新上指；需等",
	"6. **并发安全**：物品操作按 `product_no` 加分布式锁（与 A 匹配引擎同一把锁）；剔除不物理删除；下游契约对齐"
].join("\n");

const selectedText = [
	"逆向释放：订单取消/售后再次销售时不改 holding_item 状态、不释放规则占用额度，仅触发重新上指；需等",
	"并发安全：物品操作按 product_no 加分布式锁（与 A 匹配引擎同一把锁）；剔除不物理删除；下游契约对齐"
].join("\n");

const range = findSourceRangeForReadingSelection(source, selectedText);
assert.ok(range);
assert.equal(source.slice(range.from, range.to), [
	"**逆向释放**：订单取消/售后再次销售时不改 `holding_item` 状态、不释放规则占用额度，仅触发重新上指；需等",
	"6. **并发安全**：物品操作按 `product_no` 加分布式锁（与 A 匹配引擎同一把锁）；剔除不物理删除；下游契约对齐"
].join("\n"));

const numberedSelectedText = [
	"5. 逆向释放：订单取消/售后再次销售时不改 holding_item 状态、不释放规则占用额度，仅触发重新上指；需等",
	"6. 并发安全：物品操作按 product_no 加分布式锁（与 A 匹配引擎同一把锁）；剔除不物理删除；下游契约对齐"
].join("\n");

const numberedRange = findSourceRangeForReadingSelection(source, numberedSelectedText);
assert.ok(numberedRange);
assert.equal(numberedRange.from, range.from);
assert.equal(numberedRange.to, range.to);

const repeatedSource = "重复内容\n\n重复内容";
const repeatedRange = findSourceRangeForReadingSelection(repeatedSource, "重复内容", 4);
assert.ok(repeatedRange);
assert.equal(repeatedRange.from, repeatedSource.lastIndexOf("重复内容"));

console.log("reading selection tests passed");
