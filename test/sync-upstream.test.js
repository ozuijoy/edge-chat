import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	findUpdateCommit,
	syncUpstream,
} from "../.github/scripts/sync-upstream.mjs";

function fixture(t, { customized = false, conflict = false } = {}) {
	const root = mkdtempSync(join(tmpdir(), "edgechat-sync-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const upstream = join(root, "upstream");
	const origin = join(root, "fork.git");
	const checkout = join(root, "checkout");
	function command(cwd, args) {
		return execFileSync("git", args, {
			cwd,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		}).trim();
	}
	command(root, ["init", "--initial-branch=main", upstream]);
	command(upstream, ["config", "user.name", "Test"]);
	command(upstream, ["config", "user.email", "test@example.com"]);
	function commit(message, name, content = message) {
		mkdirSync(join(upstream, name, ".."), { recursive: true });
		writeFileSync(join(upstream, name), content);
		command(upstream, ["add", name]);
		command(upstream, ["commit", "-m", message]);
		return command(upstream, ["rev-parse", "HEAD"]);
	}
	const base = commit("Initial", "package.json", '{"version":"1.0.0"}\n');
	command(root, ["clone", "--bare", upstream, origin]);
	command(root, ["clone", origin, checkout]);
	if (customized || conflict) {
		command(checkout, ["config", "user.name", "Fork owner"]);
		command(checkout, ["config", "user.email", "owner@example.com"]);
		const name = conflict ? "package.json" : "custom.txt";
		writeFileSync(join(checkout, name), "Fork customization\n");
		command(checkout, ["add", name]);
		command(checkout, ["commit", "-m", "Customize fork"]);
		command(checkout, ["push", "origin", "main"]);
	}
	const requests = [];
	let runs = [];
	let failDispatch = false;
	let rejectPush = false;
	return {
		base,
		commit,
		requests,
		setRuns(value) {
			runs = value;
		},
		failDispatch(value) {
			failDispatch = value;
		},
		rejectPush() {
			rejectPush = true;
		},
		originHead: () => command(origin, ["rev-parse", "main"]),
		read: (name) => readFileSync(join(checkout, name), "utf8"),
		git: (args) => command(checkout, args),
		async sync(hasSyncToken = false) {
			return syncUpstream({
				repository: "example/Edgechat",
				branch: "main",
				hasSyncToken,
				git: async (args) => {
					if (rejectPush && args[0] === "push")
						throw new Error("Branch protection rejected push");
					const localArgs = args.map((arg) =>
						arg === "https://github.com/aozorae/Edgechat.git" ? upstream : arg,
					);
					try {
						return command(checkout, localArgs);
					} catch (error) {
						// execFile 的異步錯誤用 code，同步 Git 測試用 status。
						error.code = error.status;
						throw error;
					}
				},
				request: async (path, body) => {
					requests.push({ path, body });
					if (path === "/repos/aozorae/Edgechat")
						return { default_branch: "main" };
					if (path.includes("/runs?")) return { workflow_runs: runs };
					assert.match(
						path,
						/\/actions\/workflows\/deploy-worker.yml\/dispatches$/,
					);
					assert.deepEqual(body, { ref: "main" });
					if (failDispatch) throw new Error("Dispatch failed");
				},
			});
		},
	};
}

test("上游主倉不同步自身也不派發部署", async () => {
	const result = await syncUpstream({
		repository: "aozorae/Edgechat",
		branch: "master",
		git: () => assert.fail("No git on upstream"),
		request: () => assert.fail("No API on upstream"),
	});
	assert.deepEqual(result, { updated: false, dispatched: false });
});

test("沒有發佈 trailer 的提交不會自動同步", async (t) => {
	const f = fixture(t);
	f.commit("Mention EdgeChat-Update: stable in subject", "development.txt");
	f.commit("Unknown\n\nEdgeChat-Update: beta", "beta.txt");
	assert.deepEqual(await f.sync(), { updated: false, dispatched: false });
	assert.equal(f.originHead(), f.base);
	assert.equal(f.requests.length, 1);
});

test("stable 一次合併之前的所有提交與版本，但不包含之後的開發提交", async (t) => {
	const f = fixture(t);
	f.commit("Earlier feature", "feature.txt");
	const release = f.commit(
		"Release\n\nEdgeChat-Update: stable",
		"package.json",
		'{"version":"1.1.0"}\n',
	);
	f.commit("Unreleased development", "development.txt");
	const result = await f.sync();
	assert.deepEqual(result, {
		updated: true,
		dispatched: true,
		commit: f.originHead(),
	});
	f.git(["merge-base", "--is-ancestor", release, "HEAD"]);
	assert.match(f.git(["log", "-1", "--format=%B"]), /\[skip ci\]/);
	assert.equal(f.read("feature.txt"), "Earlier feature");
	assert.equal(JSON.parse(f.read("package.json")).version, "1.1.0");
	assert.throws(() => f.read("development.txt"), { code: "ENOENT" });
	assert.ok(
		f.requests.some(({ path }) => path.includes(`head_sha=${result.commit}`)),
	);
});

test("security 優先跟進最新標記並保留 fork 自定義提交", async (t) => {
	const f = fixture(t, { customized: true });
	f.commit("Stable\n\nEdgeChat-Update: stable", "stable.txt");
	const security = f.commit("Fix\n\nEdgeChat-Update: security", "security.txt");
	const result = await f.sync();
	assert.equal(result.updated, true);
	assert.equal(result.dispatched, true);
	assert.equal(f.read("custom.txt"), "Fork customization\n");
	f.git(["merge-base", "--is-ancestor", security, "HEAD"]);
	assert.equal(f.originHead(), result.commit);
});

test("合併衝突不推送、不派發、不覆蓋自定義版本", async (t) => {
	const f = fixture(t, { conflict: true });
	const before = f.originHead();
	f.commit(
		"Fix\n\nEdgeChat-Update: security",
		"package.json",
		'{"version":"1.0.1"}\n',
	);
	await assert.rejects(f.sync());
	assert.equal(f.originHead(), before);
	assert.equal(f.requests.length, 1);
});

test("分支保護拒絕推送時不派發部署", async (t) => {
	const f = fixture(t);
	f.commit("Release\n\nEdgeChat-Update: stable", "release.txt");
	f.rejectPush();
	await assert.rejects(f.sync(), /Branch protection/);
	assert.equal(f.originHead(), f.base);
	assert.equal(f.requests.length, 1);
});

test("工作流更新必須顯式提供同步令牌，未配置時遠端保持原樣", async (t) => {
	const f = fixture(t);
	f.commit(
		"CI update\n\nEdgeChat-Update: stable",
		".github/workflows/example.yml",
	);
	await assert.rejects(f.sync(), /EDGECHAT_SYNC_TOKEN/);
	assert.equal(f.originHead(), f.base);
	assert.equal(f.requests.length, 1);
	assert.equal((await f.sync(true)).dispatched, true);
});

test("推送後派發失敗，下次檢查對當前 SHA 補派部署", async (t) => {
	const f = fixture(t);
	f.commit("Fix\n\nEdgeChat-Update: security", "fix.txt");
	f.failDispatch(true);
	await assert.rejects(f.sync(), /Dispatch failed/);
	const release = f.originHead();
	f.failDispatch(false);
	assert.deepEqual(await f.sync(), {
		updated: false,
		dispatched: true,
		commit: release,
	});
	f.setRuns([{ status: "completed", conclusion: "failure" }]);
	assert.equal((await f.sync()).dispatched, true);
});

test("當前 SHA 已部署或部署中時不重複派發", async (t) => {
	const f = fixture(t);
	f.commit("Release\n\nEdgeChat-Update: stable", "release.txt");
	await f.sync();
	const release = f.originHead();
	for (const run of [
		{ status: "completed", conclusion: "success" },
		{ status: "queued", conclusion: null },
		{ status: "in_progress", conclusion: null },
	]) {
		f.requests.length = 0;
		f.setRuns([run]);
		assert.deepEqual(await f.sync(), {
			updated: false,
			dispatched: false,
			commit: release,
		});
		assert.equal(f.requests.length, 2);
	}
});

test("標記選擇僅接受兩個約定值並選擇最新提交", () => {
	assert.equal(findUpdateCommit(""), undefined);
	assert.deepEqual(
		findUpdateCommit("new\0beta\0\nsecurity\0security\n\0\nstable\0stable\n\0"),
		{ commit: "security", kind: "security" },
	);
});

test("每天兩次檢查，機器人推送後顯式 dispatch，檢查階段不讀取雲憑據", () => {
	const workflow = readFileSync(
		new URL("../.github/workflows/sync-upstream.yml", import.meta.url),
		"utf8",
	);
	assert.match(workflow, /cron: "17 1,13 \* \* \*"/);
	assert.match(workflow, /workflow_dispatch:/);
	assert.match(workflow, /contents: write/);
	assert.match(workflow, /actions: write/);
	assert.match(workflow, /fetch-depth: 0/);
	assert.match(
		workflow,
		/ref: \$\{\{ github.event.repository.default_branch \}\}/,
	);
	assert.match(workflow, /cancel-in-progress: false/);
	assert.match(workflow, /run: node .github\/scripts\/sync-upstream.mjs/);
	assert.doesNotMatch(workflow, /CLOUDFLARE|pull_request|push:/);
	const script = readFileSync(
		new URL("../.github/scripts/sync-upstream.mjs", import.meta.url),
		"utf8",
	);
	assert.doesNotMatch(script, /["']--force["']/);
	assert.match(
		script,
		/request\(`\$\{workflowPath\}\/dispatches`, \{ ref: branch \}\)/,
	);
});
