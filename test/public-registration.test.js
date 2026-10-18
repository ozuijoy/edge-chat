import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const adminSitePage = readFileSync(
	new URL("../frontend/src/pages/AdminSitePage.vue", import.meta.url),
	"utf8",
);
const loginPage = readFileSync(
	new URL("../frontend/src/pages/LoginPage.vue", import.meta.url),
	"utf8",
);
const workerEntry = readFileSync(
	new URL("../worker/src/index.js", import.meta.url),
	"utf8",
);

test("设置与登录页不再暴露未实现的公开注册功能", () => {
	assert.doesNotMatch(adminSitePage, /allowPublicRegister|允许公开注册/);
	assert.doesNotMatch(loginPage, /allowPublicRegister|\/register\/public|没有账号.*注册/);
	assert.match(workerEntry, /app\.get\('\/api\/register-links\/:token'/);
	assert.match(workerEntry, /app\.post\('\/api\/register-links\/:token\/register'/);
});
