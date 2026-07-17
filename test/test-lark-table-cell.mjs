import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import esbuild from "esbuild";

await mkdir("test/.tmp", { recursive: true });
await esbuild.build({
	entryPoints: ["src/lark-table-cell.ts"],
	bundle: true,
	format: "esm",
	platform: "node",
	outfile: "test/.tmp/lark-table-cell.mjs"
});

const { buildLarkTableFetchArgs, findMarkdownTableCellCoordinate, findRemoteTableCellBlockId } = await import(
	"./.tmp/lark-table-cell.mjs"
);

assert.deepEqual(buildLarkTableFetchArgs("doc-token", "table-block"), [
	"docs", "+fetch", "--as", "user", "--doc", "doc-token",
	"--scope", "range", "--start-block-id", "table-block", "--end-block-id", "table-block",
	"--detail", "with-ids", "--format", "json"
]);

const source = [
	"| 测试数据 | 测试数据 | 测试数据 |",
	"|---|---|---|",
	"| 测试数据 | 测试数据 | 测试数据 |",
	"| 测试数据 | 测试数据 | 测试数据 |"
].join("\n");
const targetLineStart = source.lastIndexOf("\n") + 1;
const firstTarget = source.indexOf("测试数据", targetLineStart);
const secondTarget = source.indexOf("测试数据", firstTarget + "测试数据".length);
assert.deepEqual(
	findMarkdownTableCellCoordinate(source, secondTarget, secondTarget + "测试数据".length),
	{ rowIndex: 2, cellIndex: 1 }
);

const xml = [
	'<fragment><table id="table-block"><thead><tr>',
	'<th><p id="header-0">测试数据</p></th>',
	'<th><p id="header-1">测试数据</p></th>',
	'<th><p id="header-2">测试数据</p></th>',
	'</tr></thead><tbody>',
	'<tr><td><p id="row-1-0">测试数据</p></td><td><p id="row-1-1">测试数据</p></td><td><p id="row-1-2">测试数据</p></td></tr>',
	'<tr><td><p id="row-2-0">测试数据</p></td><td><p id="row-2-1">测试数据</p></td><td><p id="row-2-2">测试数据</p></td></tr>',
	'</tbody></table></fragment>'
].join("");
assert.equal(findRemoteTableCellBlockId(xml, 2, 1), "row-2-1");
assert.equal(findRemoteTableCellBlockId(xml, 3, 0), null);

console.log("lark table cell tests passed");
