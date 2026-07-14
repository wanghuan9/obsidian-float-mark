import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import esbuild from "esbuild";

await mkdir("test/.tmp", { recursive: true });
await esbuild.build({
	entryPoints: ["src/storage.ts"],
	bundle: true,
	format: "esm",
	platform: "node",
	outfile: "test/.tmp/storage.mjs",
	plugins: [{
		name: "obsidian-stub",
		setup(build) {
			build.onResolve({ filter: /^obsidian$/ }, () => ({ path: "obsidian", namespace: "obsidian-stub" }));
			build.onLoad({ filter: /.*/, namespace: "obsidian-stub" }, () => ({
				contents: `
					export function normalizePath(value) {
						return value.replace(/\\\\/g, "/").replace(/\\/{2,}/g, "/").replace(/^\\.\\//, "");
					}
				`
			}));
		}
	}]
});

const { SideMarkStore, hashPath } = await import("./.tmp/storage.mjs");

class MemoryAdapter {
	files = new Map();
	directories = new Set();
	listCount = 0;
	readCount = 0;
	writeCount = 0;

	async exists(path) {
		return this.files.has(path) || this.directories.has(path);
	}

	async list(path) {
		this.listCount += 1;
		const prefix = `${path}/`;
		const files = [...this.files.keys()].filter((filePath) => {
			if (!filePath.startsWith(prefix)) {
				return false;
			}
			return !filePath.slice(prefix.length).includes("/");
		});
		return { files, folders: [] };
	}

	async read(path) {
		this.readCount += 1;
		const value = this.files.get(path);
		if (value === undefined) {
			throw new Error(`Missing file: ${path}`);
		}
		return value;
	}

	async write(path, value) {
		this.writeCount += 1;
		this.files.set(path, value);
	}

	async mkdir(path) {
		this.directories.add(path);
	}

	async remove(path) {
		this.files.delete(path);
	}
}

class ControlledAdapter extends MemoryAdapter {
	readGates = new Map();
	writeGates = new Map();

	blockNextRead(path) {
		const entered = createDeferred();
		const release = createDeferred();
		this.readGates.set(path, { entered, release });
		return {
			entered: entered.promise,
			release: () => release.resolve()
		};
	}

	blockNextWrite(path) {
		const entered = createDeferred();
		const release = createDeferred();
		this.writeGates.set(path, { entered, release });
		return {
			entered: entered.promise,
			release: () => release.resolve()
		};
	}

	async read(path) {
		const gate = this.readGates.get(path);
		if (gate) {
			this.readGates.delete(path);
			gate.entered.resolve();
			await gate.release.promise;
		}
		return super.read(path);
	}

	async write(path, value) {
		const gate = this.writeGates.get(path);
		if (gate) {
			this.writeGates.delete(path);
			gate.entered.resolve();
			await gate.release.promise;
		}
		await super.write(path, value);
	}
}

class ReadConcurrencyAdapter extends MemoryAdapter {
	activeReads = 0;
	maxActiveReads = 0;

	async read(path) {
		this.activeReads += 1;
		this.maxActiveReads = Math.max(this.maxActiveReads, this.activeReads);
		await Promise.resolve();
		try {
			return await super.read(path);
		} finally {
			this.activeReads -= 1;
		}
	}
}

function createDeferred() {
	let resolve;
	const promise = new Promise((complete) => {
		resolve = complete;
	});
	return { promise, resolve };
}

function createMark(id, filePath, kind = "highlight") {
	return {
		id,
		filePath,
		anchor: {
			startOffset: 0,
			endOffset: 4,
			selectedText: "text",
			prefix: "",
			suffix: "",
			position: { lineStart: 1, lineEnd: 1, columnStart: 1, columnEnd: 5 }
		},
		mark: {
			kind,
			color: "yellow",
			textColor: "default",
			backgroundColor: "yellow-light"
		},
		note: {
			content: kind === "comment" ? "legacy comment" : "",
			createdAt: "2026-07-12T00:00:00.000Z",
			updatedAt: "2026-07-12T00:00:00.000Z"
		},
		status: "active"
	};
}

function createDocument(filePath, marks = [createMark(filePath, filePath)]) {
	return {
		schemaVersion: 1,
		filePath,
		updatedAt: "2026-07-12T00:00:00.000Z",
		marks
	};
}

