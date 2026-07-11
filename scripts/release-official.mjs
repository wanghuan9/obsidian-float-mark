#!/usr/bin/env node
import { execFile } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";
import { RELEASE_ASSETS } from "./release-assets.mjs";

const execFileAsync = promisify(execFile);

const OFFICIAL_REPO = "obsidianmd/obsidian-releases";
const OFFICIAL_FORK = "wanghuan9/obsidian-releases";
const PLUGIN_REPO = "wanghuan9/obsidian-float-mark";
const OFFICIAL_DESCRIPTION =
	"Add Feishu-style floating selection actions, visual text highlights, side comments, and optional Lark sync support. - This plugin has not been manually reviewed by Obsidian staff.";

async function main() {
	const manifest = await readJson("manifest.json");
	validateManifest(manifest);
	await submitOfficialPluginEntry(manifest);
}

function validateManifest(manifest) {
	const requiredFields = ["id", "name", "version", "minAppVersion", "description", "author"];
	for (const field of requiredFields) {
		if (!manifest[field]) {
			throw new Error(`manifest.json is missing ${field}.`);
		}
	}
}

async function submitOfficialPluginEntry(manifest) {
	const officialPlugins = await readOfficialPluginList();
	if (officialPlugins.some((plugin) => plugin.id === manifest.id || plugin.repo === PLUGIN_REPO)) {
		console.log(`Official plugin entry already exists for ${manifest.id}.`);
		return;
	}

	const tempRoot = await mkdtemp(path.join(os.tmpdir(), "obsidian-releases-"));
	try {
		await ensureOfficialFork();
		await run("gh", ["repo", "sync", OFFICIAL_FORK, "--source", OFFICIAL_REPO, "--branch", "master"]);
		await run("gh", ["repo", "clone", OFFICIAL_FORK, tempRoot, "--", "--depth", "1"]);
		const branchName = `feature/${manifest.id}-community-release-${manifest.version}`;
		await run("git", ["switch", "-c", branchName], { cwd: tempRoot });
		await appendOfficialEntry(tempRoot, {
			id: manifest.id,
			name: manifest.name,
			author: manifest.author,
			description: OFFICIAL_DESCRIPTION,
			repo: PLUGIN_REPO
		});
		await run("node", ["-e", "JSON.parse(require('fs').readFileSync('community-plugins.json','utf8'))"], { cwd: tempRoot });
		await run("git", ["add", "community-plugins.json"], { cwd: tempRoot });
		await run("git", ["commit", "-m", `Add ${manifest.name} plugin`], { cwd: tempRoot });
		await run("git", ["push", "-u", "origin", branchName], { cwd: tempRoot });
		await createOfficialPullRequest(branchName, manifest);
	} finally {
		await rm(tempRoot, { recursive: true, force: true });
	}
}

async function readOfficialPluginList() {
	const result = await run("gh", [
		"api",
		"repos/obsidianmd/obsidian-releases/contents/community-plugins.json",
		"-H",
		"Accept: application/vnd.github.raw"
	], { silent: true });
	return JSON.parse(result.stdout);
}

async function ensureOfficialFork() {
	const view = await runResult("gh", ["repo", "view", OFFICIAL_FORK, "--json", "nameWithOwner"], { silent: true });
	if (view.ok) {
		return;
	}
	await run("gh", ["repo", "fork", OFFICIAL_REPO, "--clone=false", "--remote=false"]);
}

async function appendOfficialEntry(repoDir, entry) {
	const file = path.join(repoDir, "community-plugins.json");
	const content = await readFile(file, "utf8");
	const insertIndex = content.lastIndexOf("\n]");
	if (insertIndex === -1) {
		throw new Error("Cannot find end of community-plugins.json array.");
	}

	const entryJson = JSON.stringify(entry, null, 2)
		.split("\n")
		.map((line) => `  ${line}`)
		.join("\n");
	const nextContent = `${content.slice(0, insertIndex)},\n${entryJson}${content.slice(insertIndex)}`;
	await writeFile(file, nextContent);
}

async function createOfficialPullRequest(branchName, manifest) {
	const title = `Add ${manifest.name} plugin`;
	const body = `## Plugin

- ID: ${manifest.id}
- Name: ${manifest.name}
- Repository: https://github.com/${PLUGIN_REPO}
- Release: https://github.com/${PLUGIN_REPO}/releases/tag/${manifest.version}

## Validation

- Root manifest uses Marketplace-compliant ID \`${manifest.id}\`.
- Release tag \`${manifest.version}\` matches \`manifest.json.version\`.
- Release assets include \`${RELEASE_ASSETS.join("`, `")}\`.
- Repository includes \`versions.json\` with \`${manifest.version}\` mapped to \`${manifest.minAppVersion}\`.
`;

	const result = await runResult("gh", [
		"pr",
		"create",
		"--repo",
		OFFICIAL_REPO,
		"--base",
		"master",
		"--head",
		`wanghuan9:${branchName}`,
		"--title",
		title,
		"--body",
		body
	]);

	if (result.ok) {
		console.log(result.stdout.trim());
		return;
	}

	const compareBranch = encodeURIComponent(branchName).replaceAll("%2F", "%2F");
	console.log("Could not create the official PR automatically.");
	console.log(`Open this URL instead: https://github.com/${OFFICIAL_REPO}/compare/master...wanghuan9:${compareBranch}?expand=1`);
}

async function readJson(file) {
	return JSON.parse(await readFile(file, "utf8"));
}

async function run(command, args, options = {}) {
	if (!options.silent) {
		console.log(`> ${[command, ...args].join(" ")}`);
	}
	return execFileAsync(command, args, {
		cwd: options.cwd,
		maxBuffer: 50 * 1024 * 1024
	});
}

async function runResult(command, args, options = {}) {
	try {
		const result = await run(command, args, options);
		return { ok: true, ...result };
	} catch (error) {
		return {
			ok: false,
			stdout: error.stdout || "",
			stderr: error.stderr || "",
			error
		};
	}
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(message);
	process.exit(1);
});
