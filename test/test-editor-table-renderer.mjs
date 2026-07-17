import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { EditorState } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import esbuild from "esbuild";
import { JSDOM } from "jsdom";

await mkdir("test/.tmp", { recursive: true });
await esbuild.build({
	entryPoints: ["src/editor-table-renderer.ts"],
	bundle: true,
	external: ["@codemirror/state", "@codemirror/view"],
	format: "esm",
	platform: "browser",
	outfile: "test/.tmp/editor-table-renderer.mjs"
});

const dom = new JSDOM('<div id="editor"></div>', { pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);

const {
	EditorTableMarkRenderer,
	findCellSourceRangeForTest,
	renderEditorTableMarks
} = await import("./.tmp/editor-table-renderer.mjs");

const source = [
	"Before",
	"",
	"|  | 核心规则 |",
	"| --- | --- |",
	"| 可从 | **上拍** `placeOrder` 可从失败继续 |",
	"| R6 | 可从 查询接口 跨行开始 |",
	"| R7 | 跨行结束 |",
	"",
	"After"
].join("\n");
const tableStart = source.indexOf("|  |");
const tableEnd = source.indexOf("\n\nAfter");

class TableWidget extends WidgetType {
	toDOM() {
		const host = document.createElement("div");
		host.className = "cm-embed-block cm-table-widget markdown-rendered";
		host.setAttribute("contenteditable", "false");
		const wrapper = document.createElement("div");
		wrapper.className = "table-wrapper";
		host.append(wrapper);
		const table = document.createElement("table");
		table.className = "table-editor";
		table.innerHTML = [
			"<thead><tr><th></th><th>核心规则</th></tr></thead>",
			"<tbody>",
			"<tr><td>可从</td><td><strong>上拍</strong> <code>placeOrder</code> 可从失败继续</td></tr>",
			"<tr><td>R6</td><td>可从 查询接口 跨行开始</td></tr>",
			"<tr><td>R7</td><td>跨行结束</td></tr>",
			"</tbody>"
		].join("");
		wrapper.append(table);
		return host;
	}
}

function createMark({
	id,
	selectedText,
	startOffset = source.indexOf(selectedText),
	endOffset = startOffset + selectedText.length,
	textColor = "default",
	backgroundColor = "none",
	kind = "highlight",
	color = "yellow"
}) {
	const startPrefix = source.slice(0, startOffset);
	const endPrefix = source.slice(0, endOffset);
	const startLines = startPrefix.split("\n");
	const endLines = endPrefix.split("\n");
	return {
		id,
		filePath: "note.md",
		anchor: {
			startOffset,
			endOffset,
			selectedText: source.slice(startOffset, endOffset),
			prefix: source.slice(Math.max(0, startOffset - 40), startOffset),
			suffix: source.slice(endOffset, endOffset + 40),
			position: {
				lineStart: startLines.length,
				lineEnd: endLines.length,
				columnStart: (startLines.at(-1)?.length || 0) + 1,
				columnEnd: (endLines.at(-1)?.length || 0) + 1
			}
		},
		mark: { kind, color, textColor, backgroundColor },
		note: { content: "", createdAt: "", updatedAt: "" },
		replies: [],
		status: "active"
	};
}

function activateCell(table, rowIndex, cellIndex, cellSource) {
	const cell = table.rows[rowIndex]?.cells[cellIndex];
	assert.ok(cell);
	cell.replaceChildren();
	cell.classList.add("mod-active-row-handle");
	const wrapper = document.createElement("div");
	wrapper.className = "table-cell-wrapper";
	cell.append(wrapper);
	const cellView = new EditorView({
		state: EditorState.create({ doc: cellSource }),
		parent: wrapper
	});
	return { cell, cellView };
}

function restoreCell(cell, html) {
	cell.classList.remove("mod-active-row-handle");
	cell.innerHTML = html;
}

const cellStart = source.indexOf("**上拍**");
const cellEnd = source.indexOf(" |", cellStart);
const crossActiveStart = source.indexOf("可从", source.indexOf("| 可从 |"));
const selectedPlainStart = source.indexOf("可从", cellStart);
const marks = [
	createMark({
		id: "cross-active-cell",
		selectedText: source.slice(crossActiveStart, cellEnd),
		startOffset: crossActiveStart,
		endOffset: cellEnd,
		backgroundColor: "blue-light"
	}),
	createMark({
		id: "cell-background",
		selectedText: source.slice(cellStart, cellEnd),
		startOffset: cellStart,
		endOffset: cellEnd,
		backgroundColor: "red-light"
	}),
	createMark({ id: "bold", selectedText: "**上拍**", textColor: "green" }),
	createMark({ id: "code", selectedText: "`placeOrder`", textColor: "purple" }),
	createMark({
		id: "plain",
		selectedText: "可从",
		startOffset: selectedPlainStart,
		endOffset: selectedPlainStart + "可从".length,
		textColor: "blue"
	}),
	createMark({ id: "comment", selectedText: "查询接口", kind: "comment", color: "orange" })
];

const tableDecoration = Decoration.replace({ widget: new TableWidget(), block: true }).range(tableStart, tableEnd);
const state = EditorState.create({
	doc: source,
	extensions: [EditorView.decorations.of(Decoration.set([tableDecoration]))]
});
const view = new EditorView({ state, parent: document.querySelector("#editor") });
const lineStarts = [0];
for (let index = 0; index < source.length; index += 1) {
	if (source[index] === "\n") {
		lineStarts.push(index + 1);
	}
}
const escapedPipeSource = [
	"| 功能 | 核心规则 |",
	"| --- | --- |",
	"| R1 | 左侧 \\| 右侧 |"
].join("\n");
const escapedCellSource = "左侧 \\| 右侧";
const escapedCellStart = escapedPipeSource.indexOf(escapedCellSource);
assert.deepEqual(
	findCellSourceRangeForTest(
		escapedPipeSource,
		{ from: 0, to: escapedPipeSource.length },
		1,
		1,
		escapedCellSource
	),
	{ from: escapedCellStart, to: escapedCellStart + escapedCellSource.length }
);
const inlinePipeSource = [
	"| 功能 | 核心规则 |",
	"| --- | --- |",
	"| R1 | `a|b` 后续 |"
].join("\n");
const inlinePipeCellSource = "`a|b` 后续";
const inlinePipeCellStart = inlinePipeSource.indexOf(inlinePipeCellSource);
assert.deepEqual(
	findCellSourceRangeForTest(
		inlinePipeSource,
		{ from: 0, to: inlinePipeSource.length },
		1,
		1,
		inlinePipeCellSource
	),
	{ from: inlinePipeCellStart, to: inlinePipeCellStart + inlinePipeCellSource.length }
);
const unclosedCodeSource = [
	"| 左列 | 右列 |",
	"| --- | --- |",
	"| `未闭合 | 目标 |"
].join("\n");
const unclosedCodeCellStart = unclosedCodeSource.lastIndexOf("目标");
assert.deepEqual(
	findCellSourceRangeForTest(
		unclosedCodeSource,
		{ from: 0, to: unclosedCodeSource.length },
		1,
		1,
		"目标"
	),
	{ from: unclosedCodeCellStart, to: unclosedCodeCellStart + "目标".length }
);
const optionalOuterPipeSource = [
	"功能 | 核心规则",
	"--- | ---",
	"R1 | 目标"
].join("\n");
const optionalOuterPipeCellStart = optionalOuterPipeSource.lastIndexOf("目标");
assert.deepEqual(
	findCellSourceRangeForTest(
		optionalOuterPipeSource,
		{ from: 0, to: optionalOuterPipeSource.length },
		1,
		1,
		"目标"
	),
	{ from: optionalOuterPipeCellStart, to: optionalOuterPipeCellStart + "目标".length }
);
const clickedMarkIds = [];
renderEditorTableMarks(view, source, lineStarts, marks, (markId) => clickedMarkIds.push(markId));

const table = view.dom.querySelector("table.table-editor");
assert.ok(table);
const tableWidget = view.dom.querySelector(".cm-table-widget");
assert.ok(tableWidget);
assert.deepEqual(
	{
		from: view.posAtDOM(tableWidget, 0),
		to: view.posAtDOM(tableWidget, tableWidget.childNodes.length)
	},
	{ from: tableStart, to: tableEnd }
);
const plainWrapper = table.querySelector('[data-side-mark-reading-id="plain"]');
const boldWrapper = table.querySelector('[data-side-mark-reading-id="bold"]');
const codeWrapper = table.querySelector('[data-side-mark-reading-id="code"]');
assert.equal(plainWrapper.textContent, "可从");
assert.equal(plainWrapper.classList.contains("side-mark--text-blue"), true);
assert.equal(plainWrapper.closest("td")?.cellIndex, 1);
assert.equal(table.rows[1]?.cells[0]?.querySelector('[data-side-mark-reading-id="plain"]'), null);
assert.equal(boldWrapper.textContent, "上拍");
assert.equal(boldWrapper.closest("strong") !== null, true);
assert.equal(codeWrapper.textContent, "placeOrder");
assert.equal(codeWrapper.closest("code") !== null || codeWrapper.querySelector("code") !== null, true);
assert.equal(plainWrapper.closest('[data-side-mark-reading-id="cell-background"]') !== null, true);
const commentWrapper = table.querySelector('[data-side-mark-reading-id="comment"]');
assert.equal(commentWrapper.textContent, "查询接口");
assert.equal(commentWrapper.classList.contains("side-mark--comment"), true);
assert.equal(commentWrapper.classList.contains("side-mark--orange"), true);
assert.equal(view.dom.querySelectorAll(".side-mark-reading").length, table.querySelectorAll(".side-mark-reading").length);

plainWrapper.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
assert.deepEqual(clickedMarkIds, ["plain"]);

const r5CellSource = source.slice(cellStart, cellEnd);
const activeR5 = activateCell(table, 1, 1, r5CellSource);
assert.equal(EditorView.findFromDOM(activeR5.cell.querySelector(".cm-editor")), activeR5.cellView);
assert.deepEqual(
	findCellSourceRangeForTest(source, { from: tableStart, to: tableEnd }, 1, 1, r5CellSource),
	{ from: cellStart, to: cellEnd }
);
renderEditorTableMarks(view, source, lineStarts, marks, () => undefined);
assert.equal(
	activeR5.cell.querySelector('[data-side-mark-id="plain"]')?.textContent,
	"可从",
	activeR5.cell.innerHTML
);
assert.ok(activeR5.cell.querySelector('[data-side-mark-id="cross-active-cell"]'));
assert.equal(activeR5.cell.querySelectorAll("[data-side-mark-reading-id]").length, 0);
assert.equal(
	table.rows[1]?.cells[0]?.querySelector('[data-side-mark-reading-id="cross-active-cell"]')?.textContent,
	"可从"
);
assert.equal(table.rows[2]?.cells[1]?.querySelector('[data-side-mark-reading-id="plain"]'), null);
assert.equal(
	table.rows[2]?.cells[1]?.querySelector('[data-side-mark-reading-id="comment"]')?.textContent,
	"查询接口"
);
activeR5.cellView.destroy();
restoreCell(activeR5.cell, "<strong>上拍</strong> <code>placeOrder</code> 可从失败继续");

const activeR6 = activateCell(table, 2, 1, "可从 查询接口 跨行开始");
renderEditorTableMarks(view, source, lineStarts, marks, () => undefined);
assert.equal(activeR6.cell.querySelector('[data-side-mark-id="plain"]'), null);
assert.equal(activeR6.cell.querySelector('[data-side-mark-id="comment"]')?.textContent, "查询接口");
activeR6.cellView.destroy();
restoreCell(activeR6.cell, "可从 查询接口 跨行开始");

renderEditorTableMarks(view, source, lineStarts, [], () => undefined);
assert.equal(table.querySelectorAll(".side-mark-reading").length, 0);
assert.match(table.textContent, /上拍 placeOrder 可从失败继续/);

const controllerActiveCell = activateCell(table, 1, 1, r5CellSource);
let controllerMarks = marks;
const controller = new EditorTableMarkRenderer(
	view,
	() => controllerMarks,
	(markId) => clickedMarkIds.push(markId)
);
await new Promise((resolve) => window.requestAnimationFrame(resolve));
await new Promise((resolve) => window.requestAnimationFrame(resolve));
assert.equal(controllerActiveCell.cell.querySelector('[data-side-mark-id="plain"]')?.textContent, "可从");
controllerMarks = [...marks, createMark({ id: "created-while-active", selectedText: "失败继续", textColor: "red" })];
controller.schedule();
await new Promise((resolve) => window.requestAnimationFrame(resolve));
await new Promise((resolve) => window.requestAnimationFrame(resolve));
assert.equal(
	controllerActiveCell.cell.querySelector('[data-side-mark-id="created-while-active"]')?.textContent,
	"失败继续"
);
table.rows[2]?.cells[1]?.querySelector('[data-side-mark-reading-id="comment"]')
	?.replaceWith(document.createTextNode("查询接口"));
await new Promise((resolve) => window.requestAnimationFrame(resolve));
await new Promise((resolve) => window.requestAnimationFrame(resolve));
assert.equal(table.rows[2]?.cells[1]?.querySelector('[data-side-mark-reading-id="comment"]')?.textContent, "查询接口");
controller.destroy();
assert.equal(table.querySelectorAll(".side-mark-reading").length, 0);
assert.equal(controllerActiveCell.cell.querySelectorAll("[data-side-mark-id]").length, 0);

const editorExtensionSource = await readFile("src/editor-extension.ts", "utf8");
assert.match(editorExtensionSource, /new EditorTableMarkRenderer\(/);
assert.match(editorExtensionSource, /this\.tableMarkRenderer\.schedule\(\)/);
assert.match(editorExtensionSource, /this\.tableMarkRenderer\.destroy\(\)/);

controllerActiveCell.cellView.destroy();
view.destroy();
console.log("editor table renderer tests passed");
