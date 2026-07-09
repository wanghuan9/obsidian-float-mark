#!/usr/bin/env node
import { execFile } from "child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const VERSION_FILES = ["package.json", "package-lock.json", "manifest.json", "versions.json"];
const RELEASE_ASSETS = ["main.js", "manifest.json", "styles.css"];
const SEMVER_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;
const OFFICIAL_REPO = "obsidianmd/obsidian-releases";
const OFFICIAL_FORK = "wanghuan9/obsidian-releases";
const PLUGIN_REPO = "wanghuan9/obsidian-float-mark";
const OFFICIAL_DESCRIPTION =
	"Add Feishu-style floating selection actions, visual text highlights, side comments, and optional Lark sync support. - This plugin has not been manually reviewed by Obsidian staff.";

async function main() {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) {
		printUsage();
		return;
	}

	const packageJson = await readJson("package.json");
	const manifest = await readJson("manifest.json");
	const versions = await readJson("versions.json");
	validateManifest(manifest);

	if (options.mode === "check") {
		await runChecks(packageJson.version, packageJson, manifest, versions);
		if (options.submitOfficial) {
			await submitOfficialPluginEntry();
		}
		console.log(`Release check passed for ${packageJson.version}.`);
		return;
	}

	const targetVersion = options.version || bumpVersion(packageJson.version, options.bump);
	assertVersion(targetVersion);
	await assertTrackedTreeClean();
	await assertRemoteInSync();
	await assertTagDoesNotExist(targetVersion);
	await assertReleaseDoesNotExist(targetVersion);

	await updateVersionFiles(targetVersion, manifest.minAppVersion);
	await runChecks(targetVersion, await readJson("package.json"), await readJson("manifest.json"), await readJson("versions.json"));

	const releaseNotes = await generateReleaseNotes(targetVersion);
	await commitTagAndPush(targetVersion);
	await createGitHubRelease(targetVersion, releaseNotes);
	await validateRemoteRelease(targetVersion);

	if (options.submitOfficial) {
		await submitOfficialPluginEntry();
	}

	console.log(`Release ${targetVersion} completed.`);
}

function parseArgs(args) {
	const options = {
		bump: "patch",
		help: false,
		mode: "check",
		submitOfficial: false,
		version: ""
	};

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];
		if (arg === "--help" || arg === "-h") {
			options.help = true;
		} else if (arg === "--check") {
			options.mode = "check";
		} else if (arg === "--publish") {
			options.mode = "publish";
		} else if (arg === "--submit-official") {
			options.submitOfficial = true;
		} else if (arg === "--version") {
			options.version = readRequiredValue(args, index, arg);
			index += 1;
		} else if (arg === "--patch" || arg === "--minor" || arg === "--major") {
			options.bump = arg.slice(2);
		} else {
			throw new Error(`Unknown argument: ${arg}`);
		}
	}

	return options;
}

function readRequiredValue(args, index, name) {
	const value = args[index + 1];
	if (!value || value.startsWith("--")) {
		throw new Error(`${name} requires a value.`);
	}
	return value;
}

function printUsage() {
	console.log(`Usage:
  npm run release:check
  npm run release:publish
  npm run release:publish -- --version 0.2.0
  npm run release:publish -- --minor
  npm run release:official

Options:
  --check             Validate the current release files. Default.
  --publish           Bump version, build, test, commit, tag, push, and create a GitHub release.
  --submit-official   Add the plugin to obsidianmd/obsidian-releases if it is not listed yet.
  --version <version> Publish an explicit plain semver version.
  --patch             Bump patch from package.json version. Default for --publish.
  --minor             Bump minor from package.json version.
  --major             Bump major from package.json version.
  --help              Show this help.
`);
}

async function runChecks(version, packageJson, manifest, versions) {
	validateVersionFiles(version, packageJson, manifest, versions);
	await run("npm", ["run", "test"]);
	await run("npm", ["run", "build"]);
	await validateReleaseAssets();
}

function validateVersionFiles(version, packageJson, manifest, versions) {
	if (packageJson.version !== version) {
		throw new Error(`package.json version ${packageJson.version} does not match target version ${version}.`);
	}
	if (manifest.version !== version) {
		throw new Error(`manifest.json version ${manifest.version} does not match target version ${version}.`);
	}
	if (versions[version] !== manifest.minAppVersion) {
		throw new Error(`versions.json is missing ${version}: ${manifest.minAppVersion}.`);
	}
}

function validateManifest(manifest) {
	const requiredFields = ["id", "name", "version", "minAppVersion", "description", "author"];
	for (const field of requiredFields) {
		if (!manifest[field]) {
			throw new Error(`manifest.json is missing ${field}.`);
		}
	}
	if (!/^[a-z0-9-]+$/.test(manifest.id)) {
		throw new Error(`manifest.json id must use lowercase letters, numbers, and hyphens: ${manifest.id}`);
	}
	if (manifest.id.includes("obsidian")) {
		throw new Error(`manifest.json id must not contain "obsidian": ${manifest.id}`);
	}
	if (manifest.id.endsWith("plugin")) {
		throw new Error(`manifest.json id must not end with "plugin": ${manifest.id}`);
	}
}

function bumpVersion(version, bump) {
	const match = SEMVER_PATTERN.exec(version);
	if (!match) {
		throw new Error(`Cannot auto-bump non-standard version: ${version}. Use --version instead.`);
	}

	const major = Number.parseInt(match[1], 10);
	const minor = Number.parseInt(match[2], 10);
	const patch = Number.parseInt(match[3], 10);

	if (bump === "major") {
		return `${major + 1}.0.0`;
	}
	if (bump === "minor") {
		return `${major}.${minor + 1}.0`;
	}
	return `${major}.${minor}.${patch + 1}`;
}

