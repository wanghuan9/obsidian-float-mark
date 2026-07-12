import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import esbuild from "esbuild";
import { JSDOM } from "jsdom";

await mkdir("test/.tmp", { recursive: true });
await esbuild.build({
	entryPoints: ["src/mark-click-guard.ts"],
	bundle: true,
	format: "esm",
	platform: "browser",
	outfile: "test/.tmp/mark-click-guard.mjs"
});

const { hasNonEmptyDomSelection, shouldOpenMarkForSelection } = await import("./.tmp/mark-click-guard.mjs");

assert.equal(shouldOpenMarkForSelection(false), true);
assert.equal(shouldOpenMarkForSelection(true), false);
assert.equal(hasNonEmptyDomSelection(null), false);

const dom = new JSDOM("<p id=\"root\">不复用现有 @CheckPermission，避免污染现有权限语义</p>");
const document = dom.window.document;
const selection = dom.window.getSelection();
assert.equal(hasNonEmptyDomSelection(selection), false);

const textNode = document.querySelector("#root").firstChild;
const selectedText = "，避免污";
const start = textNode.data.indexOf(selectedText);
const range = document.createRange();
const whitespaceStart = textNode.data.indexOf(" ");
range.setStart(textNode, whitespaceStart);
range.setEnd(textNode, whitespaceStart + 1);
selection.addRange(range);
assert.equal(hasNonEmptyDomSelection(selection), false);

selection.removeAllRanges();
range.setStart(textNode, start);
range.setEnd(textNode, start + selectedText.length);
selection.addRange(range);

assert.equal(selection.toString(), selectedText);
assert.equal(hasNonEmptyDomSelection(selection), true);

selection.removeAllRanges();
assert.equal(hasNonEmptyDomSelection(selection), false);

console.log("mark click guard tests passed");
