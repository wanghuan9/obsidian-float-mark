import { FileSystemAdapter, TFile } from "obsidian";
import type SideMarkPlugin from "./main";
import { findRemoteBlockId, type RemoteUnit } from "./block-map";
import {
	assertLarkCommandOk,
	buildLarkReplyListArgs,
	executeLarkCliCommand,
	getLarkReplyIds,
	type LarkCliResult,
	type LarkSyncPluginBridge
} from "./lark-cli-bridge";
import type { RemoteSyncState, SideMark } from "./types";
import { translate, type PluginLanguage } from "./i18n";

export const LARK_SYNC_PLUGIN_ID = "feishu-lark-cli-sync";
const SYNC_STATE_FILE = "lark-sync-state.json";

export type LarkSyncPluginStatus = "enabled" | "disabled" | "not-installed" | "unknown";

interface LarkSyncStateFile {
	version: 1;
	documents: Record<string, {
		doc: string;
		revisionId?: number;
		titleBlockId?: string;
		units: RemoteUnit[];
	}>;
}

interface LarkReply {
	id?: string;
	authorName?: string;
	content: string;
	createdAt?: string;
}

interface ObsidianPluginManager {
	manifests?: Record<string, unknown>;
	enabledPlugins?: Set<string>;
	getPlugin?: (id: string) => unknown;
}

interface AppWithPluginManager {
	plugins?: ObsidianPluginManager;
}

export async function syncMarkToLark(plugin: SideMarkPlugin, file: TFile, source: string, mark: SideMark): Promise<RemoteSyncState> {
	const binding = readLarkBinding(source);
	if (!binding.doc) {
		throw new Error(plugin.t("error.noLarkBinding"));
	}

	const replies = getReplies(plugin, mark);
	if (mark.remote?.larkCommentId) {
		return await syncRepliesToExistingLarkComment(plugin, binding, mark, replies);
	}

	const syncState = await readSyncState(plugin);
	const docState = findDocumentState(syncState, binding.doc);
	if (!docState || (!docState.titleBlockId && !docState.units.length)) {
		throw new Error(plugin.t("error.noLarkBlockMap"));
	}

	const blockId = findRemoteBlockId(
		source,
		docState.units,
		mark.anchor.startOffset,
		mark.anchor.endOffset,
		docState.titleBlockId
	);
	if (!blockId) {
		throw new Error(plugin.t("error.noLarkBlock"));
	}

	const [firstReply, ...restReplies] = replies.length
		? replies
		: [{ content: plugin.t("lark.emptyComment") }];
	const result = await runLarkCreateComment(plugin, {
		doc: binding.doc,
		blockId,
		content: buildCommentElements(firstReply.content)
	});
	if (!result.ok) {
		throw new Error(result.error?.message || result.error?.hint || plugin.t("error.larkCreateCommentFailed"));
	}
	const commentId = result.data?.comment_id;
	const replyIds = [result.data?.reply_id].filter(isNonEmptyString);
	if (commentId) {
		for (const reply of restReplies) {
			const replyResult = await runLarkCreateReply(plugin, {
				doc: binding.doc,
				commentId,
				content: buildReplyBody(reply.content)
			});
			if (!replyResult.ok) {
				throw new Error(replyResult.error?.message || replyResult.error?.hint || plugin.t("error.larkCreateReplyFailed"));
			}
			if (replyResult.data?.reply_id) {
				replyIds.push(replyResult.data.reply_id);
			}
		}
	}

	return {
		status: "synced",
		larkDocToken: binding.token,
		larkDocUrl: binding.url,
		larkCommentId: commentId,
		larkReplyId: replyIds.at(-1),
		larkReplyIds: replyIds.length ? replyIds : undefined,
		blockId,
		syncedHash: buildSyncedHash(mark.anchor.selectedText, replies),
		syncedAt: new Date().toISOString()
	};
}

export async function setLarkCommentResolved(plugin: SideMarkPlugin, mark: SideMark, isSolved: boolean): Promise<void> {
	const { doc, commentId } = getRemoteCommentReference(plugin, mark);
	const result = await runLarkPatchComment(plugin, { doc, commentId, isSolved });
	assertLarkCommandOk(result, plugin.t("error.larkUpdateCommentFailed"));
}

