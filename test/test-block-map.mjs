import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import esbuild from "esbuild";

await mkdir("test/.tmp", { recursive: true });
await esbuild.build({
	entryPoints: ["src/block-map.ts"],
	bundle: true,
	format: "esm",
	platform: "node",
	outfile: "test/.tmp/block-map.mjs"
});

const { findFirstHitBlock, findRemoteBlockId, splitMarkdownBlocks } = await import("./.tmp/block-map.mjs");

const markdown = "# Title\n\nIntro paragraph.\n\n## Section\n\n- first\n- second\n\n```ts\nconst a = 1;\n```\n";
const blocks = splitMarkdownBlocks(markdown);
assert.deepEqual(blocks.map((block) => block.kind), ["heading", "paragraph", "heading", "list", "code"]);

const titleStart = markdown.indexOf("Title");
const title = findFirstHitBlock(markdown, titleStart, titleStart + 5);
assert.equal(title?.kind, "heading");
assert.equal(title?.index, 0);

const introStart = markdown.indexOf("Intro");
const intro = findFirstHitBlock(markdown, introStart, introStart + 5);
assert.equal(intro?.kind, "paragraph");
assert.equal(intro?.index, 1);

const remoteUnitKinds = ["paragraph", "heading", "list", "list", "code"];
const remoteUnits = remoteUnitKinds.map((kind, index) => ({
	kind,
	hash: `hash-${index}`,
	blockId: `block-${index}`
}));
assert.equal(findRemoteBlockId(markdown, remoteUnits, titleStart, titleStart + 5, "title-block"), "title-block");
assert.equal(findRemoteBlockId(markdown, remoteUnits, introStart, introStart + 5, "title-block"), "block-0");

const listStart = markdown.indexOf("- second");
assert.equal(findRemoteBlockId(markdown, remoteUnits, listStart, listStart + 3, "title-block"), "block-3");

const markdownWithBinding = [
	"---",
	"lark_doc_url: https://example.feishu.cn/docx/abc",
	"---",
	"# Bound title",
	"",
	"Bound intro."
].join("\n");
const boundTitleStart = markdownWithBinding.indexOf("Bound title");
const boundIntroStart = markdownWithBinding.indexOf("Bound intro");
assert.equal(
	findRemoteBlockId(markdownWithBinding, [{ kind: "paragraph", hash: "hash", blockId: "bound-intro" }], boundTitleStart, boundTitleStart + 5, "bound-title"),
	"bound-title"
);
assert.equal(
	findRemoteBlockId(markdownWithBinding, [{ kind: "paragraph", hash: "hash", blockId: "bound-intro" }], boundIntroStart, boundIntroStart + 5, "bound-title"),
	"bound-intro"
);

const markdownWithMetadata = [
	"---",
	"owner: me",
	"lark_doc_url: https://example.feishu.cn/docx/abc",
	"---",
	"# Metadata title",
	"",
	"Metadata intro."
].join("\n");
const metadataIntroStart = markdownWithMetadata.indexOf("Metadata intro");
assert.equal(
	findRemoteBlockId(
		markdownWithMetadata,
		[
			{ kind: "blockquote", hash: "metadata-hash", blockId: "metadata-block" },
			{ kind: "paragraph", hash: "intro-hash", blockId: "metadata-intro" }
		],
		metadataIntroStart,
		metadataIntroStart + 5,
		"metadata-title"
	),
	"metadata-intro"
);

console.log("block map tests passed");
