import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import esbuild from "esbuild";

await mkdir("test/.tmp", { recursive: true });
await esbuild.build({
	entryPoints: ["src/anchors.ts"],
	bundle: true,
	format: "esm",
	platform: "node",
	outfile: "test/.tmp/anchors.mjs"
});

const { createTextAnchor, relocateAnchor } = await import("./.tmp/anchors.mjs");

const source = "# Note\n\nAlpha beta gamma.\n\nAlpha beta delta.";
const start = source.indexOf("Alpha beta delta");
const anchor = createTextAnchor(source, start, start + "Alpha beta".length);

assert.equal(anchor.selectedText, "Alpha beta");
assert.equal(anchor.position.lineStart, 5);

const edited = "# Note\n\nInserted line.\n\nAlpha beta gamma.\n\nAlpha beta delta.";
const relocated = relocateAnchor(edited, anchor);
assert.ok(relocated);
assert.equal(edited.slice(relocated.startOffset, relocated.endOffset), "Alpha beta");
assert.equal(relocated.position.lineStart, 7);

const ambiguous = relocateAnchor("Alpha beta\nAlpha beta", createTextAnchor("Alpha beta\nAlpha beta", 0, "Alpha beta".length));
assert.ok(ambiguous);

console.log("anchor tests passed");
