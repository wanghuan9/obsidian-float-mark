import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import esbuild from "esbuild";
import { JSDOM } from "jsdom";

await mkdir("test/.tmp", { recursive: true });
await esbuild.build({
	entryPoints: ["src/sidebar-logic.ts", "src/navigation-guard.ts", "src/types.ts"],
	bundle: true,
	format: "esm",
	platform: "browser",
	outdir: "test/.tmp"
});

const {
	bindVaultCardNavigation,
	filterVaultDocuments,
	sortMarksByCreatedAt,
	summarizeVaultDocuments,
	toggleSidebarScope
} = await import("./.tmp/sidebar-logic.js");
const { NavigationGuard } = await import("./.tmp/navigation-guard.js");
const { normalizeScopeControlStyle } = await import("./.tmp/types.js");

assert.equal(normalizeScopeControlStyle(undefined), "dropdown");
assert.equal(normalizeScopeControlStyle("tabs"), "tabs");
assert.equal(normalizeScopeControlStyle("dropdown"), "dropdown");
assert.equal(normalizeScopeControlStyle("swap"), "swap");
assert.equal(normalizeScopeControlStyle("switch"), "switch");
assert.equal(normalizeScopeControlStyle("unknown"), "dropdown");
assert.equal(toggleSidebarScope("current"), "vault");
assert.equal(toggleSidebarScope("vault"), "current");

function createMark(
	id,
	kind,
	selectedText,
	note,
	replies = [],
	status = "active",
	color = "yellow",
	createdAt = "2026-07-13T00:00:00.000Z"
) {
	return {
		id,
		filePath: "",
		anchor: { selectedText },
		mark: { kind, color },
		note: { content: note, createdAt, updatedAt: createdAt },
		replies,
		status
	};
}

const createdThird = createMark(
	"third",
	"highlight",
	"third",
	"",
	[],
	"active",
	"yellow",
	"2026-07-13T00:00:03.000Z"
);
const createdFirst = createMark(
	"first",
	"highlight",
	"first",
	"",
	[],
	"active",
	"yellow",
	"2026-07-13T00:00:01.000Z"
);
const createdSecond = createMark(
	"second",
	"highlight",
	"second",
	"",
	[],
	"active",
	"yellow",
	"2026-07-13T00:00:02.000Z"
);
const storedOrderMarks = [createdThird, createdFirst, createdSecond];
assert.deepEqual(sortMarksByCreatedAt(storedOrderMarks).map((mark) => mark.id), ["first", "second", "third"]);
assert.deepEqual(storedOrderMarks.map((mark) => mark.id), ["third", "first", "second"]);

const sameTimeMarks = [
	createMark("same-a", "comment", "same-a", "", [], "active", "yellow", "2026-07-13T00:00:00.000Z"),
	createMark("same-b", "comment", "same-b", "", [], "active", "yellow", "2026-07-13T00:00:00.000Z")
];
assert.deepEqual(sortMarksByCreatedAt(sameTimeMarks).map((mark) => mark.id), ["same-a", "same-b"]);

const invalidTimeMarks = [
	createMark("legacy-a", "comment", "legacy-a", "", [], "active", "yellow", ""),
	createMark("legacy-b", "comment", "legacy-b", "", [], "active", "yellow", "invalid")
];
assert.deepEqual(sortMarksByCreatedAt(invalidTimeMarks).map((mark) => mark.id), ["legacy-a", "legacy-b"]);

const documents = [
	{
		filePath: "Projects/Zeta.md",
		marks: [
			createMark("reference", "comment", "reference needle", "plain", [], "active", "blue"),
			createMark("note", "comment", "plain", "note needle", [], "resolved", "yellow"),
			createMark("reply", "comment", "plain", "plain", [{ content: "reply needle" }], "active", "red")
		]
	},
	{
		filePath: "Archive/Alpha.md",
		marks: [createMark("mark", "highlight", "highlight needle", "memo", [], "active", "green")]
	}
];
const options = { tab: "comments", status: "all", color: "all", query: "projects/zeta" };
const pathGroups = filterVaultDocuments(documents, options);
assert.deepEqual(pathGroups.map((group) => group.filePath), ["Projects/Zeta.md"]);
assert.deepEqual(pathGroups[0].marks.map((mark) => mark.id), ["reference", "note", "reply"]);

