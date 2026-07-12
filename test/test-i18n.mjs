import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import esbuild from "esbuild";

await mkdir("test/.tmp", { recursive: true });
await esbuild.build({
	entryPoints: ["src/i18n.ts"],
	bundle: true,
	format: "esm",
	platform: "browser",
	external: ["obsidian"],
	outfile: "test/.tmp/i18n.mjs"
});

const {
	getDefaultCommentAuthorName,
	getInitialPluginLanguage,
	isChineseLanguage,
	normalizePluginLanguage,
	translate
} = await import("./.tmp/i18n.mjs");

assert.equal(normalizePluginLanguage("en", "zh-CN"), "en");
assert.equal(normalizePluginLanguage("zh-CN", "en"), "zh-CN");
assert.equal(normalizePluginLanguage("fr", "zh-CN"), "zh-CN");

assert.equal(isChineseLanguage("zh"), true);
assert.equal(isChineseLanguage("zh-CN"), true);
assert.equal(isChineseLanguage("zh_TW"), true);
assert.equal(isChineseLanguage("en-US"), false);

assert.equal(getDefaultCommentAuthorName("zh-CN"), "我");
assert.equal(getDefaultCommentAuthorName("en"), "Me");
assert.equal(translate("en", "notice.autoSyncLarkFailed", { message: "boom" }), "Auto sync to Feishu failed: boom");
assert.equal(translate("zh-CN", "notice.autoSyncLarkFailed", { message: "boom" }), "自动同步飞书失败：boom");
assert.equal(translate("zh-CN", "sidebar.inherited"), "继承");
assert.equal(translate("en", "sidebar.inherited"), "Inherited");
assert.equal(translate("zh-CN", "sidebar.inheritedBackground"), "背景继承自覆盖当前文本的标记");
assert.equal(translate("en", "sidebar.inheritedBackground"), "Background inherited from a mark covering this text");

assert.equal(getInitialPluginLanguage({ vault: { getConfig: () => "en-US" } }, "zh-CN"), "zh-CN");
assert.equal(getInitialPluginLanguage({ vault: { getConfig: () => "zh-CN" } }, "en-US"), "en");
assert.equal(getInitialPluginLanguage({ vault: { getConfig: () => "zh-CN" } }), "zh-CN");
assert.equal(getInitialPluginLanguage({ vault: { getConfig: () => "en-US" } }), "en");
assert.equal(getInitialPluginLanguage({ vault: {}, locale: "zh-TW" }), "zh-CN");

console.log("i18n tests passed");
