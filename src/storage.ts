import { App, normalizePath } from "obsidian";
import { createHash } from "crypto";
import { createTextAnchor, relocateAnchor } from "./anchors";
import { translate } from "./i18n";
import { DEFAULT_SETTINGS, type CommentReply, type MarkBackgroundColor, type MarkColor, type MarkKind, type MarkTextColor, type SideMark, type SideMarkDocument, type SideMarkSettings } from "./types";

const SIDECAR_READ_CONCURRENCY = 8;

export class SideMarkStore {
	private allDocumentsCache: SideMarkDocument[] | null = null;
	private allDocumentsLoad: Promise<SideMarkDocument[]> | null = null;
	private allDocumentsRevision = 0;
	private mutationTail: Promise<void> = Promise.resolve();

	constructor(private readonly app: App, private settings: SideMarkSettings) {
	}

	updateSettings(settings: SideMarkSettings): void {
		this.settings = settings;
		this.invalidateAllDocumentsCache();
	}

	async loadDocument(filePath: string): Promise<SideMarkDocument> {
		await this.mutationTail;
		return this.readDocument(normalizePath(filePath));
	}

	async loadAllDocuments(): Promise<SideMarkDocument[]> {
		await this.mutationTail;
		if (this.allDocumentsCache) {
			return this.allDocumentsCache;
		}
		if (this.allDocumentsLoad) {
			return this.allDocumentsLoad;
		}

		const revision = this.allDocumentsRevision;
		const load = this.readAllDocuments().then((documents) => {
			if (revision === this.allDocumentsRevision) {
				this.allDocumentsCache = documents;
			}
			return documents;
		}).finally(() => {
			if (this.allDocumentsLoad === load) {
				this.allDocumentsLoad = null;
			}
		});
		this.allDocumentsLoad = load;
		return load;
	}

	async saveDocument(document: SideMarkDocument): Promise<SideMarkDocument> {
		return this.enqueueMutation(() => this.writeDocument(document));
	}

	async renameDocument(oldFilePath: string, newFilePath: string): Promise<void> {
		return this.enqueueMutation(async () => {
			const normalizedOldPath = normalizePath(oldFilePath);
			const normalizedNewPath = normalizePath(newFilePath);
			if (normalizedOldPath === normalizedNewPath) {
				return;
			}

			const oldSidecarPath = this.getSidecarPath(normalizedOldPath);
			if (!await this.app.vault.adapter.exists(oldSidecarPath)) {
				return;
			}

			const oldDocument = await this.readDocument(normalizedOldPath);
			await this.writeDocument({
				...oldDocument,
				filePath: normalizedNewPath
			});
			await this.app.vault.adapter.remove(oldSidecarPath);
			this.invalidateAllDocumentsCache();
		});
	}

	async deleteDocument(filePath: string): Promise<void> {
		return this.enqueueMutation(async () => {
			const sidecarPath = this.getSidecarPath(normalizePath(filePath));
			if (!await this.app.vault.adapter.exists(sidecarPath)) {
				return;
			}
			await this.app.vault.adapter.remove(sidecarPath);
			this.invalidateAllDocumentsCache();
		});
	}

	async createMark(input: {
		filePath: string;
		source: string;
		startOffset: number;
		endOffset: number;
		kind: MarkKind;
		color: MarkColor;
		textColor?: MarkTextColor;
		backgroundColor?: MarkBackgroundColor;
		noteContent?: string;
	}): Promise<SideMarkDocument> {
		return this.enqueueMutation(async () => {
			const anchor = createTextAnchor(input.source, input.startOffset, input.endOffset);
			if (!anchor.selectedText) {
				throw new Error("Cannot create a mark from an empty selection.");
			}

			const document = await this.readDocument(normalizePath(input.filePath));
			const now = new Date().toISOString();
			const mark: SideMark = {
				id: crypto.randomUUID(),
				filePath: normalizePath(input.filePath),
				anchor,
				mark: {
					kind: input.kind,
					color: input.color,
					textColor: input.textColor || "default",
					backgroundColor: input.backgroundColor || "none"
				},
				note: {
					content: input.noteContent || "",
					createdAt: now,
					updatedAt: now
				},
				replies: input.kind === "comment" && input.noteContent?.trim()
					? [this.createReply(input.noteContent, now)]
					: [],
				status: "active",
				remote: {
					status: "pending"
				}
			};
			return this.writeDocument({
				...document,
				marks: [...document.marks, mark]
			});
		});
	}

	async updateMark(filePath: string, markId: string, update: Partial<Pick<SideMark, "status" | "remote" | "mark">> & { noteContent?: string }): Promise<SideMarkDocument> {
		return this.enqueueMutation(async () => {
			const document = await this.readDocument(normalizePath(filePath));
			const now = new Date().toISOString();
			return this.writeDocument({
				...document,
				marks: document.marks.map((mark) => {
					if (mark.id !== markId) {
						return mark;
					}
					return {
						...mark,
						status: update.status ?? mark.status,
						remote: update.remote ?? mark.remote,
						mark: update.mark ?? mark.mark,
						note: update.noteContent === undefined
							? mark.note
							: {
								...mark.note,
								content: update.noteContent,
								updatedAt: now
							}
					};
				})
			});
		});
	}