function assertVersion(version) {
	if (!SEMVER_PATTERN.test(version)) {
		throw new Error(`Version must be plain semver, for example 1.2.3. Received: ${version}`);
	}
}

async function assertTrackedTreeClean() {
	const unstaged = await runResult("git", ["diff", "--quiet"], { silent: true });
	const staged = await runResult("git", ["diff", "--cached", "--quiet"], { silent: true });
	if (!unstaged.ok || !staged.ok) {
		throw new Error("Tracked working tree changes exist. Commit or stash them before publishing.");
	}
}

async function assertRemoteInSync() {
	const branch = (await run("git", ["branch", "--show-current"], { silent: true })).stdout.trim();
	if (!branch) {
		throw new Error("Cannot publish from detached HEAD.");
	}
	await run("git", ["fetch", "origin", branch]);
	const counts = (await run("git", ["rev-list", "--left-right", "--count", `HEAD...origin/${branch}`], { silent: true })).stdout
		.trim()
		.split(/\s+/);
	if (counts[0] !== "0" || counts[1] !== "0") {
		throw new Error(`Local ${branch} is not in sync with origin/${branch}.`);
	}
}

async function assertTagDoesNotExist(version) {
	const local = await runResult("git", ["rev-parse", "--verify", `refs/tags/${version}`], { silent: true });
	if (local.ok) {
		throw new Error(`Local tag ${version} already exists.`);
	}

	const remote = await run("git", ["ls-remote", "--tags", "origin", version], { silent: true });
	if (remote.stdout.trim()) {
		throw new Error(`Remote tag ${version} already exists.`);
	}
}

async function assertReleaseDoesNotExist(version) {
	const result = await runResult("gh", ["release", "view", version, "--repo", PLUGIN_REPO], { silent: true });
	if (result.ok) {
		throw new Error(`GitHub release ${version} already exists.`);
	}
}

async function updateVersionFiles(version, minAppVersion) {
	const packageJson = await readJson("package.json");
	const packageLock = await readJson("package-lock.json");
	const manifest = await readJson("manifest.json");
	const versions = await readJson("versions.json");

	packageJson.version = version;
	packageLock.version = version;
	if (packageLock.packages?.[""]) {
		packageLock.packages[""].version = version;
	}
	manifest.version = version;
	versions[version] = minAppVersion;

	await writeJson("package.json", packageJson);
	await writeJson("package-lock.json", packageLock);
	await writeJson("manifest.json", manifest);
	await writeJson("versions.json", sortVersionMap(versions));
}

function sortVersionMap(versions) {
	return Object.fromEntries(Object.entries(versions).sort(([left], [right]) => compareVersions(left, right)));
}

function compareVersions(left, right) {
	const leftParts = left.split(".").map((part) => Number.parseInt(part, 10));
	const rightParts = right.split(".").map((part) => Number.parseInt(part, 10));
	for (let index = 0; index < 3; index += 1) {
		const diff = leftParts[index] - rightParts[index];
		if (diff !== 0) {
			return diff;
		}
	}
	return 0;
}

async function validateReleaseAssets() {
	for (const asset of RELEASE_ASSETS) {
		const assetStat = await stat(asset);
		if (!assetStat.isFile() || assetStat.size === 0) {
			throw new Error(`Release asset ${asset} must exist and be non-empty.`);
		}
	}
}

async function generateReleaseNotes(version) {
	const previousTag = await getPreviousTag();
	const range = previousTag ? `${previousTag}..HEAD` : "HEAD";
	const log = await run("git", ["log", "--pretty=format:%s", range], { silent: true });
	const subjects = log.stdout
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	const bullets = subjects.length > 0 ? subjects.map((subject) => `- ${subject}`).join("\n") : "- Release build.";
	return `Release ${version}\n\n${bullets}`;
}

async function getPreviousTag() {
	const result = await runResult("git", ["describe", "--tags", "--abbrev=0"], { silent: true });
	return result.ok ? result.stdout.trim() : "";
}

async function commitTagAndPush(version) {
	const branch = (await run("git", ["branch", "--show-current"], { silent: true })).stdout.trim();
	await run("git", ["add", ...VERSION_FILES, ...RELEASE_ASSETS]);
	await run("git", ["commit", "-m", `chore: release ${version}`]);
	await run("git", ["tag", version]);
	await run("git", ["push", "origin", branch]);
	await run("git", ["push", "origin", `refs/tags/${version}`]);
}

async function createGitHubRelease(version, notes) {
	await run("gh", [
		"release",
		"create",
		version,
		...RELEASE_ASSETS,
		"--repo",
		PLUGIN_REPO,
		"--title",
		version,
		"--notes",
		notes,
		"--verify-tag"
	]);
}

async function validateRemoteRelease(version) {
	const release = JSON.parse((await run("gh", ["release", "view", version, "--repo", PLUGIN_REPO, "--json", "assets,isDraft,isPrerelease"], { silent: true })).stdout);
	if (release.isDraft || release.isPrerelease) {
		throw new Error(`GitHub release ${version} must be a public stable release.`);
	}

	const assetNames = new Set(release.assets.map((asset) => asset.name));
	const missingAssets = RELEASE_ASSETS.filter((asset) => !assetNames.has(asset));
	if (missingAssets.length > 0) {
		throw new Error(`GitHub release ${version} is missing assets: ${missingAssets.join(", ")}.`);
	}
}

async function submitOfficialPluginEntry() {
	const manifest = await readJson("manifest.json");
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

async function writeJson(file, value) {
	await writeFile(file, `${JSON.stringify(value, null, "\t")}\n`);
}

async function run(command, args, options = {}) {
	if (!options.silent) {
		console.log(`> ${[command, ...args].join(" ")}`);
	}
	return await execFileAsync(command, args, {
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
