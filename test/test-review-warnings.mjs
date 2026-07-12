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

console.log("review warning tests passed");
