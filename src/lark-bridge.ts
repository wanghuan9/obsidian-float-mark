import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import { FileSystemAdapter, TFile } from "obsidian";
import type SideMarkPlugin from "./main";
import { findRemoteBlockId, type RemoteUnit } from "./block-map";
import type { RemoteSyncState, SideMark } from "./types";

const execFileAsync = promisify(execFile);
const SYNC_PLUGIN_ID = "feishu-lark-cli-sync";
const SYNC_STATE_FILE = "lark-sync-state.json";

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
	const result = await runLarkCreateComment(plugin.settings.larkCliPath, {
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
			await runLarkCreateReply(plugin.settings.larkCliPath, {
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

	const statePath = `${plugin.app.vault.configDir}/plugins/${SYNC_PLUGIN_ID}/${SYNC_STATE_FILE}`;
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

async function runLarkCreateComment(larkCliPath: string, input: { doc: string; blockId: string; content: string }): Promise<LarkCliResult> {
	const cliPath = resolveLarkCliPath(larkCliPath);
	let stdout = "";
	try {
		({ stdout } = await execLarkCli(cliPath, [
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
		if (isNotFoundError(error)) {
			throw new Error(`找不到 lark-cli 或 node：${cliPath}。请确认 /opt/homebrew/bin/node 和 /Users/wanghuan/.npm-global/bin/lark-cli 存在。`);
		}
		const message = getExecErrorMessage(error);
		if (message) {
			throw new Error(message);
		}
		throw error;
	}
	return normalizeLarkCommentResult(JSON.parse(stdout) as LarkCliResult);
}

async function runLarkCreateReply(larkCliPath: string, input: { doc: string; commentId: string; content: string }): Promise<void> {
	const cliPath = resolveLarkCliPath(larkCliPath);
	try {
		await execLarkCli(cliPath, [
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
		if (isNotFoundError(error)) {
			throw new Error(`找不到 lark-cli 或 node：${cliPath}。请确认 /opt/homebrew/bin/node 和 /Users/wanghuan/.npm-global/bin/lark-cli 存在。`);
		}
		const message = getExecErrorMessage(error);
		if (message) {
			throw new Error(message);
		}
		throw error;
	}
}

async function execLarkCli(cliPath: string, args: string[]): Promise<{ stdout: string }> {
	const { stdout } = await execFileAsync(cliPath, args, {
		env: {
			...process.env,
			PATH: buildLarkCliPathEnv()
		},
		maxBuffer: 1024 * 1024
	});
	return { stdout };
}

function resolveLarkCliPath(larkCliPath: string): string {
	if (larkCliPath && larkCliPath !== "lark-cli") {
		return larkCliPath;
	}
	const candidates = [
		"/Users/wanghuan/.npm-global/bin/lark-cli",
		"/opt/homebrew/bin/lark-cli",
		"/usr/local/bin/lark-cli"
	];
	return candidates.find((candidate) => existsSync(candidate)) || "lark-cli";
}

function buildLarkCliPathEnv(): string {
	const extraPaths = [
		"/opt/homebrew/bin",
		"/usr/local/bin",
		"/usr/bin",
		"/bin",
		"/Users/wanghuan/.npm-global/bin"
	];
	return [...extraPaths, process.env.PATH || ""].filter(Boolean).join(":");
}

function isNotFoundError(error: unknown): boolean {
	return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "ENOENT");
}

function getExecErrorMessage(error: unknown): string {
	if (!error || typeof error !== "object") {
		return "";
	}
	const execError = error as { stderr?: string; stdout?: string; message?: string };
	return (execError.stderr || execError.stdout || execError.message || "").trim();
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
