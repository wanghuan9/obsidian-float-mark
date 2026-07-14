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

const duplicate = "Task 6 前文\nTask 6 前文";
const stale = createTextAnchor("唯一 Task 6 后文", 3, 9);
assert.equal(relocateAnchor(duplicate, stale, {
	trustStoredPosition: false,
	allowUniqueTextFallback: false
}), null);

const restoredSource = "新前缀 唯一 Task 6 后文";
const restored = relocateAnchor(restoredSource, stale, {
	trustStoredPosition: false,
	allowUniqueTextFallback: false
});
assert.ok(restored);
assert.equal(restoredSource.slice(restored.startOffset, restored.endOffset), "Task 6");

const unrelatedUnique = "完全不同上下文中的 Task 6";
assert.equal(relocateAnchor(unrelatedUnique, stale, {
	trustStoredPosition: false,
	allowUniqueTextFallback: false
}), null);

const zeroSource = "Task 6 后文";
const zeroAnchor = createTextAnchor("Task 6 后文", 0, 6);
const atZero = relocateAnchor(zeroSource, { ...zeroAnchor, startOffset: 2, endOffset: 8 }, {
	trustStoredPosition: false,
	allowUniqueTextFallback: false
});
assert.ok(atZero);
assert.equal(atZero.startOffset, 0);

console.log("anchor tests passed");
