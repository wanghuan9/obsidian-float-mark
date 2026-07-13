import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import esbuild from "esbuild";

await mkdir("test/.tmp", { recursive: true });
await esbuild.build({
	entryPoints: ["src/mark-appearance.ts"],
	bundle: true,
	format: "esm",
	platform: "browser",
	outfile: "test/.tmp/mark-appearance.mjs"
});

const { hasContinuousMarkPaint, resolveMarkBackground } = await import("./.tmp/mark-appearance.mjs");

function createMark({
	id,
	startOffset,
	endOffset,
	backgroundColor = "none",
	textColor = "default",
	kind = "highlight",
	status = "active",
	filePath = "note.md"
}) {
	return {
		id,
		filePath,
		anchor: {
			startOffset,
			endOffset,
			selectedText: "text",
			prefix: "",
			suffix: "",
			position: { lineStart: 1, lineEnd: 1, columnStart: 1, columnEnd: 1 }
		},
		mark: { kind, color: "yellow", textColor, backgroundColor },
		note: { content: "", createdAt: "", updatedAt: "" },
		status
	};
}

const child = createMark({ id: "child", startOffset: 20, endOffset: 24, textColor: "blue" });
assert.deepEqual(resolveMarkBackground(child, []), { color: "none", inherited: false });
assert.equal(hasContinuousMarkPaint(child), false);

const redOuter = createMark({ id: "red-outer", startOffset: 0, endOffset: 100, backgroundColor: "red-light" });
assert.deepEqual(resolveMarkBackground(child, [redOuter, child]), {
	color: "red-light",
	inherited: true
});

const explicitChild = createMark({
	id: "explicit-child",
	startOffset: 20,
	endOffset: 24,
	backgroundColor: "purple-light",
	textColor: "blue"
});
assert.deepEqual(resolveMarkBackground(explicitChild, [redOuter, explicitChild]), {
	color: "purple-light",
	inherited: false
});
assert.equal(hasContinuousMarkPaint(explicitChild), true);

const nearerBlue = createMark({ id: "nearer-blue", startOffset: 10, endOffset: 30, backgroundColor: "blue-light" });
const sameRangePurple = createMark({
	id: "same-range-purple",
	startOffset: 10,
	endOffset: 30,
	backgroundColor: "purple-light"
});
assert.deepEqual(resolveMarkBackground(child, [redOuter, nearerBlue, sameRangePurple, child]), {
	color: "purple-light",
	inherited: true
});

const shiftedSameLength = createMark({
	id: "shifted-same-length",
	startOffset: 12,
	endOffset: 32,
	backgroundColor: "green-light"
});
assert.deepEqual(resolveMarkBackground(child, [shiftedSameLength, nearerBlue, child]), {
	color: "blue-light",
	inherited: true
});

const markdownChild = createMark({ id: "markdown-child", startOffset: 6, endOffset: 7 });
const markdownOuter = createMark({
	id: "markdown-outer",
	startOffset: 0,
	endOffset: 8,
	backgroundColor: "red-light"
});
const markdownInner = createMark({
	id: "markdown-inner",
	startOffset: 5,
	endOffset: 10,
	backgroundColor: "blue-light"
});
assert.deepEqual(resolveMarkBackground(markdownChild, [markdownOuter, markdownInner, markdownChild]), {
	color: "blue-light",
	inherited: true
});

const partial = createMark({ id: "partial", startOffset: 0, endOffset: 22, backgroundColor: "red-light" });
assert.deepEqual(resolveMarkBackground(child, [partial, child]), { color: "none", inherited: false });

const resolvedOuter = createMark({
	id: "resolved",
	startOffset: 0,
	endOffset: 100,
	backgroundColor: "red-light",
	status: "resolved"
});
const commentOuter = createMark({
	id: "comment",
	startOffset: 0,
	endOffset: 100,
	backgroundColor: "red-light",
	kind: "comment"
});
assert.equal(hasContinuousMarkPaint(commentOuter), true);
const underlineWithBackground = createMark({
	id: "underline-background",
	startOffset: 0,
	endOffset: 100,
	backgroundColor: "red-light",
	kind: "underline"
});
assert.equal(hasContinuousMarkPaint(underlineWithBackground), false);
const noBackgroundOuter = createMark({ id: "no-background", startOffset: 0, endOffset: 100 });
const otherFileOuter = createMark({
	id: "other-file",
	startOffset: 0,
	endOffset: 100,
	backgroundColor: "red-light",
	filePath: "other.md"
});
assert.deepEqual(
	resolveMarkBackground(child, [resolvedOuter, commentOuter, noBackgroundOuter, otherFileOuter, child]),
	{ color: "none", inherited: false }
);

const resolvedChild = createMark({ id: "resolved-child", startOffset: 20, endOffset: 24, status: "resolved" });
assert.deepEqual(resolveMarkBackground(resolvedChild, [redOuter, resolvedChild]), {
	color: "none",
	inherited: false
});

const sidebarSource = await readFile("src/sidebar-view.ts", "utf8");
assert.match(
	sidebarSource,
	/side-mark-marker-preview side-mark--highlight side-mark--text-\$\{mark\.mark\.textColor\} side-mark--background-\$\{background\.color\}/
);
const stylesSource = await readFile("styles.css", "utf8");
assert.match(stylesSource, /\.side-mark--highlight\.side-mark--text-blue\s*\{\s*color: #245bff;/);
const backgroundColors = [
	"gray-light",
	"red-light",
	"orange-light",
	"yellow-light",
	"green-light",
	"blue-light",
	"purple-light",
	"gray",
	"red",
	"orange",
	"yellow",
	"green",
	"blue",
	"purple"
];
for (const color of backgroundColors) {
	assert.match(
		stylesSource,
		new RegExp(
			`\\.side-mark--highlight\\.side-mark--background-${color}\\s*\\{[^}]*--side-mark-background-color:`
		)
	);
}
assert.match(
	stylesSource,
	/\.side-mark-marker-card:not\(\.is-background-none\) \.side-mark-marker-preview\s*\{[^}]*color-mix\(in srgb, var\(--side-mark-marker-preview-accent\) 45%, var\(--background-primary\)\)/
);
assert.match(
	stylesSource,
	/\.side-mark-marker-card:not\(\.is-background-none\) \.side-mark-marker-preview::before\s*\{[^}]*background: var\(--side-mark-marker-preview-accent\)/
);
assert.doesNotMatch(stylesSource, /\.side-mark-marker-card\.is-background-(?!none)[\w-]+/);

console.log("mark appearance tests passed");
