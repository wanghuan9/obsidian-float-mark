import { FileSystemAdapter, TFile } from "obsidian";
import type SideMarkPlugin from "./main";
import { findRemoteBlockId, type RemoteUnit } from "./block-map";
import type { RemoteSyncState, SideMark } from "./types";

export const LARK_SYNC_PLUGIN_ID = "feishu-lark-cli-sync";
const SYNC_STATE_FILE = "lark-sync-state.json";

export type LarkSyncPluginStatus = "enabled" | "disabled" | "not-installed" | "unknown";

interface LarkSyncStateFile {
	version: 1;
	documents: Record<string, {
		doc: string;
		revisionId?: number;
		units: RemoteUnit[];
	}>;
}

interface LarkCliResult {
	ok?: boolean;
	data?: {
		comment_id?: string;
		reply_id?: string;
	};
	comment_id?: string;
	reply_id?: string;
	error?: {
		message?: string;
		hint?: string;
	};
}

interface LarkReply {
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

interface LarkSyncPluginBridge {
	runLarkCliCommand?: (args: string[], options?: { cwd?: string }) => Promise<LarkCliResult>;
	runLarkCli?: (args: string[], options?: { cwd?: string }) => Promise<LarkCliResult>;
}

export async function syncMarkToLark(plugin: SideMarkPlugin, file: TFile, source: string, mark: SideMark): Promise<RemoteSyncState> {
	const binding = readLarkBinding(source);
	if (!binding.doc) {
		throw new Error("当前笔记没有 lark_doc_url 或 lark_doc_token。请先用 Feishu Lark CLI Sync 同步这篇文档。");
	}

	const syncState = await readSyncState(plugin);
	const docState = findDocumentState(syncState, binding.doc);
	if (!docState || !docState.units.length) {
		throw new Error("没有找到飞书 block 映射。请先用 Feishu Lark CLI Sync 同步一次当前文档。");
	}

	const blockId = findRemoteBlockId(source, docState.units, mark.anchor.startOffset, mark.anchor.endOffset);
	if (!blockId) {
		throw new Error("没有找到该标注命中的第一个飞书 block。");
	}

	const replies = getReplies(mark);
	const [firstReply, ...restReplies] = replies.length
		? replies
		: [{ content: "（无评论）" }];
	const result = await runLarkCreateComment(plugin, {
		doc: binding.doc,
		blockId,
		content: buildCommentElements(firstReply.content)
	});
	if (!result.ok) {
		throw new Error(result.error?.message || result.error?.hint || "lark-cli 添加评论失败。");
	}
	const commentId = result.data?.comment_id;
	if (commentId) {
		for (const reply of restReplies) {
			await runLarkCreateReply(plugin, {
				doc: binding.doc,
				commentId,
				content: buildReplyBody(reply.content)
			});
		}
	}

	return {
		status: "synced",
		larkDocToken: binding.token,
		larkDocUrl: binding.url,
		larkCommentId: commentId,
		larkReplyId: result.data?.reply_id,
		blockId,
		syncedHash: `${mark.anchor.selectedText}\n${getThreadContent(replies)}`,
		syncedAt: new Date().toISOString()
	};
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

export function getLarkSyncPluginStatusText(status: LarkSyncPluginStatus): string {
	switch (status) {
		case "enabled":
			return "状态：Feishu Lark CLI Sync 已启用。";
		case "disabled":
			return "状态：Feishu Lark CLI Sync 已安装但未启用。";
		case "not-installed":
			return "状态：未安装 Feishu Lark CLI Sync。";
		case "unknown":
			return "状态：无法检测 Feishu Lark CLI Sync。";
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

function getReplies(mark: SideMark): LarkReply[] {
	return mark.replies?.length
		? mark.replies
		: mark.note.content.trim()
			? [{
				authorName: "我",
				content: mark.note.content,
				createdAt: mark.note.createdAt
			}]
			: [];
}

function getThreadContent(replies: LarkReply[]): string {
	return replies.map((reply) => reply.content).join("\n\n");
}

async function runLarkCreateComment(plugin: SideMarkPlugin, input: { doc: string; blockId: string; content: string }): Promise<LarkCliResult> {
	try {
		return normalizeLarkCommentResult(await runLarkCliViaSyncPlugin(plugin, [
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
				reply_elements: JSON.parse(input.content),
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

async function runLarkCreateReply(plugin: SideMarkPlugin, input: { doc: string; commentId: string; content: string }): Promise<void> {
	try {
		await runLarkCliViaSyncPlugin(plugin, [
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
		throw new Error(`${getLarkSyncPluginStatusText(status)} 请先安装并启用该插件。`);
	}
	const syncPlugin = getLarkSyncPluginBridge(plugin);
	const runLarkCliCommand = syncPlugin?.runLarkCliCommand || syncPlugin?.runLarkCli;
	if (!runLarkCliCommand) {
		throw new Error("Feishu Lark CLI Sync 未暴露 CLI 执行能力，请升级该插件。");
	}
	return await runLarkCliCommand.call(syncPlugin, args);
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

function normalizeLarkCommentResult(result: LarkCliResult): LarkCliResult {
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
			message: "lark-cli 未返回 comment_id。"
		}
	};
}
