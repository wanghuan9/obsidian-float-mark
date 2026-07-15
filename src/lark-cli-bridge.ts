export interface LarkCliResult {
	ok?: boolean;
	data?: {
		comment_id?: string;
		reply_id?: string;
		items?: Array<{
			reply_id?: string;
		}>;
	};
	items?: Array<{
		reply_id?: string;
	}>;
	comment_id?: string;
	reply_id?: string;
	error?: {
		message?: string;
		hint?: string;
	};
}

export interface LarkSyncPluginBridge {
	runLarkCliCommand?: (args: string[], options?: { cwd?: string }) => Promise<LarkCliResult>;
	runLarkCli?: (args: string[], options?: { cwd?: string }) => Promise<LarkCliResult>;
}

export async function executeLarkCliCommand(
	syncPlugin: LarkSyncPluginBridge | null | undefined,
	args: string[],
	missingCommandMessage: string
): Promise<LarkCliResult> {
	const runLarkCliCommand = syncPlugin?.runLarkCliCommand || syncPlugin?.runLarkCli;
	if (!runLarkCliCommand) {
		throw new Error(missingCommandMessage);
	}
	return await runLarkCliCommand.call(syncPlugin, args);
}

export function buildLarkReplyListArgs(fileToken: string, commentId: string): string[] {
	return [
		"drive",
		"file.comment.replys",
		"list",
		"--as",
		"user",
		"--file-token",
		fileToken,
		"--file-type",
		"docx",
		"--comment-id",
		commentId,
		"--page-size",
		"100",
		"--json"
	];
}

export function getLarkReplyIds(result: LarkCliResult): string[] {
	const items = result.data?.items || result.items || [];
	return items.map((item) => item.reply_id || "").filter(Boolean);
}

export function assertLarkCommandOk(result: LarkCliResult, fallbackMessage: string): void {
	if (result.ok === false) {
		throw new Error(result.error?.message || result.error?.hint || fallbackMessage);
	}
}
