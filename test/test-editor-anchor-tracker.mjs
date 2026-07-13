import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { EditorState } from "@codemirror/state";
import esbuild from "esbuild";

await mkdir("test/.tmp", { recursive: true });
await esbuild.build({
	entryPoints: ["src/editor-anchor-tracker.ts"],
	bundle: true,
	format: "esm",
	platform: "node",
	outfile: "test/.tmp/editor-anchor-tracker.mjs"
});

const { reconcileEditorMarks } = await import("./.tmp/editor-anchor-tracker.mjs");

function createTextAnchor(source, startOffset, endOffset) {
	return {
		startOffset,
		endOffset,
		selectedText: source.slice(startOffset, endOffset),
		prefix: source.slice(Math.max(0, startOffset - 40), startOffset),
		suffix: source.slice(endOffset, endOffset + 40),
		position: { lineStart: 1, lineEnd: 1, columnStart: startOffset + 1, columnEnd: endOffset + 1 }
	};
}

function createMark(source, startOffset, selectedText, status = "active") {
	return {
		id: "mark-1",
		filePath: "note.md",
		anchor: createTextAnchor(source, startOffset, startOffset + selectedText.length),
		mark: { kind: "highlight", color: "yellow", textColor: "default", backgroundColor: "none" },
		note: { content: "", createdAt: "", updatedAt: "" },
		status
	};
}

const source = "before marked after";
const mark = createMark(source, source.indexOf("marked"), "marked");

const inserted = EditorState.create({ doc: source }).update({ changes: { from: 0, insert: "new " } });
const moved = reconcileEditorMarks([mark], inserted.state.doc.toString(), inserted.changes);
assert.equal(moved[0].status, "active");
assert.equal(moved[0].anchor.startOffset, mark.anchor.startOffset + 4);

const appended = EditorState.create({ doc: source }).update({ changes: { from: source.length, insert: " more" } });
const unchanged = reconcileEditorMarks([mark], appended.state.doc.toString(), appended.changes);
assert.equal(unchanged[0].status, "active");
assert.equal(unchanged[0].anchor.startOffset, mark.anchor.startOffset);

const inside = EditorState.create({ doc: source }).update({
	changes: { from: mark.anchor.startOffset + 2, to: mark.anchor.startOffset + 4, insert: "XX" }
});
const orphaned = reconcileEditorMarks([mark], inside.state.doc.toString(), inside.changes);
assert.equal(orphaned[0].status, "orphaned");

const duplicateSource = "before marked after\nbefore marked after";
const duplicateMark = createMark(source, source.indexOf("marked"), "marked", "orphaned");
const duplicateUpdate = EditorState.create({ doc: duplicateSource }).update({
	changes: { from: duplicateSource.length, insert: "!" }
});
const stillOrphaned = reconcileEditorMarks(
	[duplicateMark],
	duplicateUpdate.state.doc.toString(),
	duplicateUpdate.changes
);
assert.equal(stillOrphaned[0].status, "orphaned");

const restoredUpdate = EditorState.create({ doc: source }).update({ changes: { from: 0, insert: "new " } });
const restoredSource = restoredUpdate.state.doc.toString();
const restored = reconcileEditorMarks([duplicateMark], restoredUpdate.state.doc.toString(), restoredUpdate.changes);
assert.equal(restored[0].status, "active");
assert.equal(restored[0].anchor.startOffset, restoredSource.indexOf("marked"));

const resolved = { ...mark, status: "resolved" };
assert.equal(reconcileEditorMarks([resolved], inserted.state.doc.toString(), inserted.changes)[0], resolved);

console.log("editor anchor tracker tests passed");
