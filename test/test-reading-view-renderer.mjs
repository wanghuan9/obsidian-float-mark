import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import esbuild from "esbuild";

await mkdir("test/.tmp", { recursive: true });
await esbuild.build({
	entryPoints: ["src/reading-view-renderer.ts"],
	bundle: true,
	format: "esm",
	platform: "browser",
	outfile: "test/.tmp/reading-view-renderer.mjs"
});

const { findReadingMatchForTest } = await import("./.tmp/reading-view-renderer.mjs");

const baseMark = {
	id: "mark-1",
	filePath: "note.md",
	anchor: {
		startOffset: 0,
		endOffset: 0,
		selectedText: "",
		prefix: "",
		suffix: "",
		position: {
			lineStart: 1,
			lineEnd: 1,
			columnStart: 1,
			columnEnd: 1
		}
	},
	mark: {
		kind: "highlight",
		color: "green"
	},
	note: {
		content: "",
		createdAt: "",
		updatedAt: ""
	},
	status: "active"
};

const boldMark = {
	...baseMark,
	anchor: {
		...baseMark.anchor,
		selectedText: "**全生命周期管理**",
		position: {
			...baseMark.anchor.position,
			lineStart: 1
		}
	}
};
const boldMatch = findReadingMatchForTest("1. 全生命周期管理：创建、编辑", boldMark);
assert.deepEqual(boldMatch, { start: 3, end: 10 });

const listMark = {
	...baseMark,
	anchor: {
		...baseMark.anchor,
		selectedText: "1. **全生命周期管理**：创建、编辑\n2. 快照固化：创建时复制",
		position: {
			...baseMark.anchor.position,
			lineStart: 1
		}
	}
};
const matchedList = findReadingMatchForTest("全生命周期管理：创建、编辑快照固化：创建时复制", listMark);
assert.deepEqual(matchedList, { start: 0, end: 23 });

console.log("reading view renderer tests passed");