for (const [query, expectedId] of [
	["reference needle", "reference"],
	["note needle", "note"],
	["reply needle", "reply"]
]) {
	const groups = filterVaultDocuments(documents, { ...options, query });
	assert.deepEqual(groups.flatMap((group) => group.marks.map((mark) => mark.id)), [expectedId]);
}

const resolved = filterVaultDocuments(documents, { ...options, query: "", status: "resolved" });
assert.deepEqual(resolved.flatMap((group) => group.marks.map((mark) => mark.id)), ["note"]);
const blue = filterVaultDocuments(documents, { ...options, query: "", color: "blue" });
assert.deepEqual(blue.flatMap((group) => group.marks.map((mark) => mark.id)), ["reference"]);
const marks = filterVaultDocuments(documents, { ...options, tab: "marks", query: "", color: "red" });
assert.deepEqual(marks.flatMap((group) => group.marks.map((mark) => mark.id)), ["mark"]);

const orderedVaultGroups = filterVaultDocuments([{
	filePath: "Ordered.md",
	marks: storedOrderMarks
}], { ...options, tab: "marks", query: "" });
assert.deepEqual(orderedVaultGroups[0].marks.map((mark) => mark.id), ["first", "second", "third"]);

const allDocuments = [documents[0], documents[1], {
	filePath: "Aardvark.md",
	marks: [createMark("first", "comment", "plain", "plain")]
}];
const summary = summarizeVaultDocuments(allDocuments, { ...options, query: "" });
assert.deepEqual(summary.groups.map((group) => group.filePath), ["Aardvark.md", "Projects/Zeta.md"]);
assert.deepEqual(summary.counts, { comments: 4, marks: 1 });

const noMatches = filterVaultDocuments(documents, { ...options, query: "missing" });
assert.deepEqual(noMatches, [], "groups without matching marks must be removed");

const dom = new JSDOM("<div id=card></div>");
const card = dom.window.document.querySelector("#card");
let navigationCount = 0;
bindVaultCardNavigation(card, "Locate mark", () => navigationCount++);
assert.equal(card.getAttribute("role"), "button");
assert.equal(card.tabIndex, 0);
assert.equal(card.getAttribute("aria-label"), "Locate mark");
card.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
card.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
const spaceHandled = !card.dispatchEvent(new dom.window.KeyboardEvent("keydown", {
	key: " ",
	bubbles: true,
	cancelable: true
}));
card.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
assert.equal(navigationCount, 3);
assert.equal(spaceHandled, true, "Space must prevent its default scrolling behavior");

const navigationGuard = new NavigationGuard();
const fileA = { path: "A.md" };
const fileB = { path: "B.md" };
let vaultFileA = fileA;
let vaultFileB = fileB;
const commits = [];
let resolveA;
let resolveB;
const waitA = new Promise((resolve) => { resolveA = resolve; });
const waitB = new Promise((resolve) => { resolveB = resolve; });
async function navigate(filePath, file, wait, getVaultFile) {
	const generation = navigationGuard.begin();
	await wait;
	if (navigationGuard.isCurrent(generation, filePath, file, getVaultFile(), file)) {
		commits.push(filePath);
	}
}
const navigationA = navigate("A.md", fileA, waitA, () => vaultFileA);
const navigationB = navigate("B.md", fileB, waitB, () => vaultFileB);
resolveB();
await navigationB;
resolveA();
await navigationA;
assert.deepEqual(commits, ["B.md"], "a slower older navigation must not commit after a newer one");

const switchedGeneration = navigationGuard.begin();
vaultFileA = fileA;
assert.equal(navigationGuard.isCurrent(switchedGeneration, "A.md", fileA, vaultFileA, fileB), false);
assert.equal(navigationGuard.isCurrent(switchedGeneration, "A.md", fileA, vaultFileA, fileA, fileB), false);
assert.equal(navigationGuard.isCurrent(switchedGeneration, "A.md", fileA, vaultFileA, fileA, fileA), true);
vaultFileB = { path: "B.md" };
assert.equal(navigationGuard.isCurrent(switchedGeneration, "B.md", fileB, vaultFileB, fileB), false);
const renamedFile = { path: "Original.md" };
const renameGeneration = navigationGuard.begin();
renamedFile.path = "Renamed.md";
assert.equal(navigationGuard.isCurrent(renameGeneration, "Original.md", renamedFile, renamedFile, renamedFile), false);

