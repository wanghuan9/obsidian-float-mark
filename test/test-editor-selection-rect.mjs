import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import esbuild from "esbuild";
import { JSDOM } from "jsdom";

await mkdir("test/.tmp", { recursive: true });
await esbuild.build({
	entryPoints: ["src/editor-selection-rect.ts"],
	bundle: true,
	format: "esm",
	platform: "browser",
	outfile: "test/.tmp/editor-selection-rect.mjs"
});

const dom = new JSDOM('<div id="editor"><span id="selection">selected text</span></div><div id="outside">outside</div>');
globalThis.DOMRect = dom.window.DOMRect;

const { resolveEditorSelectionRect } = await import("./.tmp/editor-selection-rect.mjs");
const editor = dom.window.document.querySelector("#editor");
const selectedText = dom.window.document.querySelector("#selection").firstChild;
const outsideText = dom.window.document.querySelector("#outside").firstChild;
const firstRect = new DOMRect(100, 80, 140, 20);
const lastRect = new DOMRect(100, 110, 50, 20);

function createSelection(commonAncestorContainer, rects) {
	return {
		rangeCount: 1,
		isCollapsed: false,
		getRangeAt: () => ({
			commonAncestorContainer,
			getClientRects: () => rects,
			getBoundingClientRect: () => new DOMRect(100, 80, 140, 50)
		})
	};
}

const selection = createSelection(selectedText, [firstRect, lastRect]);
assert.deepEqual(
	resolveEditorSelectionRect(editor, selection, "end").toJSON(),
	lastRect.toJSON()
);
assert.deepEqual(
	resolveEditorSelectionRect(editor, selection, "start").toJSON(),
	firstRect.toJSON()
);
assert.deepEqual(
	resolveEditorSelectionRect(editor, selection, "bounding").toJSON(),
	new DOMRect(100, 80, 140, 50).toJSON()
);
assert.equal(resolveEditorSelectionRect(editor, createSelection(outsideText, [lastRect]), "end"), null);
assert.deepEqual(
	resolveEditorSelectionRect(editor, createSelection(selectedText, []), "end").toJSON(),
	new DOMRect(100, 80, 140, 50).toJSON()
);

console.log("editor selection rect tests passed");
