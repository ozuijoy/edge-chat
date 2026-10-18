import { getRuntimeUpdateResult, isDemoMode } from './runtime.js';
import { t } from './i18n.js';

const GITHUB_API_BASE = "https://api.github.com";

function normalizeBuildInfo(build) {
	return {
		repository: String(build?.repository || "").trim(),
		commit: String(build?.commit || "").trim().toLowerCase(),
		branch: String(build?.branch || "").trim(),
		dirty: Boolean(build?.dirty),
	};
}

function requireComparableBuild(build) {
	if (build.dirty) {
		throw new Error(t('updates.errors.dirtyBuild'));
	}
	if (!/^[\w.-]+\/[\w.-]+$/.test(build.repository)) {
		throw new Error(t('updates.errors.invalidRepository'));
	}
	if (!/^[0-9a-f]{7,40}$/.test(build.commit)) {
		throw new Error(t('updates.errors.invalidCommit'));
	}
	if (!build.branch) {
		throw new Error(t('updates.errors.missingBranch'));
	}
}

function githubError(response) {
	if (response.status === 404) {
		return new Error(t('updates.errors.commitNotSynced'));
	}
	if (response.status === 403) {
		return new Error(t('updates.errors.rateLimited'));
	}
	return new Error(t('updates.errors.repositoryUnavailable'));
}

export function getBuildInfo() {
	return normalizeBuildInfo(globalThis.__EDGECHAT_BUILD__);
}

export async function checkForUpdates({ build = getBuildInfo(), fetchImpl = globalThis.fetch } = {}) {
	if (isDemoMode) {
		return getRuntimeUpdateResult();
	}
	const current = normalizeBuildInfo(build);
	requireComparableBuild(current);
	if (typeof fetchImpl !== "function") {
		throw new Error(t('updates.errors.fetchUnavailable'));
	}

	const [owner, repositoryName] = current.repository.split("/");
	const compareRef = `${encodeURIComponent(current.commit)}...${encodeURIComponent(current.branch)}`;
	const url = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repositoryName)}/compare/${compareRef}`;
	let response;
	try {
		response = await fetchImpl(url, {
			cache: "no-store",
			headers: {
				Accept: "application/vnd.github+json",
			},
		});
	} catch {
		throw new Error(t('updates.errors.network'));
	}

	if (!response.ok) {
		throw githubError(response);
	}

	const payload = await response.json();
	if (
		!payload ||
		typeof payload.status !== "string" ||
		!Number.isFinite(Number(payload.ahead_by)) ||
		!Number.isFinite(Number(payload.behind_by))
	) {
		throw new Error(t('updates.errors.invalidResponse'));
	}
	const remoteCommitCount = Number(payload?.ahead_by || 0);
	const localCommitCount = Number(payload?.behind_by || 0);
	const commits = Array.isArray(payload?.commits) ? payload.commits : [];
	const latestCommit = commits[commits.length - 1];
	const updateAvailable = remoteCommitCount > 0;
	let state = "current";
	if (updateAvailable) {
		state = payload?.status === "diverged" ? "diverged" : "update-available";
	} else if (localCommitCount > 0) {
		state = "local-ahead";
	}

	return {
		state,
		updateAvailable,
		remoteCommitCount,
		localCommitCount,
		compareUrl:
			String(payload?.html_url || "").trim() ||
			`https://github.com/${current.repository}/compare/${compareRef}`,
		latestCommit: latestCommit
			? {
					sha: String(latestCommit.sha || ""),
					message: String(latestCommit.commit?.message || "").split("\n", 1)[0],
					committedAt: String(latestCommit.commit?.committer?.date || ""),
					url: String(latestCommit.html_url || ""),
				}
			: null,
	};
}
