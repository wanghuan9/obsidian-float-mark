import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { EditorState } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import esbuild from "esbuild";
import { JSDOM } from "jsdom";

await mkdir("test/.tmp", { recursive: true });
await esbuild.build({
	entryPoints: ["src/editor-decorations.ts"],
	bundle: true,
	format: "esm",
	platform: "browser",
	outfile: "test/.tmp/editor-decorations.mjs"
});

const { buildEditorDecorationLayers } = await import("./.tmp/editor-decorations.mjs");

function createMark({
	id,
	startOffset,
	endOffset,
	kind = "highlight",
	color = "yellow",
	textColor = "default",
	backgroundColor = "none"
}) {
	return {
		id,
		filePath: "note.md",
		anchor: {
			startOffset,
			endOffset,
			selectedText: "x".repeat(endOffset - startOffset),
			prefix: "",
			suffix: "",
			position: { lineStart: 1, lineEnd: 1, columnStart: 1, columnEnd: 1 }
		},
		mark: { kind, color, textColor, backgroundColor },
		note: { content: "", createdAt: "", updatedAt: "" },
		status: "active"
	};
}

function collectDecorations(set, length) {
	const decorations = [];
	set.between(0, length, (from, to, decoration) => {
		decorations.push({ from, to, spec: decoration.spec });
	});
	return decorations;
}

const source = "- 身份识别只需查 `partner_account` 一张表，不再需要先查 `pjt_partner_info` 再查子账号表";
const outerMark = createMark({
	id: "outer-background",
	startOffset: 0,
	endOffset: source.length,
	backgroundColor: "red-light"
});
const localText = "pjt_partner_info";
const localTextStart = source.indexOf(localText);
const localTextMark = createMark({
	id: "local-text",
	startOffset: localTextStart,
	endOffset: localTextStart + localText.length,
	textColor: "green"
});
const layers = buildEditorDecorationLayers([outerMark, localTextMark], source.length, null);
const regularDecorations = collectDecorations(layers.decorations, source.length);
const outerDecorations = collectDecorations(layers.outerDecorations, source.length);

assert.equal(outerDecorations.length, 1);
assert.equal(outerDecorations[0].from, 0);
assert.equal(outerDecorations[0].to, source.length);
assert.match(outerDecorations[0].spec.class, /side-mark--background-red-light/);
assert.doesNotMatch(outerDecorations[0].spec.class, /side-mark--text-/);
assert.equal(outerDecorations[0].spec.attributes, undefined);

const regularOuter = regularDecorations.find((decoration) =>
	decoration.spec.attributes?.["data-side-mark-id"] === "outer-background"
);
assert.equal(regularOuter.from, 0);
assert.equal(regularOuter.to, source.length);
assert.match(regularOuter.spec.class, /side-mark--text-default/);
assert.match(regularOuter.spec.class, /side-mark--background-none/);
assert.doesNotMatch(regularOuter.spec.class, /side-mark--background-red-light/);

const regularLocal = regularDecorations.find((decoration) =>
	decoration.spec.attributes?.["data-side-mark-id"] === "local-text"
);
assert.equal(regularLocal.from, localTextStart);
assert.equal(regularLocal.to, localTextStart + localText.length);
assert.match(regularLocal.spec.class, /side-mark--text-green/);
assert.equal(outerDecorations.some((decoration) => decoration.from === localTextStart), false);

const partialMark = createMark({
	id: "partial-background",
	startOffset: 4,
	endOffset: 12,
	backgroundColor: "blue-light"
});
const multilineMark = createMark({
	id: "multiline-background",
	startOffset: 0,
	endOffset: 15,
	backgroundColor: "purple-light"
});
const commentMark = createMark({
	id: "comment",
	startOffset: 2,
	endOffset: 7,
	kind: "comment",
	color: "yellow",
	backgroundColor: "none"
});
const boundaryLayers = buildEditorDecorationLayers(
	[partialMark, multilineMark, commentMark],
	20,
	{ from: 16, to: 20 }
);
const boundaryRegular = collectDecorations(boundaryLayers.decorations, 20);
const boundaryOuter = collectDecorations(boundaryLayers.outerDecorations, 20);

assert.deepEqual(
	boundaryOuter.map(({ from, to }) => ({ from, to }))
		.sort((left, right) => left.from - right.from || left.to - right.to),
	[{ from: 0, to: 15 }, { from: 4, to: 12 }]
);
assert.equal(boundaryRegular.some((decoration) => decoration.spec.class === "side-mark-pending-comment-selection"), true);
assert.equal(boundaryRegular.some((decoration) => decoration.spec.class.includes("side-mark--comment")), true);
assert.equal(boundaryOuter.some((decoration) => decoration.spec.class.includes("side-mark--comment")), false);

const inactiveLayers = buildEditorDecorationLayers([
	{ ...outerMark, status: "resolved" },
	{ ...localTextMark, status: "orphaned" }
], source.length, null);
assert.equal(collectDecorations(inactiveLayers.decorations, source.length).length, 0);
assert.equal(collectDecorations(inactiveLayers.outerDecorations, source.length).length, 0);

const emptyLayers = buildEditorDecorationLayers([], 0, null);
assert.equal(collectDecorations(emptyLayers.decorations, 0).length, 0);
assert.equal(collectDecorations(emptyLayers.outerDecorations, 0).length, 0);
const clampedMark = createMark({
	id: "clamped",
	startOffset: -5,
	endOffset: 50,
	backgroundColor: "green-light"
});
const emptyMark = createMark({ id: "empty", startOffset: 3, endOffset: 3, backgroundColor: "red-light" });
const clampedLayers = buildEditorDecorationLayers([clampedMark, emptyMark], 10, { from: 8, to: 4 });
assert.deepEqual(
	collectDecorations(clampedLayers.outerDecorations, 10).map(({ from, to }) => ({ from, to })),
	[{ from: 0, to: 10 }]
);
assert.equal(
	collectDecorations(clampedLayers.decorations, 10)
		.some((decoration) => decoration.spec.class === "side-mark-pending-comment-selection"),
	false
);
const repeatedLayers = buildEditorDecorationLayers([outerMark, localTextMark], source.length, null);
assert.deepEqual(
	collectDecorations(repeatedLayers.outerDecorations, source.length),
	outerDecorations
);

const dom = new JSDOM('<div id="editor"></div>', { pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
const syntaxRanges = ["partner_account", "pjt_partner_info"].map((text) => {
	const from = source.indexOf(text);
	return Decoration.mark({ class: "simulated-markdown-syntax" }).range(from, from + text.length);
});
const state = EditorState.create({
	doc: source,
	extensions: [
		EditorView.outerDecorations.of(layers.outerDecorations),
		EditorView.decorations.of(layers.decorations),
		EditorView.decorations.of(Decoration.set(syntaxRanges, true))
	]
});
const view = new EditorView({ state, parent: dom.window.document.querySelector("#editor") });
const backgroundWrappers = view.dom.querySelectorAll(".side-mark-editor-background");
assert.equal(backgroundWrappers.length, 1);
assert.equal(backgroundWrappers[0].textContent, source);
assert.ok(view.dom.querySelectorAll('[data-side-mark-id="outer-background"]').length > 1);
view.destroy();

const stylesSource = await readFile("styles.css", "utf8");
assert.match(
	stylesSource,
	/\.markdown-source-view\.mod-cm6 \.side-mark-editor-background \.cm-inline-code\s*\{\s*background: transparent;/
);

console.log("editor decoration tests passed");
