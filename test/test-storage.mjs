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
	writeGates = new Map();

	blockNextWrite(path) {
		const entered = createDeferred();
		const release = createDeferred();
		this.writeGates.set(path, { entered, release });
		return {
			entered: entered.promise,
			release: () => release.resolve()
		};
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
await store.loadAllDocuments();
assert.equal(adapter.listCount, 2);

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
