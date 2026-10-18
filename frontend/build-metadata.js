import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

function readGit(args) {
	try {
		return execFileSync("git", args, {
			cwd: projectRoot,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		return "";
	}
}

export function parseGithubRepository(remoteUrl) {
	const match = String(remoteUrl || "")
		.trim()
		.match(/github\.com[/:]([^/:\s]+)\/([^/\s]+?)(?:\.git)?$/i);
	return match ? `${match[1]}/${match[2]}` : "";
}

export function resolveBuildMetadata({ env = process.env, git = readGit } = {}) {
	const repository =
		String(env.GITHUB_REPOSITORY || "").trim() ||
		parseGithubRepository(git(["remote", "get-url", "origin"]));
	const commit =
		String(env.GITHUB_SHA || "").trim().toLowerCase() ||
		String(git(["rev-parse", "HEAD"]) || "")
			.trim()
			.toLowerCase();
	const branch =
		String(env.GITHUB_REF_NAME || "").trim() ||
		String(git(["branch", "--show-current"]) || "").trim();
	const dirty = env.GITHUB_SHA ? false : Boolean(git(["status", "--porcelain"]));

	return {
		repository,
		commit,
		branch,
		dirty,
	};
}
