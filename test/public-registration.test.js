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

test("設置與登錄頁不再暴露未實現的公開註冊功能", () => {
	assert.doesNotMatch(adminSitePage, /allowPublicRegister|允許公開註冊/);
	assert.doesNotMatch(loginPage, /allowPublicRegister|\/register\/public|沒有賬號.*註冊/);
	assert.match(workerEntry, /app\.get\('\/api\/register-links\/:token'/);
	assert.match(workerEntry, /app\.post\('\/api\/register-links\/:token\/register'/);
});