export async function deleteLarkComment(plugin: SideMarkPlugin, mark: SideMark): Promise<void> {
	const { doc, commentId } = getRemoteCommentReference(plugin, mark);
	const storedReplyIds = getDeleteAllLarkReplyIds(mark.remote);
	const replies = getReplies(plugin, mark);
	const idsToDelete = storedReplyIds.length >= replies.length
		? storedReplyIds
		: await findLarkReplyIds(plugin, doc, commentId);
	if (idsToDelete.length === 0) {
		throw new Error(plugin.t("error.missingLarkReplyId"));
	}

	for (const replyId of [...idsToDelete].reverse()) {
		const result = await runLarkDeleteReply(plugin, { doc, commentId, replyId });
		assertLarkCommandOk(result, plugin.t("error.larkDeleteReplyFailed"));
	}
}

export async function deleteLarkCommentReply(plugin: SideMarkPlugin, mark: SideMark, replyId: string): Promise<RemoteSyncState | null> {
	const { doc, commentId } = getRemoteCommentReference(plugin, mark);
	const replies = getReplies(plugin, mark);
	const replyIndex = replies.findIndex((reply) => reply.id === replyId);
	if (replyIndex === -1) {
		throw new Error(plugin.t("error.localReplyNotFound"));
	}

	const syncedReplyCount = findSyncedReplyCount(plugin, mark, replies);
	if (replyIndex >= syncedReplyCount) {
		return null;
	}

	const storedReplyIds = getStoredLarkReplyIdList(mark.remote);
	const shouldUseLegacyLastReplyId = replyIndex === syncedReplyCount - 1 && Boolean(mark.remote?.larkReplyId);
	const remoteReplyIds = storedReplyIds.length >= syncedReplyCount || shouldUseLegacyLastReplyId
		? storedReplyIds
		: await findLarkReplyIds(plugin, doc, commentId);
	const remoteReplyId = remoteReplyIds[replyIndex] || (replyIndex === syncedReplyCount - 1 ? mark.remote?.larkReplyId : "");
	if (!remoteReplyId) {
		throw new Error(plugin.t("error.missingRemoteReplyId"));
	}

	const result = await runLarkDeleteReply(plugin, { doc, commentId, replyId: remoteReplyId });
	assertLarkCommandOk(result, plugin.t("error.larkDeleteReplyFailed"));

	const syncedRepliesAfterDelete = replies
		.slice(0, syncedReplyCount)
		.filter((reply) => reply.id !== replyId);
	const remainingReplies = replies.filter((reply) => reply.id !== replyId);
	const hasPendingReplies = remainingReplies.length > syncedRepliesAfterDelete.length;
	return {
		...mark.remote,
		status: hasPendingReplies ? "pending" : "synced",
		larkCommentId: commentId,
		larkReplyId: remoteReplyIds.filter((_, index) => index !== replyIndex).at(-1) || undefined,
		larkReplyIds: remoteReplyIds.filter((_, index) => index !== replyIndex),
		syncedHash: buildSyncedHash(mark.anchor.selectedText, syncedRepliesAfterDelete),
		syncedAt: new Date().toISOString(),
		error: undefined
	};
}

export async function canSyncMarkToLark(plugin: SideMarkPlugin, source: string): Promise<boolean> {
	const binding = readLarkBinding(source);
	if (!binding.doc) {
		return false;
	}

	const syncState = await readSyncState(plugin);
	const docState = findDocumentState(syncState, binding.doc);
	return Boolean(docState?.titleBlockId || docState?.units.length);
}

function getRemoteCommentReference(plugin: SideMarkPlugin, mark: SideMark): { doc: string; commentId: string } {
	const doc = mark.remote?.larkDocToken || mark.remote?.larkDocUrl || "";
	const commentId = mark.remote?.larkCommentId || "";
	if (!doc || !commentId) {
		throw new Error(plugin.t("error.missingLarkCommentInfo"));
	}
	return { doc, commentId };
}

function getDeleteAllLarkReplyIds(remote: RemoteSyncState | undefined): string[] {
	const replyIds = getStoredLarkReplyIdList(remote);
	if (replyIds.length > 0) {
		return replyIds;
	}
	return remote?.larkReplyId ? [remote.larkReplyId] : [];
}

