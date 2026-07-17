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
assert.equal(translate("zh-CN", "notice.readingSelectionUnresolved"), "无法精确定位所选内容，未创建标注。");
assert.equal(
	translate("en", "notice.readingSelectionUnresolved"),
	"The selected text could not be located precisely. No mark was created."
);
assert.equal(translate("zh-CN", "sidebar.inherited"), "继承");
assert.equal(translate("en", "sidebar.inherited"), "Inherited");
assert.equal(translate("zh-CN", "sidebar.inheritedBackground"), "背景继承自覆盖当前文本的标记");
assert.equal(translate("en", "sidebar.inheritedBackground"), "Background inherited from a mark covering this text");
assert.equal(translate("zh-CN", "style.background.custom"), "自定义背景颜色");
assert.equal(translate("en", "style.background.custom"), "Custom background color");
assert.equal(translate("zh-CN", "sidebar.scopeCurrent"), "当前文档");
assert.equal(translate("zh-CN", "sidebar.scopeVault"), "全部文档");
assert.equal(translate("en", "sidebar.scopeCurrent"), "Current document");
assert.equal(translate("en", "sidebar.scopeVault"), "All documents");
assert.equal(translate("zh-CN", "settings.scopeControlStyle.name"), "文档范围切换样式");
assert.equal(translate("zh-CN", "settings.scopeControlStyle.tabs"), "A · 文字下划线");
assert.equal(translate("zh-CN", "settings.scopeControlStyle.dropdown"), "B · 单入口下拉");
assert.equal(translate("zh-CN", "settings.scopeControlStyle.swap"), "C · 状态一键交换");
assert.equal(translate("zh-CN", "settings.scopeControlStyle.switch"), "F · 双向物理开关");
assert.equal(translate("zh-CN", "sidebar.scopeCurrentShort"), "当前");
assert.equal(translate("zh-CN", "sidebar.scopeVaultShort"), "全部");
assert.equal(translate("zh-CN", "sidebar.scopeSwitchLabel"), "文档范围");
assert.equal(translate("zh-CN", "sidebar.switchScope", { scope: "全部文档" }), "切换到全部文档");
assert.equal(translate("en", "settings.scopeControlStyle.tabs"), "A · Underline tabs");
assert.equal(translate("en", "settings.scopeControlStyle.dropdown"), "B · Single dropdown");
assert.equal(translate("en", "settings.scopeControlStyle.swap"), "C · Status + swap");
assert.equal(translate("en", "settings.scopeControlStyle.switch"), "F · Two-way switch");
assert.equal(translate("zh-CN", "sidebar.emptyVault"), "全部文档中没有符合当前筛选的标注。");
assert.equal(translate("en", "notice.markFileUnavailable"), "The Markdown file for this mark no longer exists or is unavailable.");

assert.equal(getInitialPluginLanguage({ vault: { getConfig: () => "en-US" } }, "zh-CN"), "zh-CN");
assert.equal(getInitialPluginLanguage({ vault: { getConfig: () => "zh-CN" } }, "en-US"), "en");
assert.equal(getInitialPluginLanguage({ vault: { getConfig: () => "zh-CN" } }), "zh-CN");
assert.equal(getInitialPluginLanguage({ vault: { getConfig: () => "en-US" } }), "en");
assert.equal(getInitialPluginLanguage({ vault: {}, locale: "zh-TW" }), "zh-CN");

console.log("i18n tests passed");
