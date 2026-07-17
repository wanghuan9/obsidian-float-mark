import type { PluginLanguage } from "./i18n";

export const DATA_DIR = ".obsidian-float-marks";

export type MarkKind = "highlight" | "underline" | "comment";
export type MarkColor = "yellow" | "blue" | "green" | "red";
export type MarkTextColor = "default" | "gray" | "red" | "orange" | "yellow" | "green" | "blue" | "purple";
const PRESET_MARK_BACKGROUND_COLORS = [
	"none",
	"gray-light",
	"red-light",
	"orange-light",
	"yellow-light",
	"green-light",
	"blue-light",
	"purple-light",
	"gray",
	"red",
	"orange",
	"yellow",
	"green",
	"blue",
	"purple"
] as const;

export type PresetMarkBackgroundColor = typeof PRESET_MARK_BACKGROUND_COLORS[number];
declare const CUSTOM_MARK_BACKGROUND_COLOR_BRAND: unique symbol;
export type CustomMarkBackgroundColor = `custom-#${string}` & {
	readonly [CUSTOM_MARK_BACKGROUND_COLOR_BRAND]: true;
};
export type MarkBackgroundColor = PresetMarkBackgroundColor | CustomMarkBackgroundColor;

const PRESET_MARK_BACKGROUND_COLOR_SET = new Set<string>(PRESET_MARK_BACKGROUND_COLORS);
const CUSTOM_MARK_BACKGROUND_COLOR_PATTERN = /^custom-#[0-9a-fA-F]{6}$/;

export function normalizeMarkBackgroundColor(value: unknown): MarkBackgroundColor {
	if (typeof value !== "string") {
		return "none";
	}
	if (PRESET_MARK_BACKGROUND_COLOR_SET.has(value)) {
		return value as PresetMarkBackgroundColor;
	}
	return CUSTOM_MARK_BACKGROUND_COLOR_PATTERN.test(value)
		? value.toLowerCase() as CustomMarkBackgroundColor
		: "none";
}

export function getCustomMarkBackgroundHex(color: MarkBackgroundColor): `#${string}` | null {
	return CUSTOM_MARK_BACKGROUND_COLOR_PATTERN.test(color)
		? color.slice("custom-".length).toLowerCase() as `#${string}`
		: null;
}
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
	showBlockToolbar: boolean;
	autoSyncToLark: boolean;
	preferBodyBlockForLark: boolean;
	commentAuthorName: string;
	scopeControlStyle: ScopeControlStyle;
}

export const DEFAULT_SETTINGS: SideMarkSettings = {
	dataDir: DATA_DIR,
	language: undefined,
	autoOpenSidebar: true,
	showBlockToolbar: true,
	autoSyncToLark: false,
	preferBodyBlockForLark: false,
	commentAuthorName: "我",
	scopeControlStyle: "dropdown"
};