function createStore(adapter, dataDir = ".obsidian-float-marks") {
	return new SideMarkStore({ vault: { adapter } }, {
		dataDir,
		language: "zh-CN",
		autoOpenSidebar: true,
		autoSyncToLark: false,
		preferBodyBlockForLark: false,
		commentAuthorName: "我"
	});
}

function getSidecarPath(dataDir, filePath) {
	return `${dataDir}/files/${hashPath(filePath)}.json`;
}

function seedDocument(adapter, dataDir, document) {
	const filesDir = `${dataDir}/files`;
	adapter.directories.add(filesDir);
	adapter.files.set(getSidecarPath(dataDir, document.filePath), JSON.stringify(document));
}

const emptyAdapter = new MemoryAdapter();
const emptyStore = createStore(emptyAdapter);
assert.deepEqual(await emptyStore.loadAllDocuments(), []);
assert.equal(emptyAdapter.listCount, 0);

const adapter = new MemoryAdapter();
const dataDir = ".custom-float-marks";
const filesDir = `${dataDir}/files`;
adapter.directories.add(filesDir);
adapter.files.set(`${filesDir}/b.json`, JSON.stringify(createDocument("folder/b.md")));
adapter.files.set(`${filesDir}/a.json`, JSON.stringify(createDocument("a.md", [createMark("legacy", "stale.md", "comment")])));
adapter.files.set(`${filesDir}/broken.json`, "{broken");
adapter.files.set(`${filesDir}/missing-path.json`, JSON.stringify({ schemaVersion: 1, marks: [] }));
adapter.files.set(`${filesDir}/ignore.txt`, JSON.stringify(createDocument("ignore.md")));

const store = createStore(adapter, dataDir);
const originalWarn = console.warn;
const warnings = [];
console.warn = (...values) => warnings.push(values.join(" "));
const documents = await store.loadAllDocuments();

assert.deepEqual(documents.map((document) => document.filePath), ["a.md", "folder/b.md"]);
assert.equal(documents[0].marks[0].filePath, "a.md");
assert.equal(documents[0].marks[0].replies.length, 1);
assert.equal(documents[0].marks[0].replies[0].content, "legacy comment");
assert.equal(warnings.length, 2);
assert.equal(adapter.listCount, 1);
assert.equal(adapter.readCount, 4);
adapter.files.delete(`${filesDir}/broken.json`);
adapter.files.delete(`${filesDir}/missing-path.json`);

await store.loadAllDocuments();
assert.equal(adapter.listCount, 1);
assert.equal(adapter.readCount, 4);

await store.saveDocument(createDocument("new.md"));
const documentsAfterSave = await store.loadAllDocuments();
assert.equal(adapter.listCount, 1);
assert.equal(adapter.readCount, 4);
assert.deepEqual(documentsAfterSave.map((document) => document.filePath), ["a.md", "folder/b.md", "new.md"]);

const anchorMergeAdapter = new MemoryAdapter();
const anchorMergeStore = createStore(anchorMergeAdapter);
const currentTrackedMark = {
	...createMark("tracked", "merge.md"),
	mark: {
		kind: "comment",
		color: "blue",
		textColor: "green",
		backgroundColor: "blue-light"
	},
	note: {
		content: "new note",
		createdAt: "2026-07-12T00:00:00.000Z",
		updatedAt: "2026-07-13T00:00:00.000Z"
	},
	remote: {
		status: "synced",
		larkCommentId: "comment-1"
	}
};
const currentNewMark = createMark("new-mark", "merge.md");
await anchorMergeStore.saveDocument(createDocument("merge.md", [currentTrackedMark, currentNewMark]));
const staleAnchorUpdate = {
	...currentTrackedMark.anchor,
	startOffset: 12,
	endOffset: 16,
	position: { lineStart: 2, lineEnd: 2, columnStart: 3, columnEnd: 7 }
};
const statusChangeResult = await anchorMergeStore.updateMarkAnchors("merge.md", [{
	id: "tracked",
	anchor: staleAnchorUpdate,
	expectedStatus: "active",
	status: "orphaned"
}]);
assert.equal(statusChangeResult.changed, true);
assert.equal(statusChangeResult.statusChanged, true);
const anchorMergedDocument = await anchorMergeStore.loadDocument("merge.md");
const anchorMergedMark = anchorMergedDocument.marks.find((mark) => mark.id === "tracked");
assert.deepEqual(anchorMergedDocument.marks.map((mark) => mark.id), ["new-mark", "tracked"]);
assert.deepEqual(anchorMergedMark.anchor, staleAnchorUpdate);
assert.equal(anchorMergedMark.status, "orphaned");
assert.deepEqual(anchorMergedMark.mark, currentTrackedMark.mark);
assert.deepEqual(anchorMergedMark.note, currentTrackedMark.note);
assert.deepEqual(anchorMergedMark.remote, currentTrackedMark.remote);