	private async writeDocument(document: SideMarkDocument): Promise<SideMarkDocument> {
		const normalizedPath = normalizePath(document.filePath);
		const next: SideMarkDocument = {
			schemaVersion: 1,
			filePath: normalizedPath,
			updatedAt: new Date().toISOString(),
			marks: document.marks
				.map((mark) => ({ ...mark, filePath: normalizedPath }))
				.sort((left, right) => left.anchor.startOffset - right.anchor.startOffset)
		};
		const sidecarPath = this.getSidecarPath(normalizedPath);
		await this.app.vault.adapter.mkdir(this.getFilesDir());
		await this.app.vault.adapter.write(sidecarPath, JSON.stringify(next, null, 2));
		this.invalidateAllDocumentsCache();
		return next;
	}

	async addReply(filePath: string, markId: string, content: string): Promise<SideMarkDocument> {
		const trimmed = content.trim();
		if (!trimmed) {
			throw new Error(translate(this.settings.language, "error.emptyComment"));
		}
		return this.enqueueMutation(async () => {
			const document = await this.readDocument(normalizePath(filePath));
			const now = new Date().toISOString();
			return this.writeDocument({
				...document,
				marks: document.marks.map((mark) => {
					if (mark.id !== markId) {
						return mark;
					}
					const replies = this.getReplies(mark);
					return {
						...mark,
						replies: [...replies, this.createReply(trimmed, now)],
						note: {
							...mark.note,
							content: [...replies.map((reply) => reply.content), trimmed].join("\n\n"),
							updatedAt: now
						},
						remote: mark.remote?.status === "synced"
							? { ...mark.remote, status: "pending" as const }
							: mark.remote
					};
				})
			});
		});
	}

	async updateReply(filePath: string, markId: string, replyId: string, content: string): Promise<SideMarkDocument> {
		const trimmed = content.trim();
		if (!trimmed) {
			throw new Error(translate(this.settings.language, "error.emptyComment"));
		}
		return this.enqueueMutation(async () => {
			const document = await this.readDocument(normalizePath(filePath));
			const now = new Date().toISOString();
			return this.writeDocument({
				...document,
				marks: document.marks.map((mark) => {
					if (mark.id !== markId) {
						return mark;
					}
					const replies = this.getReplies(mark).map((reply) => reply.id === replyId
						? { ...reply, content: trimmed, updatedAt: now }
						: reply);
					return {
						...mark,
						replies,
						note: {
							...mark.note,
							content: replies.map((reply) => reply.content).join("\n\n"),
							updatedAt: now
						},
						remote: mark.remote?.status === "synced"
							? { ...mark.remote, status: "pending" as const }
							: mark.remote
					};
				})
			});
		});
	}

	async deleteReply(filePath: string, markId: string, replyId: string): Promise<SideMarkDocument> {
		return this.enqueueMutation(async () => {
			const document = await this.readDocument(normalizePath(filePath));
			const now = new Date().toISOString();
			return this.writeDocument({
				...document,
				marks: document.marks.map((mark) => {
					if (mark.id !== markId) {
						return mark;
					}
					const replies = this.getReplies(mark).filter((reply) => reply.id !== replyId);
					return {
						...mark,
						replies,
						note: {
							...mark.note,
							content: replies.map((reply) => reply.content).join("\n\n"),
							updatedAt: now
						},
						remote: mark.remote?.status === "synced"
							? { ...mark.remote, status: "pending" as const }
							: mark.remote
					};
				})
			});
		});
	}

	async deleteMark(filePath: string, markId: string): Promise<SideMarkDocument> {
		return this.enqueueMutation(async () => {
			const document = await this.readDocument(normalizePath(filePath));
			return this.writeDocument({
				...document,
				marks: document.marks.filter((mark) => mark.id !== markId)
			});
		});
	}

	async relocateDocument(filePath: string, source: string): Promise<SideMarkDocument> {
		return this.enqueueMutation(async () => {
			const document = await this.readDocument(normalizePath(filePath));
			let changed = false;
			const marks = document.marks.map((mark) => {
				const anchor = relocateAnchor(source, mark.anchor);
				if (!anchor) {
					if (mark.status === "orphaned") {
						return mark;
					}
					changed = true;
					return { ...mark, status: "orphaned" as const };
				}
				if (anchor.startOffset === mark.anchor.startOffset && anchor.endOffset === mark.anchor.endOffset && mark.status !== "orphaned") {
					return mark;
				}
				changed = true;
				return {
					...mark,
					anchor,
					status: mark.status === "orphaned" ? "active" as const : mark.status
				};
			});

			if (!changed) {
				return document;
			}
			return this.writeDocument({ ...document, marks });
		});
	}

