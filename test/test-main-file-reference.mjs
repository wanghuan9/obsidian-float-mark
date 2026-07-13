import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("src/main.ts", "utf8");

function readMethod(methodName) {
	const start = source.indexOf(`private ${methodName}`);
	const end = source.indexOf("\n\tprivate ", start + 1);
	return source.slice(start, end);
}

const methodStart = source.indexOf("private deleteRemoteCommentReplyInBackground");
const methodEnd = source.indexOf("\n\tprivate ", methodStart + 1);
const method = source.slice(methodStart, methodEnd);

assert.match(source, /deleteRemoteCommentReplyInBackground\(file, mark, replyId\)/);
assert.match(method, /deleteRemoteCommentReplyInBackground\(file: TFile,/);
const remoteAwaitIndex = method.indexOf("await deleteLarkCommentReply");
const membershipCheckIndex = method.indexOf("this.app.vault.getFileByPath(file.path)");
const updateIndex = method.indexOf("this.store.updateMark(file.path");
assert.ok(remoteAwaitIndex < membershipCheckIndex);
assert.ok(membershipCheckIndex < updateIndex);
assert.match(method, /currentFile instanceof TFile/);
assert.match(method, /currentFile !== file/);
assert.match(method, /currentFile\.extension !== "md"/);
assert.match(method, /this\.currentDocument\?\.filePath === file\.path/);

const updateReadingSelectionMethod = readMethod("updateReadingSelectionToolbar");
const readingToolbarActionMethod = readMethod("async handleReadingToolbarAction");
const unresolvedReadingSelectionMethod = readMethod("showUnresolvedReadingSelection");
const editorStylePopoverMethod = readMethod("showMarkStylePopoverForView");
const readingStylePopoverMethod = readMethod("showMarkStylePopoverForReadingSelection");
const newMarkStylePopoverMethod = readMethod("showMarkStylePopoverForNewMark");
const createReadingMarkMethod = readMethod("async createReadingMark");
const createMarkFromOffsetsMethod = readMethod("async createMarkFromOffsets");
const refreshMarkViewsMethod = readMethod("async refreshMarkViews");
const renderPreviewMarksForFileMethod = readMethod("async renderPreviewMarksForFile");
const renderPreviewMarksForViewMethod = readMethod("async renderPreviewMarksForView");
assert.doesNotMatch(updateReadingSelectionMethod, /new Notice\(this\.t\("notice\.readingSelectionUnresolved"\)\)/);
assert.doesNotMatch(updateReadingSelectionMethod, /this\.app\.vault\.read/);
assert.match(updateReadingSelectionMethod, /const source = view\.data/);
assert.match(updateReadingSelectionMethod, /this\.showUnresolvedReadingSelection\(rect,/);
assert.match(unresolvedReadingSelectionMethod, /this\.readingSelectionUnresolved = true/);
assert.match(unresolvedReadingSelectionMethod, /this\.readingToolbar\.show\(rect, boundary\)/);
assert.match(readingToolbarActionMethod, /new Notice\(this\.t\("notice\.readingSelectionUnresolved"\)\)/);
assert.match(editorStylePopoverMethod, /this\.showMarkStylePopoverForNewMark\(popoverRect,/);
assert.match(readingStylePopoverMethod, /this\.showMarkStylePopoverForNewMark\(selection\.rect,/);
assert.match(newMarkStylePopoverMethod, /let latestChoice = defaultHighlightAppearance\(\)/);
assert.match(newMarkStylePopoverMethod, /if \(createPromise\) \{\s*return;/);
assert.match(newMarkStylePopoverMethod, /resetRequested = true/);
assert.match(newMarkStylePopoverMethod, /if \(resetRequested\) \{\s*await this\.deleteMark\(markId\)/);
assert.match(newMarkStylePopoverMethod, /isSameHighlightAppearance\(createdChoice, latestChoice\)/);
assert.match(createReadingMarkMethod, /await this\.refreshMarkViews\(selection\.file\.path\)/);
assert.match(createMarkFromOffsetsMethod, /await this\.refreshMarkViews\(file\.path\)/);
assert.match(refreshMarkViewsMethod, /await Promise\.all\(\[\s*this\.refreshSidebar\(\),\s*this\.renderPreviewMarksForFile\(filePath, document\)\s*\]\)/);
assert.match(renderPreviewMarksForFileMethod, /await Promise\.all\(renders\)/);
assert.match(
	renderPreviewMarksForViewMethod,
	/const source = document\?\.filePath === filePath\s*\? view\.data\s*: await this\.app\.vault\.read\(file\)/
);
assert.match(
	renderPreviewMarksForViewMethod,
	/document\?\.filePath === filePath\s*\? document\s*: await this\.store\.relocateDocument\(filePath, source\)/
);

async function writeAfterRemote(file, vaultFiles, remote, writtenPaths) {
	await remote;
	const currentFile = vaultFiles.get(file.path);
	if (currentFile !== file || currentFile.extension !== "md") {
		return;
	}
	writtenPaths.push(file.path);
}

function createDeferred() {
	let resolve;
	const promise = new Promise((complete) => {
		resolve = complete;
	});
	return { promise, resolve };
}

const renameRemote = createDeferred();
const renamedFile = { path: "old.md", extension: "md" };
const renameVaultFiles = new Map([[renamedFile.path, renamedFile]]);
const renamedWrittenPaths = [];
const renameWrite = writeAfterRemote(renamedFile, renameVaultFiles, renameRemote.promise, renamedWrittenPaths);
renameVaultFiles.delete(renamedFile.path);
renamedFile.path = "renamed.md";
renameVaultFiles.set(renamedFile.path, renamedFile);
renameRemote.resolve();
await renameWrite;
assert.deepEqual(renamedWrittenPaths, ["renamed.md"]);

const deleteRemote = createDeferred();
const deletedFile = { path: "deleted.md", extension: "md" };
const deleteVaultFiles = new Map([[deletedFile.path, deletedFile]]);
const deletedWrittenPaths = [];
const deleteWrite = writeAfterRemote(deletedFile, deleteVaultFiles, deleteRemote.promise, deletedWrittenPaths);
deleteVaultFiles.delete(deletedFile.path);
deleteRemote.resolve();
await deleteWrite;
assert.deepEqual(deletedWrittenPaths, []);
console.log("main file reference tests passed");
