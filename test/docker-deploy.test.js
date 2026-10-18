import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("Docker 初始化複用生產密碼生成器且不提交默認密碼", async () => {
	const [script, guide] = await Promise.all([
		readFile(new URL("docker-start.sh", root), "utf8"),
		readFile(new URL("DOCKER.md", root), "utf8"),
	]);

	assert.match(script, /EDGECHAT_ADMIN_PASSWORD/);
	assert.match(script, /generate-admin-bootstrap-sql\.mjs/);
	assert.match(script, /api\/health/);
	assert.doesNotMatch(script, /admin123/);
	assert.doesNotMatch(guide, /默認管理員賬戶/);
});
