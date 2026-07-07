import { App, normalizePath } from "obsidian";
import { createHash } from "crypto";
import { createTextAnchor, relocateAnchor } from "./anchors";
import { DEFAULT_SETTINGS, type CommentReply, type MarkBackgroundColor, type MarkColor, type MarkKind, type MarkTextColor, type SideMark, type SideMarkDocument, type SideMarkSettings } from "./types";

export class SideMarkStore {
	constructor(private readonly app: App, private settings: SideMarkSettings) {
	}

	updateSettings(settings: SideMarkSettings): void {
		this.settings = settings;
	}

	async loadDocument(filePath: string): Promise<SideMarkDocument> {
		const normalizedPath = normalizePath(filePath);
		const sidecarPath = this.getSidecarPath(normalizedPath);
		if (!await this.app.vault.adapter.exists(sidecarPath)) {
			return this.createEmptyDocument(normalizedPath);
		}

		const raw = await this.app.vault.adapter.read(sidecarPath);
		const parsed = JSON.parse(raw) as Partial<SideMarkDocument>;
		return {
			schemaVersion: 1,
			filePath: normalizedPath,
			updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
			marks: Array.isArray(parsed.marks) ? (parsed.marks as SideMark[]).map((mark) => this.normalizeMark(mark)) : []
		};
	}

	async saveDocument(document: SideMarkDocument): Promise<SideMarkDocument> {
		const normalizedPath = normalizePath(document.filePath);
		const next: SideMarkDocument = {
			schemaVersion: 1,
			filePath: normalizedPath,
			updatedAt: new Date().toISOString(),
			marks: [...document.marks].sort((left, right) => left.anchor.startOffset - right.anchor.startOffset)
		};
		const sidecarPath = this.getSidecarPath(normalizedPath);
		await this.app.vault.adapter.mkdir(this.getFilesDir());
		await this.app.vault.adapter.write(sidecarPath, JSON.stringify(next, null, 2));
		return next;
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
		const anchor = createTextAnchor(input.source, input.startOffset, input.endOffset);
		if (!anchor.selectedText) {
			throw new Error("Cannot create a mark from an empty selection.");
		}

		const document = await this.loadDocument(input.filePath);
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
			replies: input.noteContent?.trim()
				? [this.createReply(input.noteContent, now)]
				: [],
			status: "active",
			remote: {
				status: "pending"
			}
		};
		return this.saveDocument({
			...document,
			marks: [...document.marks, mark]
		});
	}

	async updateMark(filePath: string, markId: string, update: Partial<Pick<SideMark, "status" | "remote" | "mark">> & { noteContent?: string }): Promise<SideMarkDocument> {
		const document = await this.loadDocument(filePath);
		const now = new Date().toISOString();
		return this.saveDocument({
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
	}

	async addReply(filePath: string, markId: string, content: string): Promise<SideMarkDocument> {
		const trimmed = content.trim();
		if (!trimmed) {
			throw new Error("评论内容不能为空。");
		}
		const document = await this.loadDocument(filePath);
		const now = new Date().toISOString();
		return this.saveDocument({
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
	}

	async updateReply(filePath: string, markId: string, replyId: string, content: string): Promise<SideMarkDocument> {
		const trimmed = content.trim();
		if (!trimmed) {
			throw new Error("评论内容不能为空。");
		}
		const document = await this.loadDocument(filePath);
		const now = new Date().toISOString();
		return this.saveDocument({
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
	}

	async deleteMark(filePath: string, markId: string): Promise<SideMarkDocument> {
		const document = await this.loadDocument(filePath);
		return this.saveDocument({
			...document,
			marks: document.marks.filter((mark) => mark.id !== markId)
		});
	}

	async relocateDocument(filePath: string, source: string): Promise<SideMarkDocument> {
		const document = await this.loadDocument(filePath);
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
		return this.saveDocument({ ...document, marks });
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

	private normalizeMark(mark: SideMark): SideMark {
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