const offsetOnlyAnchorUpdate = {
	...staleAnchorUpdate,
	startOffset: 14,
	endOffset: 18,
	position: { lineStart: 2, lineEnd: 2, columnStart: 5, columnEnd: 9 }
};
const offsetOnlyResult = await anchorMergeStore.updateMarkAnchors("merge.md", [{
	id: "tracked",
	anchor: offsetOnlyAnchorUpdate,
	expectedStatus: "orphaned",
	status: "orphaned"
}]);
assert.equal(offsetOnlyResult.changed, true);
assert.equal(offsetOnlyResult.statusChanged, false);

const resolvedTrackedMark = { ...currentTrackedMark, status: "resolved" };
await anchorMergeStore.saveDocument(createDocument("merge.md", [resolvedTrackedMark, currentNewMark]));
const writesBeforeStatusConflict = anchorMergeAdapter.writeCount;
const revisionBeforeStatusConflict = anchorMergeStore.getRevision();
const statusConflictResult = await anchorMergeStore.updateMarkAnchors("merge.md", [{
	id: "tracked",
	anchor: staleAnchorUpdate,
	expectedStatus: "active",
	status: "orphaned"
}]);
assert.equal(statusConflictResult.changed, false);
assert.equal(statusConflictResult.statusChanged, false);
assert.equal(anchorMergeAdapter.writeCount, writesBeforeStatusConflict);
assert.equal(anchorMergeStore.getRevision(), revisionBeforeStatusConflict);
const statusConflictDocument = await anchorMergeStore.loadDocument("merge.md");
const statusConflictMark = statusConflictDocument.marks.find((mark) => mark.id === "tracked");
assert.equal(statusConflictMark.status, "resolved");
assert.deepEqual(statusConflictMark.anchor, currentTrackedMark.anchor);

const relocationAdapter = new ControlledAdapter();
const relocationDataDir = ".relocation-fast-path";
const unchangedFilePath = "unchanged.md";
const changedFilePath = "changed.md";
seedDocument(relocationAdapter, relocationDataDir, createDocument(unchangedFilePath));
const changedMark = {
	...createMark("changed", changedFilePath),
	anchor: {
		startOffset: 7,
		endOffset: 11,
		selectedText: "text",
		prefix: "before ",
		suffix: " after",
		position: { lineStart: 1, lineEnd: 1, columnStart: 8, columnEnd: 12 }
	}
};
seedDocument(relocationAdapter, relocationDataDir, createDocument(changedFilePath, [changedMark]));
const relocationStore = createStore(relocationAdapter, relocationDataDir);
const unchangedSidecarPath = getSidecarPath(relocationDataDir, unchangedFilePath);
const unchangedReadGate = relocationAdapter.blockNextRead(unchangedSidecarPath);
const revisionBeforeNoopRelocation = relocationStore.getRevision();
const unchangedRelocation = relocationStore.relocateDocument(unchangedFilePath, "text");
await unchangedReadGate.entered;
let laterWriteResolved = false;
const laterWrite = relocationStore.saveDocument(createDocument("later.md")).then(() => {
	laterWriteResolved = true;
});
await new Promise((resolve) => setTimeout(resolve, 0));
const laterWriteResolvedBeforeRelease = laterWriteResolved;
unchangedReadGate.release();
await Promise.all([unchangedRelocation, laterWrite]);
assert.equal(laterWriteResolvedBeforeRelease, true);
assert.equal(relocationStore.getRevision(), revisionBeforeNoopRelocation + 1);

