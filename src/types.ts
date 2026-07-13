import type { PluginLanguage } from "./i18n";

export const DATA_DIR = ".obsidian-float-marks";

export type MarkKind = "highlight" | "underline" | "comment";
export type MarkColor = "yellow" | "blue" | "green" | "red";
export type MarkTextColor = "default" | "gray" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
export type MarkBackgroundColor =
	| "none"
	| "gray-light"
	| "red-light"
	| "orange-light"
	| "yellow-light"
	| "green-light"
	| "blue-light"
	| "purple-light"
	| "gray"
	| "red"
	| "orange"
	| "yellow"
	| "green"
	| "blue"
	| "purple";
export type MarkStatus = "active" | "resolved" | "orphaned";
export type RemoteSyncStatus = "pending" | "synced" | "failed";
export type ScopeControlStyle = "tabs" | "dropdown" | "swap" | "switch";

export function normalizeScopeControlStyle(value: unknown): ScopeControlStyle {
	if (value === "tabs" || value === "dropdown" || value === "swap" || value === "switch") {
		return value;
	}
	return "dropdown";
}

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
	larkReplyIds?: string[];
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
		textColor: MarkTextColor;
		backgroundColor: MarkBackgroundColor;
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
	language?: PluginLanguage;
	autoOpenSidebar: boolean;
	autoSyncToLark: boolean;
	preferBodyBlockForLark: boolean;
	commentAuthorName: string;
	scopeControlStyle: ScopeControlStyle;
}

export const DEFAULT_SETTINGS: SideMarkSettings = {
	dataDir: DATA_DIR,
	language: undefined,
	autoOpenSidebar: true,
	autoSyncToLark: false,
	preferBodyBlockForLark: false,
	commentAuthorName: "我",
	scopeControlStyle: "dropdown"
};