function getStoredLarkReplyIdList(remote: RemoteSyncState | undefined): string[] {
	return (remote?.larkReplyIds || []).filter(isNonEmptyString);
}

function getLarkReplyItems(result: LarkCliResult): Array<{ reply_id?: string }> {
	return result.data?.items || result.items || [];
}

function isNonEmptyString(value: string | undefined): value is string {
	return Boolean(value);
}

export function getLarkSyncPluginStatus(plugin: SideMarkPlugin): LarkSyncPluginStatus {
	const manager = getObsidianPluginManager(plugin);
	if (!manager) {
		return "unknown";
	}
	if (!manager.manifests?.[LARK_SYNC_PLUGIN_ID] && !manager.getPlugin?.(LARK_SYNC_PLUGIN_ID)) {
		return "not-installed";
	}
	if (manager.enabledPlugins?.has(LARK_SYNC_PLUGIN_ID) || manager.getPlugin?.(LARK_SYNC_PLUGIN_ID)) {
		return "enabled";
	}
	return "disabled";
}

export function getLarkSyncPluginStatusText(status: LarkSyncPluginStatus, language: PluginLanguage | undefined = "zh-CN"): string {
	switch (status) {
		case "enabled":
			return translate(language, "lark.status.enabled");
		case "disabled":
			return translate(language, "lark.status.disabled");
		case "not-installed":
			return translate(language, "lark.status.notInstalled");
		case "unknown":
			return translate(language, "lark.status.unknown");
	}
}

export function getLarkSyncPluginStatusClass(status: LarkSyncPluginStatus): string {
	switch (status) {
		case "enabled":
			return "is-installed";
		case "disabled":
			return "is-warning";
		case "not-installed":
			return "is-error";
		case "unknown":
			return "is-muted";
	}
}

function readLarkBinding(source: string): { doc: string; token?: string; url?: string } {
	const frontmatter = source.match(/^---\n([\s\S]*?)\n---/);
	const body = frontmatter?.[1] || "";
	const url = readYamlScalar(body, "lark_doc_url");
	const token = readYamlScalar(body, "lark_doc_token");
	return {
		doc: token || url,
		token,
		url
	};
}

function readYamlScalar(frontmatter: string, key: string): string {
	const match = frontmatter.match(new RegExp(`^${key}:\\s*["']?([^"'\\n]+)["']?\\s*$`, "m"));
	return match?.[1]?.trim() || "";
}

async function readSyncState(plugin: SideMarkPlugin): Promise<LarkSyncStateFile | null> {
	const adapter = plugin.app.vault.adapter;
	if (!(adapter instanceof FileSystemAdapter)) {
		return null;
	}

	const statePath = `${plugin.app.vault.configDir}/plugins/${LARK_SYNC_PLUGIN_ID}/${SYNC_STATE_FILE}`;
	if (!await adapter.exists(statePath)) {
		return null;
	}
	const parsed = JSON.parse(await adapter.read(statePath)) as unknown;
	if (!parsed || typeof parsed !== "object" || !("documents" in parsed)) {
		return null;
	}
	return parsed as LarkSyncStateFile;
}

function findDocumentState(state: LarkSyncStateFile | null, doc: string): LarkSyncStateFile["documents"][string] | null {
	if (!state) {
		return null;
	}
	const token = extractDocumentToken(doc);
	return state.documents[token] || state.documents[doc] || null;
}