const changedSidecarPath = getSidecarPath(relocationDataDir, changedFilePath);
const changedReadGate = relocationAdapter.blockNextRead(changedSidecarPath);
const changedRelocation = relocationStore.relocateDocument(changedFilePath, "intro before text after");
await changedReadGate.entered;
const blueMark = {
	...changedMark.mark,
	color: "blue"
};
const concurrentColorUpdate = relocationStore.updateMark(changedFilePath, changedMark.id, { mark: blueMark });
changedReadGate.release();
await Promise.all([changedRelocation, concurrentColorUpdate]);
const relocatedDocument = await relocationStore.loadDocument(changedFilePath);
const relocatedMark = relocatedDocument.marks.find((mark) => mark.id === changedMark.id);
assert.equal(relocatedMark.anchor.startOffset, 13);
assert.equal(relocatedMark.anchor.endOffset, 17);
assert.equal(relocatedMark.mark.color, "blue");
assert.equal(relocatedMark.status, "active");

const fallbackAdapter = new MemoryAdapter();
const fallbackDataDir = ".unique-anchor-fallback";
const fallbackAnchor = {
	startOffset: 100,
	endOffset: 106,
	selectedText: "unique",
	prefix: "AAAA",
	suffix: "BBBB",
	position: { lineStart: 1, lineEnd: 1, columnStart: 101, columnEnd: 107 }
};
const uniqueFilePath = "unique.md";
const uniqueMark = { ...createMark("unique", uniqueFilePath), anchor: fallbackAnchor };
seedDocument(fallbackAdapter, fallbackDataDir, createDocument(uniqueFilePath, [uniqueMark]));
const duplicateFilePath = "duplicate.md";
const duplicateMark = { ...createMark("duplicate", duplicateFilePath), anchor: fallbackAnchor };
seedDocument(fallbackAdapter, fallbackDataDir, createDocument(duplicateFilePath, [duplicateMark]));
const fallbackStore = createStore(fallbackAdapter, fallbackDataDir);
const uniqueSource = "xxxx unique yyyy";
const uniqueRelocated = await fallbackStore.relocateDocument(uniqueFilePath, uniqueSource);
assert.equal(uniqueRelocated.marks[0].status, "active");
assert.equal(uniqueRelocated.marks[0].anchor.startOffset, uniqueSource.indexOf("unique"));
const duplicateRelocated = await fallbackStore.relocateDocument(
	duplicateFilePath,
	"xxxx unique yyyy unique zzzz"
);
assert.equal(duplicateRelocated.marks[0].status, "orphaned");

await store.saveDocument(createDocument("old.md", [createMark("renamed", "old.md")]));
await store.renameDocument("old.md", "renamed/new.md");
const oldSidecarPath = `${filesDir}/${hashPath("old.md")}.json`;
const renamedSidecarPath = `${filesDir}/${hashPath("renamed/new.md")}.json`;
assert.equal(adapter.files.has(oldSidecarPath), false);
assert.equal(adapter.files.has(renamedSidecarPath), true);
const renamedDocument = JSON.parse(adapter.files.get(renamedSidecarPath));
assert.equal(renamedDocument.filePath, "renamed/new.md");
assert.deepEqual(renamedDocument.marks.map((mark) => mark.filePath), ["renamed/new.md"]);

const listCountBeforeRenameReload = adapter.listCount;
await store.loadAllDocuments();
assert.equal(adapter.listCount, listCountBeforeRenameReload + 1);

await store.deleteDocument("renamed/new.md");
await store.deleteDocument("renamed/new.md");
assert.equal(adapter.files.has(renamedSidecarPath), false);
const listCountBeforeDeleteReload = adapter.listCount;
await store.loadAllDocuments();
assert.equal(adapter.listCount, listCountBeforeDeleteReload + 1);

const staleTargetAdapter = new MemoryAdapter();
const staleTargetDataDir = ".stale-target";
seedDocument(staleTargetAdapter, staleTargetDataDir, createDocument("old.md", [createMark("source", "old.md")]));
seedDocument(staleTargetAdapter, staleTargetDataDir, createDocument("new.md", [createMark("stale", "new.md")]));
const staleTargetStore = createStore(staleTargetAdapter, staleTargetDataDir);
await staleTargetStore.renameDocument("old.md", "new.md");
const overwrittenTarget = await staleTargetStore.loadDocument("new.md");
assert.deepEqual(overwrittenTarget.marks.map((mark) => mark.id), ["source"]);

