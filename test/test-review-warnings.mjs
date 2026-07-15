import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import esbuild from "esbuild";

await mkdir("test/.tmp", { recursive: true });
await esbuild.build({
	entryPoints: ["src/lark-cli-bridge.ts"],
	bundle: true,
	format: "esm",
	platform: "browser",
	outfile: "test/.tmp/lark-cli-bridge.mjs"
});

const {
	assertLarkCommandOk,
	buildLarkReplyListArgs,
	executeLarkCliCommand,
	getLarkReplyIds
} = await import("./.tmp/lark-cli-bridge.mjs");

const replyListArgs = buildLarkReplyListArgs("doc-token", "comment-id");
assert.deepEqual(replyListArgs, [
	"drive",
	"file.comment.replys",
	"list",
	"--as",
	"user",
	"--file-token",
	"doc-token",
	"--file-type",
	"docx",
	"--comment-id",
	"comment-id",
	"--page-size",
	"100",
	"--json"
]);

const commandResult = { data: { items: [{ reply_id: "reply-1" }] } };
const syncPlugin = {
	async runLarkCliCommand(args) {
		assert.equal(this, syncPlugin);
		assert.deepEqual(args, replyListArgs);
		return commandResult;
	}
};
assert.equal(await executeLarkCliCommand(syncPlugin, replyListArgs, "missing"), commandResult);
assert.deepEqual(getLarkReplyIds(commandResult), ["reply-1"]);
assert.deepEqual(getLarkReplyIds({ items: [{ reply_id: "reply-2" }, {}] }), ["reply-2"]);
assert.throws(() => assertLarkCommandOk({ ok: false, error: { message: "failed" } }, "fallback"), /failed/);
assert.throws(() => assertLarkCommandOk({ ok: false }, "fallback"), /fallback/);
await assert.rejects(() => executeLarkCliCommand(undefined, replyListArgs, "missing"), /missing/);
const bridgeError = new Error("bridge failed");
await assert.rejects(
	() => executeLarkCliCommand({ runLarkCliCommand: async () => { throw bridgeError; } }, replyListArgs, "missing"),
	(error) => error === bridgeError
);

const larkBridgeSource = await readFile("src/lark-bridge.ts", "utf8");
const bundledPluginSource = await readFile("main.js", "utf8");
assert.doesNotMatch(larkBridgeSource, /(?:node:)?child_process/);
assert.doesNotMatch(bundledPluginSource, /(?:node:)?child_process/);
assert.doesNotMatch(larkBridgeSource, /runRawLarkCliViaSyncPlugin/);
assert.match(
	larkBridgeSource,
	/async function findLarkReplyIds[\s\S]*?await runLarkCliViaSyncPlugin\(plugin, args\)/
);

const readingRendererSource = await readFile("src/reading-view-renderer.ts", "utf8");
assert.match(
	readingRendererSource,
	/new Array<Element \| null>\(textNodes\.length\)\.fill\(null\)/
);
assert.doesNotMatch(
	readingRendererSource,
	/prefixClosingStarts\.values\(\)\.next\(\)\.value as number \| undefined/
);

const anchorsSource = await readFile("src/anchors.ts", "utf8");
assert.doesNotMatch(anchorsSource, /matches\[0\]!/);
const storageSource = await readFile("src/storage.ts", "utf8");
assert.match(storageSource, /new Array<SideMarkDocument \| null>\(sidecarPaths\.length\)\.fill\(null\)/);

const readmeSource = await readFile("README.md", "utf8");
const englishReadmeSource = await readFile("README.en.md", "utf8");
assert.match(readmeSource, /FloatMark 是 Obsidian/);
assert.match(readmeSource, /FloatMark is an Obsidian plugin/);
assert.match(readmeSource, /\[English\]\(https:\/\/github\.com\/wanghuan9\/obsidian-float-mark\/blob\/main\/README\.en\.md\)/);
assert.match(englishReadmeSource, /FloatMark is an Obsidian plugin/);
assert.match(englishReadmeSource, /\[简体中文\]\(https:\/\/github\.com\/wanghuan9\/obsidian-float-mark\/blob\/main\/README\.md\)/);

const stylesSource = await readFile("styles.css", "utf8");
assert.doesNotMatch(stylesSource, /important/);
assert.match(stylesSource, /--button-normal: var\(--side-mark-style-background, var\(--background-primary\)\)/);
assert.match(stylesSource, /--button-normal: var\(--side-mark-color-option-background\)/);
assert.match(
	stylesSource,
	/body \.side-mark-sidebar\.side-mark-theme-retroma \.side-mark-marker-card:not\(\.is-background-none\) \.side-mark-marker-preview[\s\S]*?18%/
);

console.log("review warning tests passed");