const currentNavigationGuard = new NavigationGuard();
const currentGeneration = currentNavigationGuard.begin();
let resolveModeChange;
const modeChange = new Promise((resolve) => { resolveModeChange = resolve; });
const currentNavigation = (async () => {
	await modeChange;
	return currentNavigationGuard.isCurrent(currentGeneration, "A.md", fileA, fileA, fileA, fileA);
})();
currentNavigationGuard.begin();
resolveModeChange();
assert.equal(await currentNavigation, false, "a vault navigation must cancel current navigation during mode change");

const sidebarSource = await readFile("src/sidebar-view.ts", "utf8");
const vaultCardSource = sidebarSource.match(/private renderVaultCard[\s\S]*?\n\t}\n\n\tprivate renderTabs/)?.[0] || "";
assert.match(vaultCardSource, /jumpToDocumentMark/);
for (const writeEntry of [
	"renderCardToolbar",
	"renderThread",
	"renderReplyComposer",
	"renderColorPicker",
	"toggleResolved",
	"syncMark",
	"deleteMark"
]) {
	assert.doesNotMatch(vaultCardSource, new RegExp(writeEntry), `vault cards must not call ${writeEntry}`);
}
assert.match(sidebarSource, /const generation = \+\+this\.renderGeneration/);
assert.match(sidebarSource, /generation !== this\.renderGeneration \|\| this\.viewScope !== "vault"/);
assert.match(sidebarSource, /case "dropdown":/);
assert.match(sidebarSource, /case "swap":/);
assert.match(sidebarSource, /case "switch":/);
assert.match(sidebarSource, /new Menu\(\)/);
assert.match(sidebarSource, /private setViewScope/);
assert.match(sidebarSource, /private toggleViewScope/);
assert.match(sidebarSource, /private renderScopeSwap/);
assert.match(sidebarSource, /private renderScopeSwitch/);
assert.match(sidebarSource, /"role": "switch"/);
assert.match(sidebarSource, /private restoreScopeFocus/);
assert.match(sidebarSource, /data-side-mark-scope-control/);
assert.match(sidebarSource, /showAtPosition/);
assert.match(sidebarSource, /aria-expanded/);
assert.match(sidebarSource, /return sortMarksByCreatedAt\(marks\.filter/);
assert.match(sidebarSource, /RETROMA_THEME_PROPERTY = "--retroma-folder-bg-color"/);
assert.match(sidebarSource, /this\.app\.workspace\.on\("css-change"/);
assert.match(sidebarSource, /this\.contentEl\.toggleClass\(RETROMA_THEME_CLASS/);

const typesSource = await readFile("src/types.ts", "utf8");
assert.match(typesSource, /scopeControlStyle: "dropdown"/);

const stylesSource = await readFile("styles.css", "utf8");
const switchFocusStyles = stylesSource.match(/\.side-mark-sidebar button\.side-mark-sidebar-scope-switch:focus-visible \{[\s\S]*?\n\}/)?.[0] || "";
assert.match(switchFocusStyles, /outline: none/);

const mainSource = await readFile("src/main.ts", "utf8");
const jumpSource = mainSource.match(/async jumpToDocumentMark[\s\S]*?\n\t}\n\n\tprivate isCurrentDocumentMarkNavigation/)?.[0] || "";
assert.match(jumpSource, /file instanceof TFile/);
assert.match(jumpSource, /notice\.markFileUnavailable/);
assert.match(jumpSource, /document\.marks\.find/);
assert.match(jumpSource, /notice\.markUnavailable/);
assert.match(mainSource, /await this\.app\.workspace\.revealLeaf\(leaf\)/);
assert.match(mainSource, /settings\.scopeControlStyle\.name/);
assert.match(mainSource, /setScopeControlStyle/);
assert.match(mainSource, /for \(const leaf of this\.app\.workspace\.getLeavesOfType\(SIDE_MARK_VIEW_TYPE\)\)/);

console.log("sidebar vault tests passed");