const rapidRenameAdapter = new ControlledAdapter();
const rapidRenameDataDir = ".rapid-rename";
seedDocument(rapidRenameAdapter, rapidRenameDataDir, createDocument("old.md", [createMark("original", "old.md")]));
const rapidRenameStore = createStore(rapidRenameAdapter, rapidRenameDataDir);
const middleSidecarPath = getSidecarPath(rapidRenameDataDir, "middle.md");
const rapidRenameGate = rapidRenameAdapter.blockNextWrite(middleSidecarPath);
const renameToMiddle = rapidRenameStore.renameDocument("old.md", "middle.md");
await rapidRenameGate.entered;
const renameToNew = rapidRenameStore.renameDocument("middle.md", "new.md");
rapidRenameGate.release();
await Promise.all([renameToMiddle, renameToNew]);
assert.equal(rapidRenameAdapter.files.has(middleSidecarPath), false);
const rapidRenameDocument = await rapidRenameStore.loadDocument("new.md");
assert.deepEqual(rapidRenameDocument.marks.map((mark) => mark.id), ["original"]);
assert.deepEqual(rapidRenameDocument.marks.map((mark) => mark.filePath), ["new.md"]);

const renameDeleteAdapter = new ControlledAdapter();
const renameDeleteDataDir = ".rename-delete";
seedDocument(renameDeleteAdapter, renameDeleteDataDir, createDocument("old.md"));
const renameDeleteStore = createStore(renameDeleteAdapter, renameDeleteDataDir);
const renameDeleteTargetPath = getSidecarPath(renameDeleteDataDir, "new.md");
const renameDeleteGate = renameDeleteAdapter.blockNextWrite(renameDeleteTargetPath);
const pendingRename = renameDeleteStore.renameDocument("old.md", "new.md");
await renameDeleteGate.entered;
const pendingDelete = renameDeleteStore.deleteDocument("new.md");
renameDeleteGate.release();
await Promise.all([pendingRename, pendingDelete]);
assert.equal(renameDeleteAdapter.files.has(renameDeleteTargetPath), false);

const renameCreateAdapter = new ControlledAdapter();
const renameCreateDataDir = ".rename-create";
seedDocument(renameCreateAdapter, renameCreateDataDir, createDocument("old.md", [createMark("original", "old.md")]));
const renameCreateStore = createStore(renameCreateAdapter, renameCreateDataDir);
const renameCreateTargetPath = getSidecarPath(renameCreateDataDir, "new.md");
const renameCreateGate = renameCreateAdapter.blockNextWrite(renameCreateTargetPath);
const pendingCreateRename = renameCreateStore.renameDocument("old.md", "new.md");
await renameCreateGate.entered;
const pendingCreate = renameCreateStore.createMark({
	filePath: "new.md",
	source: "new text",
	startOffset: 0,
	endOffset: 3,
	kind: "highlight",
	color: "yellow"
});
renameCreateGate.release();
await Promise.all([pendingCreateRename, pendingCreate]);
const renameCreateDocument = await renameCreateStore.loadDocument("new.md");
assert.equal(renameCreateDocument.marks.length, 2);
assert.equal(renameCreateDocument.marks.some((mark) => mark.id === "original"), true);
assert.equal(renameCreateDocument.marks.every((mark) => mark.filePath === "new.md"), true);

const concurrencyAdapter = new ReadConcurrencyAdapter();
const concurrencyDataDir = ".read-concurrency";
for (let index = 0; index < 25; index += 1) {
	seedDocument(concurrencyAdapter, concurrencyDataDir, createDocument(`note-${index}.md`));
}
const concurrencyStore = createStore(concurrencyAdapter, concurrencyDataDir);
const concurrencyDocuments = await concurrencyStore.loadAllDocuments();
assert.equal(concurrencyDocuments.length, 25);
assert.equal(concurrencyAdapter.maxActiveReads, 8);

console.warn = originalWarn;
console.log("storage tests passed");
