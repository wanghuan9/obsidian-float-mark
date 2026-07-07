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

const introStart = markdown.indexOf("Intro");
const intro = findFirstHitBlock(markdown, introStart, introStart + 5);
assert.equal(intro?.kind, "paragraph");
assert.equal(intro?.index, 1);

const units = blocks.map((block, index) => ({
	kind: block.kind,
	hash: `hash-${index}`,
	blockId: `block-${index}`
}));
assert.equal(findRemoteBlockId(markdown, units, introStart, introStart + 5), "block-1");

const listStart = markdown.indexOf("- second");
assert.equal(findRemoteBlockId(markdown, units, listStart, listStart + 3), "block-3");

console.log("block map tests passed");
