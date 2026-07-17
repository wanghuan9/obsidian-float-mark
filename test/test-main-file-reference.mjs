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
const editorCommentPopoverMethod = readMethod("showCommentPopover");
const editorStylePopoverMethod = readMethod("showMarkStylePopoverForView");
const readingStylePopoverMethod = readMethod("showMarkStylePopoverForReadingSelection");
const newMarkStylePopoverMethod = readMethod("showMarkStylePopoverForNewMark");
const createReadingMarkMethod = readMethod("async createReadingMark");
const createMarkFromOffsetsMethod = readMethod("async createMarkFromOffsets");
const refreshMarkViewsMethod = readMethod("async refreshMarkViews");
const renderReadingModeMarksMethod = readMethod("async renderReadingModeMarks");
const getReadingRenderSnapshotMethod = readMethod("getReadingRenderSnapshot");
const loadReadingRenderSnapshotMethod = readMethod("async loadReadingRenderSnapshot");
const invalidateReadingRenderSnapshotMethod = readMethod("invalidateReadingRenderSnapshot");
const renderPreviewMarksForFileMethod = readMethod("async renderPreviewMarksForFile");
const renderPreviewMarksForViewMethod = readMethod("async renderPreviewMarksForView");
const getPreviewSectionsToRenderMethod = readMethod("getPreviewSectionsToRender");
const jumpToReadingMarkMethod = readMethod("jumpToReadingMark");
const findReadingMarkElementsMethod = readMethod("findReadingMarkElements");
const scheduleEditorDocumentSaveMethod = readMethod("scheduleEditorDocumentSave");
const scheduleEditorDocumentSaveTimerMethod = readMethod("scheduleEditorDocumentSaveTimer");
const saveEditorMarkAnchorsMethod = readMethod("async saveEditorMarkAnchors");
const handleMarkdownRenameMethod = readMethod("async handleMarkdownRename");
const handleMarkdownDeleteMethod = readMethod("async handleMarkdownDelete");
assert.doesNotMatch(updateReadingSelectionMethod, /new Notice\(this\.t\("notice\.readingSelectionUnresolved"\)\)/);
assert.doesNotMatch(updateReadingSelectionMethod, /this\.app\.vault\.read/);
assert.match(updateReadingSelectionMethod, /const source = view\.data/);
assert.match(updateReadingSelectionMethod, /this\.showUnresolvedReadingSelection\(rect,/);
assert.match(updateReadingSelectionMethod, /findSourceRangeForReadingTableSelection\(/);
assert.match(updateReadingSelectionMethod, /tableSourceRange === undefined\s*\? findSourceRangeForReadingSelection\(/);
assert.match(unresolvedReadingSelectionMethod, /this\.readingSelectionUnresolved = true/);
assert.match(unresolvedReadingSelectionMethod, /this\.readingToolbar\.show\(rect, boundary\)/);
assert.match(readingToolbarActionMethod, /new Notice\(this\.t\("notice\.readingSelectionUnresolved"\)\)/);
assert.match(readingToolbarActionMethod, /getReadingSelectionRect\(selection\.range, "end"\) \|\| selection\.rect/);
assert.match(editorCommentPopoverMethod, /getEditorSelectionRect\(view, "end"\)/);
assert.match(editorStylePopoverMethod, /this\.showMarkStylePopoverForNewMark\(popoverRect,/);
assert.match(editorStylePopoverMethod, /getEditorSelectionRect\(view, "end"\)/);
assert.match(readingStylePopoverMethod, /getReadingSelectionRect\(selection\.range, "end"\) \|\| selection\.rect/);
assert.match(readingStylePopoverMethod, /this\.showMarkStylePopoverForNewMark\(popoverRect,/);
assert.match(newMarkStylePopoverMethod, /let latestChoice = defaultHighlightAppearance\(\)/);
assert.match(newMarkStylePopoverMethod, /if \(createPromise\) \{\s*return;/);
assert.match(newMarkStylePopoverMethod, /resetRequested = true/);
assert.match(newMarkStylePopoverMethod, /if \(resetRequested\) \{\s*await this\.deleteMark\(markId\)/);
assert.match(newMarkStylePopoverMethod, /isSameHighlightAppearance\(createdChoice, latestChoice\)/);
assert.match(createReadingMarkMethod, /await this\.refreshMarkViews\(selection\.file\.path, createdMark\)/);
assert.match(createMarkFromOffsetsMethod, /await this\.refreshMarkViews\(file\.path, createdMark\)/);
assert.equal((source.match(/await this\.refreshMarkViews\(file\.path, mark\)/g) || []).length, 7);
assert.match(source, /interface ReadingRenderSnapshot \{/);
assert.match(source, /interface ReadingRenderSnapshotLoad \{/);
assert.match(source, /readingRenderSnapshots = new Map<string, ReadingRenderSnapshotLoad>\(\)/);
assert.match(
	renderReadingModeMarksMethod,
	/const \{ source, document, lineStarts \} = await this\.getReadingRenderSnapshot\(file\)/
);
assert.doesNotMatch(renderReadingModeMarksMethod, /this\.app\.vault\.read/);
assert.doesNotMatch(renderReadingModeMarksMethod, /this\.store\.relocateDocument/);
assert.doesNotMatch(renderReadingModeMarksMethod, /this\.getSourceLineStarts/);
assert.match(renderReadingModeMarksMethod, /tableSourceRange: getReadingSectionSourceRange/);
assert.match(getReadingRenderSnapshotMethod, /const sourceVersion = `\$\{file\.stat\.mtime\}:\$\{file\.stat\.size\}`/);
assert.match(getReadingRenderSnapshotMethod, /const storeRevision = this\.store\.getRevision\(\)/);
assert.match(
	getReadingRenderSnapshotMethod,
	/cached\?\.sourceVersion === sourceVersion\s*&& cached\.storeRevision === storeRevision/
);
assert.match(getReadingRenderSnapshotMethod, /return cached\.load/);
assert.match(getReadingRenderSnapshotMethod, /entry\.storeRevision = this\.store\.getRevision\(\)/);
assert.match(getReadingRenderSnapshotMethod, /this\.readingRenderSnapshots\.delete\(file\.path\)/);
assert.match(loadReadingRenderSnapshotMethod, /const source = await this\.app\.vault\.read\(file\)/);
assert.match(loadReadingRenderSnapshotMethod, /const document = await this\.store\.relocateDocument\(file\.path, source\)/);
assert.match(loadReadingRenderSnapshotMethod, /const lineStarts = this\.getSourceLineStarts\(file, source\)/);
assert.match(loadReadingRenderSnapshotMethod, /return \{ source, document, lineStarts \}/);
assert.match(invalidateReadingRenderSnapshotMethod, /this\.readingRenderSnapshots\.delete\(filePath\)/);
assert.match(source, /vault\.on\("modify", \(file\) => \{\s*if \(file instanceof TFile && file\.extension === "md"\) \{\s*this\.invalidateReadingRenderSnapshot\(file\.path\)/);
assert.match(source, /vault\.on\("rename", \(file, oldPath\) => \{\s*if \(file instanceof TFile && file\.extension === "md"\) \{\s*this\.invalidateReadingRenderSnapshot\(oldPath\);\s*this\.invalidateReadingRenderSnapshot\(file\.path\)/);
assert.match(source, /vault\.on\("delete", \(file\) => \{\s*if \(file instanceof TFile && file\.extension === "md"\) \{\s*this\.invalidateReadingRenderSnapshot\(file\.path\)/);
assert.match(source, /onunload\(\): void \{\s*this\.clearPreviewMarkObservers\(\);\s*this\.readingRenderSnapshots\.clear\(\)/);
assert.match(refreshMarkViewsMethod, /this\.invalidateReadingRenderSnapshot\(filePath\)/);
assert.match(refreshMarkViewsMethod, /async refreshMarkViews\(filePath: string, affectedMark\?: SideMark\)/);
assert.match(
	refreshMarkViewsMethod,
	/await Promise\.all\(\[\s*this\.renderPreviewMarksForFile\(filePath, document, affectedMark\),\s*this\.refreshSidebar\(\)\s*\]\)/
);
assert.match(renderPreviewMarksForFileMethod, /affectedMark\?: SideMark/);
assert.match(renderPreviewMarksForFileMethod, /renderPreviewMarksForView\(view, generation, document, affectedMark\)/);
assert.match(renderPreviewMarksForFileMethod, /await Promise\.all\(renders\)/);
assert.match(
	renderPreviewMarksForViewMethod,
	/const source = document\?\.filePath === filePath\s*\? view\.data\s*: await this\.app\.vault\.read\(file\)/
);
assert.match(
	renderPreviewMarksForViewMethod,
	/document\?\.filePath === filePath\s*\? document\s*: await this\.store\.relocateDocument\(filePath, source\)/
);
assert.match(renderPreviewMarksForViewMethod, /affectedMark\?: SideMark/);
assert.match(
	renderPreviewMarksForViewMethod,
	/const sectionsToRender = this\.getPreviewSectionsToRender\(source, sections, lineStarts, affectedMark\)/
);
assert.match(
	getPreviewSectionsToRenderMethod,
	/const affectedSections = sections\.filter\(\(section\) => getReadingMarksForSection\(\s*source,\s*\[affectedMark\],\s*section\.lineStart,\s*section\.lineEnd,\s*lineStarts\s*\)\.length > 0\)/
);
assert.match(
	getPreviewSectionsToRenderMethod,
	/if \(!affectedMark\) \{\s*return sections;/
);
assert.match(
	getPreviewSectionsToRenderMethod,
	/return affectedSections\.length > 0 \? affectedSections : sections/
);
assert.match(
	renderPreviewMarksForViewMethod,
	/for \(const section of sectionsToRender\) \{[\s\S]*getReadingMarksForSection\(\s*source,\s*resolvedDocument\.marks,/
);
assert.match(renderPreviewMarksForViewMethod, /tableSourceRange: getReadingSectionSourceRange/);
assert.match(source, /editorDocumentSaveTimers = new Map<string, number>\(\)/);
assert.match(source, /pendingEditorAnchorUpdatesByFile = new Map<string, Map<string, MarkAnchorUpdate>>\(\)/);
assert.match(scheduleEditorDocumentSaveMethod, /this\.pendingEditorAnchorUpdatesByFile\.get\(filePath\)/);
assert.match(scheduleEditorDocumentSaveTimerMethod, /this\.editorDocumentSaveTimers\.set\(filePath,/);
assert.match(handleMarkdownRenameMethod, /this\.migratePendingEditorAnchorUpdates\(oldFilePath, newFilePath\)/);
assert.match(handleMarkdownDeleteMethod, /this\.discardPendingEditorAnchorUpdates\(filePath\)/);
assert.match(source, /onunload\(\): void \{[\s\S]*this\.flushPendingEditorAnchorUpdates\(\)/);
assert.match(saveEditorMarkAnchorsMethod, /const result = await this\.store\.updateMarkAnchors\(filePath, updates\)/);
assert.match(saveEditorMarkAnchorsMethod, /if \(!result\.changed\) \{\s*return;/);
assert.match(saveEditorMarkAnchorsMethod, /if \(result\.statusChanged\) \{\s*refreshes\.push\(this\.refreshSidebar\(\)\)/);
assert.match(
	saveEditorMarkAnchorsMethod,
	/this\.currentDocument\?\.filePath === filePath\s*\? this\.currentDocument\s*: result\.document/
);
assert.doesNotMatch(renderPreviewMarksForViewMethod, /renderReadingMarks\([^\n]*\[\]/);
assert.match(source, /import \{[^}]*getReadingMarkElements[^}]*\} from "\.\/reading-view-renderer"/s);
assert.match(findReadingMarkElementsMethod, /getReadingMarkElements\(view\.contentEl, markId\)/);
assert.match(findReadingMarkElementsMethod, /void this\.app\.workspace\.revealLeaf\(leaf\)/);
assert.match(jumpToReadingMarkMethod, /const markEls = this\.findReadingMarkElements\(markId, mark\.filePath\)/);
assert.match(jumpToReadingMarkMethod, /markEls\[0\]\.scrollIntoView/);
assert.match(
	jumpToReadingMarkMethod,
	/for \(const markEl of markEls\) \{\s*markEl\.addClass\("side-mark-reading-flash"\)/
);
assert.match(
	jumpToReadingMarkMethod,
	/for \(const markEl of markEls\) \{\s*markEl\.removeClass\("side-mark-reading-flash"\)/
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