function extractDocumentToken(doc: string): string {
	try {
		const url = new URL(doc);
		return url.pathname.match(/\/(?:wiki|docx|doc)\/([^/?#]+)/)?.[1] || doc;
	} catch {
		return doc.match(/\/(?:wiki|docx|doc)\/([^/?#]+)/)?.[1] || doc;
	}
}

function buildCommentElements(text: string): string {
	return JSON.stringify([{ type: "text", text }]);
}

function buildReplyBody(text: string): string {
	return JSON.stringify({
		content: {
			elements: [{
				type: "text_run",
				text_run: { text }
			}]
		}
	});
}

async function syncRepliesToExistingLarkComment(
	plugin: SideMarkPlugin,
	binding: { doc: string; token?: string; url?: string },
	mark: SideMark,
	replies: LarkReply[]
): Promise<RemoteSyncState> {
	const commentId = mark.remote?.larkCommentId;
	if (!commentId) {
		throw new Error(plugin.t("error.missingLarkCommentId"));
	}

	const syncedReplyCount = findSyncedReplyCount(plugin, mark, replies);
	const pendingReplies = replies.slice(syncedReplyCount);
	let lastReplyId = mark.remote?.larkReplyId;
	const knownReplyIds = getStoredLarkReplyIdList(mark.remote);
	const replyIds = knownReplyIds.length === syncedReplyCount
		? [...knownReplyIds]
		: syncedReplyCount === 1 && lastReplyId
			? [lastReplyId]
			: [];
	for (const reply of pendingReplies) {
		const result = await runLarkCreateReply(plugin, {
			doc: binding.doc,
			commentId,
			content: buildReplyBody(reply.content)
		});
		if (!result.ok) {
			throw new Error(result.error?.message || result.error?.hint || plugin.t("error.larkCreateReplyFailed"));
		}
		lastReplyId = result.data?.reply_id || lastReplyId;
		if (result.data?.reply_id) {
			replyIds.push(result.data.reply_id);
		}
	}

	return {
		...mark.remote,
		status: "synced",
		larkDocToken: binding.token || mark.remote?.larkDocToken,
		larkDocUrl: binding.url || mark.remote?.larkDocUrl,
		larkCommentId: commentId,
		larkReplyId: lastReplyId,
		larkReplyIds: replyIds.length === replies.length ? replyIds : undefined,
		syncedHash: buildSyncedHash(mark.anchor.selectedText, replies),
		syncedAt: new Date().toISOString(),
		error: undefined
	};
}

function findPendingReplies(plugin: SideMarkPlugin, mark: SideMark, replies: LarkReply[]): LarkReply[] {
	const syncedReplyCount = findSyncedReplyCount(plugin, mark, replies);
	return replies.slice(syncedReplyCount);
}

function findSyncedReplyCount(plugin: SideMarkPlugin, mark: SideMark, replies: LarkReply[]): number {
	const syncedHash = mark.remote?.syncedHash;
	if (syncedHash === undefined) {
		throw new Error(plugin.t("error.missingSyncRecord"));
	}
	const syncedThreadContent = readSyncedThreadContent(syncedHash, mark.anchor.selectedText);
	if (syncedThreadContent === null) {
		throw new Error(plugin.t("error.commentAnchorChanged"));
	}

	for (let index = 0; index <= replies.length; index++) {
		if (getThreadContent(replies.slice(0, index)) === syncedThreadContent) {
			return index;
		}
	}
	throw new Error(plugin.t("error.syncedCommentChanged"));
}

function readSyncedThreadContent(syncedHash: string, selectedText: string): string | null {
	const prefix = `${selectedText}\n`;
	if (!syncedHash.startsWith(prefix)) {
		return null;
	}
	return syncedHash.slice(prefix.length);
}

function getReplies(plugin: SideMarkPlugin, mark: SideMark): LarkReply[] {
	return mark.replies?.length
		? mark.replies
		: mark.note.content.trim()
			? [{
				authorName: plugin.settings.commentAuthorName,
				content: mark.note.content,
				createdAt: mark.note.createdAt
			}]
			: [];
}

function getThreadContent(replies: LarkReply[]): string {
	return replies.map((reply) => reply.content).join("\n\n");
}

function buildSyncedHash(selectedText: string, replies: LarkReply[]): string {
	return `${selectedText}\n${getThreadContent(replies)}`;
}

async function runLarkCreateComment(plugin: SideMarkPlugin, input: { doc: string; blockId: string; content: string }): Promise<LarkCliResult> {
	try {
		const replyElements: unknown = JSON.parse(input.content);
		return normalizeLarkCommentResult(plugin, await runLarkCliViaSyncPlugin(plugin, [
			"drive",
			"file.comments",
			"create_v2",
			"--as",
			"user",
			"--file-token",
			extractDocumentToken(input.doc),
			"--data",
			JSON.stringify({
				file_type: "docx",
				reply_elements: replyElements,
				anchor: {
					block_id: input.blockId
				}
			}),
			"--json"
		]));
	} catch (error) {
		const message = getExecErrorMessage(error);
		if (message) {
			throw new Error(message);
		}
		throw error;
	}
}

async function runLarkCreateReply(plugin: SideMarkPlugin, input: { doc: string; commentId: string; content: string }): Promise<LarkCliResult> {
	try {
		return normalizeLarkCommentResult(plugin, await runLarkCliViaSyncPlugin(plugin, [
			"drive",
			"file.comment.replys",
			"create",
			"--as",
			"user",
			"--file-token",
			extractDocumentToken(input.doc),
			"--file-type",
			"docx",
			"--comment-id",
			input.commentId,
			"--data",
			input.content,
			"--json"
		]));
	} catch (error) {
		const message = getExecErrorMessage(error);
		if (message) {
			throw new Error(message);
		}
		throw error;
	}
}

async function runLarkPatchComment(plugin: SideMarkPlugin, input: { doc: string; commentId: string; isSolved: boolean }): Promise<LarkCliResult> {
	try {
		return await runLarkCliViaSyncPlugin(plugin, [
			"drive",
			"file.comments",
			"patch",
			"--as",
			"user",
			"--file-token",
			extractDocumentToken(input.doc),
			"--file-type",
			"docx",
			"--comment-id",
			input.commentId,
			"--data",
			JSON.stringify({ is_solved: input.isSolved }),
			"--json"
		]);
	} catch (error) {
		const message = getExecErrorMessage(error);
		if (message) {
			throw new Error(message);
		}
		throw error;
	}
}

async function findLarkReplyIds(plugin: SideMarkPlugin, doc: string, commentId: string): Promise<string[]> {
	try {
		const args = buildLarkReplyListArgs(extractDocumentToken(doc), commentId);
		const result = await runLarkCliViaSyncPlugin(plugin, args);
		assertLarkCommandOk(result, plugin.t("error.larkGetRepliesFailed"));
		return getLarkReplyIds(result);
	} catch (error) {
		const message = getExecErrorMessage(error);
		if (message) {
			throw new Error(message);
		}
		throw error;
	}
}

async function runLarkDeleteReply(plugin: SideMarkPlugin, input: { doc: string; commentId: string; replyId: string }): Promise<LarkCliResult> {
	try {
		return await runLarkCliViaSyncPlugin(plugin, [
			"drive",
			"file.comment.replys",
			"delete",
			"--as",
			"user",
			"--file-token",
			extractDocumentToken(input.doc),
			"--file-type",
			"docx",
			"--comment-id",
			input.commentId,
			"--reply-id",
			input.replyId,
			"--yes",
			"--json"
		]);
	} catch (error) {
		const message = getExecErrorMessage(error);
		if (message) {
			throw new Error(message);
		}
		throw error;
	}
}

async function runLarkCliViaSyncPlugin(plugin: SideMarkPlugin, args: string[]): Promise<LarkCliResult> {
	const status = getLarkSyncPluginStatus(plugin);
	if (status !== "enabled") {
		throw new Error(plugin.t("error.larkPluginUnavailable", {
			status: getLarkSyncPluginStatusText(status, plugin.settings.language)
		}));
	}
	const syncPlugin = getLarkSyncPluginBridge(plugin);
	return await executeLarkCliCommand(syncPlugin, args, plugin.t("error.larkPluginNoCli"));
}

function getExecErrorMessage(error: unknown): string {
	if (!error || typeof error !== "object") {
		return "";
	}
	const execError = error as { stderr?: string; stdout?: string; message?: string };
	return (execError.stderr || execError.stdout || execError.message || "").trim();
}

function getLarkSyncPluginBridge(plugin: SideMarkPlugin): LarkSyncPluginBridge | null {
	return getObsidianPluginManager(plugin)?.getPlugin?.(LARK_SYNC_PLUGIN_ID) as LarkSyncPluginBridge | null;
}

function getObsidianPluginManager(plugin: SideMarkPlugin): ObsidianPluginManager | null {
	return ((plugin.app as AppWithPluginManager).plugins || null);
}

function normalizeLarkCommentResult(plugin: SideMarkPlugin, result: LarkCliResult): LarkCliResult {
	if (typeof result.ok === "boolean") {
		return result;
	}
	if (result.comment_id || result.reply_id) {
		return {
			ok: true,
			data: {
				comment_id: result.comment_id,
				reply_id: result.reply_id
			}
		};
	}
	return {
		ok: false,
		error: {
			message: plugin.t("error.larkNoCommentId")
		}
	};
}
