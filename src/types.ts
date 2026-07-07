export const DATA_DIR = ".obsidian-float-marks";

export type MarkKind = "highlight" | "underline" | "comment";
export type MarkColor = "yellow" | "blue" | "green" | "red";
export type MarkStatus = "active" | "resolved" | "orphaned";
export type RemoteSyncStatus = "pending" | "synced" | "failed";

export interface TextAnchor {
	startOffset: number;
	endOffset: number;
	selectedText: string;
	prefix: string;
	suffix: string;
	position: {
		lineStart: number;
		lineEnd: number;
		columnStart: number;
		columnEnd: number;
	};
}

export interface RemoteSyncState {
	status: RemoteSyncStatus;
	larkDocToken?: string;
	larkDocUrl?: string;
	larkCommentId?: string;
	larkReplyId?: string;
	blockId?: string;
	syncedHash?: string;
	syncedAt?: string;
	error?: string;
}

export interface CommentReply {
	id: string;
	authorName: string;
	content: string;
	createdAt: string;
	updatedAt: string;
}

export interface SideMark {
	id: string;
	filePath: string;
	anchor: TextAnchor;
	mark: {
		kind: MarkKind;
		color: MarkColor;
	};
	note: {
		content: string;
		createdAt: string;
		updatedAt: string;
	};
	replies?: CommentReply[];
	status: MarkStatus;
	remote?: RemoteSyncState;
}

export interface SideMarkDocument {
	schemaVersion: 1;
	filePath: string;
	updatedAt: string;
	marks: SideMark[];
}

export interface SideMarkSettings {
	dataDir: string;
	larkCliPath: string;
	autoOpenSidebar: boolean;
	autoSyncToLark: boolean;
	preferBodyBlockForLark: boolean;
	commentAuthorName: string;
}

export const DEFAULT_SETTINGS: SideMarkSettings = {
	dataDir: DATA_DIR,
	larkCliPath: "lark-cli",
	autoOpenSidebar: true,
	autoSyncToLark: false,
	preferBodyBlockForLark: false,
	commentAuthorName: "我"
};
