import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { beforeEach } from "node:test";
import {
	parseGithubRepository,
	resolveBuildMetadata,
} from "../frontend/build-metadata.js";
import { TRADITIONAL_CHINESE_LOCALE, setLocale } from "../frontend/src/i18n.js";
import { checkForUpdates } from "../frontend/src/update-check.js";

beforeEach(() => {
	setLocale(TRADITIONAL_CHINESE_LOCALE);
});

const build = {
	repository: "aozorae/Edgechat",
	commit: "0459f5944b4ebc06bfbb071eefa2bff9cf48c69e",
	branch: "master",
	dirty: false,
};

function createResponse(payload, status = 200) {
	return {
		ok: status >= 200 && status < 300,
		status,
		async json() {
			return payload;
		},
	};
}

test("構建元數據優先使用 GitHub Actions 提供的精確提交信息", () => {
	const metadata = resolveBuildMetadata({
		env: {
			GITHUB_REPOSITORY: "owner/repository",
			GITHUB_SHA: "ABCDEF1234567",
			GITHUB_REF_NAME: "main",
		},
		git() {
			throw new Error("GitHub Actions 構建不應回退讀取本地 Git");
		},
	});

	assert.deepEqual(metadata, {
		repository: "owner/repository",
		commit: "abcdef1234567",
		branch: "main",
		dirty: false,
	});
});

test("本地構建從 origin、當前提交與分支生成更新基線", () => {
	const values = new Map([
		["remote get-url origin", "git@github.com:aozorae/Edgechat.git"],
		["rev-parse HEAD", build.commit],
		["branch --show-current", "master"],
		["status --porcelain", ""],
	]);
	const metadata = resolveBuildMetadata({
		env: {},
		git: (args) => values.get(args.join(" ")) || "",
	});

	assert.deepEqual(metadata, build);
	assert.equal(parseGithubRepository("https://github.com/owner/repository.git"), "owner/repository");
});

test("前端 Compare 檢查確認當前部署已是最新版本", async () => {
	let requestedUrl = "";
	const result = await checkForUpdates({
		build,
		fetchImpl: async (url, options) => {
			requestedUrl = url;
			assert.equal(options.cache, "no-store");
			return createResponse({
				status: "identical",
				ahead_by: 0,
				behind_by: 0,
				html_url: "https://github.com/aozorae/Edgechat/compare/current",
				commits: [],
			});
		},
	});

	assert.match(requestedUrl, /\/compare\/0459f5944b4ebc06bfbb071eefa2bff9cf48c69e\.\.\.master$/);
	assert.equal(result.state, "current");
	assert.equal(result.updateAvailable, false);
});

test("前端 Compare 檢查能顯示遠端新提交", async () => {
	const result = await checkForUpdates({
		build,
		fetchImpl: async () =>
			createResponse({
				status: "ahead",
				ahead_by: 2,
				behind_by: 0,
				html_url: "https://github.com/aozorae/Edgechat/compare/update",
				commits: [
					{
						sha: "abcdef1234567890",
						html_url: "https://github.com/aozorae/Edgechat/commit/abcdef1",
						commit: {
							message: "feat: add update check\n\nbody",
							committer: { date: "2026-07-29T10:00:00Z" },
						},
					},
				],
			}),
	});

	assert.equal(result.state, "update-available");
	assert.equal(result.updateAvailable, true);
	assert.equal(result.remoteCommitCount, 2);
	assert.equal(result.latestCommit.message, "feat: add update check");
});

test("分叉分支與含斜槓分支名仍能準確生成比較結果", async () => {
	let requestedUrl = "";
	const result = await checkForUpdates({
		build: { ...build, branch: "release/stable" },
		fetchImpl: async (url) => {
			requestedUrl = url;
			return createResponse({
				status: "diverged",
				ahead_by: 3,
				behind_by: 1,
				commits: [],
			});
		},
	});

	assert.match(requestedUrl, /\.\.\.release%2Fstable$/);
	assert.equal(result.state, "diverged");
	assert.equal(result.updateAvailable, true);
	assert.equal(result.remoteCommitCount, 3);
	assert.equal(result.localCommitCount, 1);
});

test("前端 Compare 檢查不會把當前部署領先誤報成可更新", async () => {
	const result = await checkForUpdates({
		build,
		fetchImpl: async () =>
			createResponse({ status: "behind", ahead_by: 0, behind_by: 1, commits: [] }),
	});

	assert.equal(result.state, "local-ahead");
	assert.equal(result.updateAvailable, false);
});

test("未提交構建與 GitHub 限流會返回可理解的檢查結果", async () => {
	await assert.rejects(
		checkForUpdates({ build: { ...build, dirty: true }, fetchImpl: async () => null }),
		/未提交改動/,
	);
	await assert.rejects(
		checkForUpdates({
			build,
			fetchImpl: async () => createResponse({}, 403),
		}),
		/GitHub 檢查次數暫時受限/,
	);
	await assert.rejects(
		checkForUpdates({
			build,
			fetchImpl: async () => createResponse({}, 404),
		}),
		/尚未同步到代碼倉庫/,
	);
	await assert.rejects(
		checkForUpdates({
			build,
			fetchImpl: async () => {
				throw new TypeError("Failed to fetch");
			},
		}),
		/網絡連接失敗/,
	);
	await assert.rejects(
		checkForUpdates({
			build,
			fetchImpl: async () => createResponse({ status: "identical" }),
		}),
		/無法識別的版本信息/,
	);
});

test("更新狀態只掛載在管理員路由保護的網站設置頁", () => {
	const adminSitePage = readFileSync(
		new URL("../frontend/src/pages/AdminSitePage.vue", import.meta.url),
		"utf8",
	);
	const adminUpdateStatus = readFileSync(
		new URL("../frontend/src/components/admin/AdminUpdateStatus.vue", import.meta.url),
		"utf8",
	);
	const router = readFileSync(new URL("../frontend/src/router.js", import.meta.url), "utf8");

	assert.match(adminSitePage, /<AdminUpdateStatus\s*\/>/);
	assert.match(router, /path: '\/admin'[\s\S]*meta: \{ admin: true/);
	assert.match(router, /path: 'site'[\s\S]*meta: \{ admin: true/);
	assert.match(router, /store\.refreshAuthorization\(\)/);
  assert.match(router, /canVisit\(to\.path/);
	assert.match(adminUpdateStatus, /onMounted\(checkUpdates\)/);
	assert.doesNotMatch(adminUpdateStatus, /setInterval|setTimeout/);
});
