import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import esbuild from "esbuild";

await mkdir("test/.tmp", { recursive: true });
await esbuild.build({
	entryPoints: ["src/preview-sections.ts"],
	bundle: true,
	format: "esm",
	platform: "node",
	outfile: "test/.tmp/preview-sections.mjs"
});

const { resolvePreviewSectionBounds } = await import("./.tmp/preview-sections.mjs");

assert.deepEqual(resolvePreviewSectionBounds({
	start: { line: 21, col: 0, offset: 574 },
	end: { line: 26, col: 63, offset: 932 }
}), {
	lineStart: 21,
	lineEnd: 26,
	sourceStartOffset: 574,
	sourceEndOffset: 932
});

assert.deepEqual(resolvePreviewSectionBounds({ lineStart: 21, lineEnd: 26 }), {
	lineStart: 21,
	lineEnd: 26
});

assert.equal(resolvePreviewSectionBounds({ start: { line: 21 }, end: {} }), null);

console.log("preview section tests passed");