	private enqueueMutation<T>(mutation: () => Promise<T>): Promise<T> {
		const result = this.mutationTail.then(mutation, mutation);
		this.mutationTail = result.then(() => undefined, () => undefined);
		return result;
	}

	private async readDocument(normalizedPath: string): Promise<SideMarkDocument> {
		const sidecarPath = this.getSidecarPath(normalizedPath);
		if (!await this.app.vault.adapter.exists(sidecarPath)) {
			return this.createEmptyDocument(normalizedPath);
		}

		const raw = await this.app.vault.adapter.read(sidecarPath);
		const document = this.parseDocument(raw, normalizedPath);
		return document || this.createEmptyDocument(normalizedPath);
	}

	private createEmptyDocument(filePath: string): SideMarkDocument {
		return {
			schemaVersion: 1,
			filePath,
			updatedAt: new Date().toISOString(),
			marks: []
		};
	}

	private getSidecarPath(filePath: string): string {
		return normalizePath(`${this.getFilesDir()}/${hashPath(filePath)}.json`);
	}

	private getFilesDir(): string {
		return normalizePath(`${this.settings.dataDir || DEFAULT_SETTINGS.dataDir}/files`);
	}

	private async readAllDocuments(): Promise<SideMarkDocument[]> {
		const filesDir = this.getFilesDir();
		if (!await this.app.vault.adapter.exists(filesDir)) {
			return [];
		}

		const listed = await this.app.vault.adapter.list(filesDir);
		const sidecarPaths = listed.files.filter((filePath) => filePath.endsWith(".json")).sort();
		const documents: Array<SideMarkDocument | null> = new Array(sidecarPaths.length).fill(null);
		let nextIndex = 0;
		const readNext = async (): Promise<void> => {
			while (nextIndex < sidecarPaths.length) {
				const index = nextIndex;
				nextIndex += 1;
				const sidecarPath = sidecarPaths[index];
				try {
					const raw = await this.app.vault.adapter.read(sidecarPath);
					const document = this.parseDocument(raw);
					if (!document) {
						console.warn(`FloatMark: skipping sidecar without filePath: ${sidecarPath}`);
					}
					documents[index] = document;
				} catch (error) {
					console.warn(`FloatMark: failed to read sidecar: ${sidecarPath}`, error);
				}
			}
		};
		const workerCount = Math.min(SIDECAR_READ_CONCURRENCY, sidecarPaths.length);
		await Promise.all(Array.from({ length: workerCount }, () => readNext()));
		return documents
			.filter((document): document is SideMarkDocument => document !== null)
			.sort((left, right) => left.filePath.localeCompare(right.filePath));
	}

	private parseDocument(raw: string, fallbackFilePath?: string): SideMarkDocument | null {
		const parsed = JSON.parse(raw) as Partial<SideMarkDocument>;
		const storedFilePath = typeof parsed.filePath === "string" ? parsed.filePath.trim() : "";
		const filePath = fallbackFilePath || storedFilePath;
		if (!filePath) {
			return null;
		}
		const normalizedPath = normalizePath(filePath);
		const marks = Array.isArray(parsed.marks)
			? parsed.marks.map((mark) => ({ ...this.normalizeMark(mark), filePath: normalizedPath }))
			: [];
		return {
			schemaVersion: 1,
			filePath: normalizedPath,
			updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
			marks
		};
	}

	private invalidateAllDocumentsCache(): void {
		this.allDocumentsRevision += 1;
		this.allDocumentsCache = null;
		this.allDocumentsLoad = null;
	}

	private normalizeMark(mark: SideMark): SideMark {
		if (mark.mark.kind !== "comment") {
			const legacyNoteContent = mark.note?.content || mark.replies?.[0]?.content || "";
			return {
				...mark,
				replies: [],
				note: {
					...mark.note,
					content: legacyNoteContent
				}
			};
		}
		const replies = this.getReplies(mark);
		return {
			...mark,
			replies,
			note: {
				...mark.note,
				content: replies.length ? replies.map((reply) => reply.content).join("\n\n") : mark.note.content
			}
		};
	}

	private getReplies(mark: SideMark): CommentReply[] {
		if (Array.isArray(mark.replies)) {
			return mark.replies;
		}
		const content = mark.note?.content?.trim();
		if (!content) {
			return [];
		}
		const createdAt = mark.note.createdAt || new Date().toISOString();
		return [this.createReply(content, createdAt)];
	}

	private createReply(content: string, now: string): CommentReply {
		return {
			id: crypto.randomUUID(),
			authorName: this.settings.commentAuthorName || DEFAULT_SETTINGS.commentAuthorName,
			content,
			createdAt: now,
			updatedAt: now
		};
	}
}

export function hashPath(filePath: string): string {
	return createHash("sha1").update(normalizePath(filePath)).digest("hex");
}
