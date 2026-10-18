import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { useContacts } from "../frontend/src/composables/useContacts.ts";

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("通訊錄摘要按名稱穩定排序並同時搜索顯示名與用戶名", async () => {
	let calls = 0;
	const contacts = useContacts({
		async getContacts() {
			calls += 1;
			return { users: [
				{ id: 4, username: "zulu", displayName: "Same", avatarUrl: "" },
				{ id: 2, username: "alpha", displayName: "Same", avatarUrl: "" },
				{ id: 3, username: "needle-account", displayName: "Beta", avatarUrl: "" },
			] };
		},
	});
	await contacts.load();
	await contacts.load();
	assert.equal(calls, 1, "首次加載後不重複讀取目錄");
	assert.deepEqual(contacts.filteredUsers.value.map((user) => user.id), [3, 2, 4]);
	contacts.query.value = "NEEDLE";
	assert.deepEqual(contacts.filteredUsers.value.map((user) => user.id), [3]);
	contacts.query.value = "same";
	assert.deepEqual(contacts.filteredUsers.value.map((user) => user.id), [2, 4]);
	contacts.query.value = "";
	assert.equal(contacts.filteredUsers.value.length, 3);
});

test("通訊錄失敗狀態可重試且不會把失敗投影為空列表", async () => {
	let calls = 0;
	const contacts = useContacts({
		async getContacts() {
			calls += 1;
			if (calls === 1) throw new Error("offline");
			return { users: [{ id: 1, username: "self", displayName: "Self", avatarUrl: "" }] };
		},
	});
	await contacts.load();
	assert.equal(contacts.error.value, "offline");
	assert.equal(contacts.loading.value, false);
	await contacts.load(true);
	assert.equal(contacts.error.value, "");
	assert.equal(contacts.filteredUsers.value.length, 1);
	contacts.dispose();
	await flush();
});

test("通訊錄頁面只渲染頭像和一個名字並複用資料卡與工作區生命週期", () => {
	const read = (path) => readFileSync(new URL(`../frontend/src/${path}`, import.meta.url), "utf8");
	const page = read("pages/ContactsPage.vue");
	const chat = read("pages/ChatPage.vue");
	const app = read("App.vue");
	const router = read("router.js");
	assert.match(page, /<UiAvatar/);
	assert.match(page, /<span>\{\{ user\.displayName \|\| user\.username \}\}<\/span>/);
	assert.doesNotMatch(page, /user\.bio|createdAt|lastActive|send-message/);
	assert.match(page, /@click="emit\('openProfile', user\)"/);
	assert.match(page, /min-height:\s*80px/);
	assert.match(page, /text-overflow:\s*ellipsis/);
	assert.match(page, /safe-area-inset-bottom/);
	assert.match(router, /path:\s*'\/contacts'[\s\S]*component:\s*\(\) => import\('\.\/pages\/ChatPage\.vue'\)/);
	assert.match(app, /route\.meta\.workspace \? 'workspace' : route\.path/);
	assert.match(chat, /activeRoom:\s*inboxActiveRoom/);
	assert.match(chat, /roomVisible:\s*computed\(\(\) => !isContactsView\.value\)/);
	assert.match(chat, /inboxActiveRoom = computed\(\(\) => isContactsView\.value \? null : activeRoom\.value\)/);
	assert.match(chat, /watch\(isContactsView,[\s\S]*pauseRoom\(\)[\s\S]*activateRoom\(\)/);
	assert.match(chat, /v-if="!isContactsView" class="chat-main"/);
	assert.match(chat, /v-if="contactsVisited"[\s\S]*v-show="isContactsView"/);
	assert.match(page, /:aria-pressed="view === 'blocked'"/);
	assert.match(page, /@click="unblockContact\(user.id\)"/);
	assert.match(chat, /@unblocked="applyBlockState\(\$event, false\)"/);
});

test("拉黑視圖按需讀取、搜索並在成功後移除，失敗保留且可重試", async () => {
	const calls = [];
	let fail = true;
	const blocked = [{ id: 2, username: "alice", displayName: "Alice", avatarUrl: "" }];
	const contacts = useContacts({
		async getContacts() { calls.push("all"); return { users: blocked }; },
		async getBlockedUsers() { calls.push("blocked"); return { users: blocked }; },
		async unblockUser(id) {
			calls.push(id);
			if (fail) throw new Error("offline");
			return { blockedByMe: false };
		},
	});
	await contacts.load();
	assert.deepEqual(calls, ["all"]);
	await contacts.selectView("blocked");
	contacts.query.value = "ALICE";
	assert.equal(contacts.filteredUsers.value.length, 1);
	assert.equal(await contacts.unblock(2), false);
	assert.equal(contacts.actionError.value, "offline");
	assert.equal(contacts.filteredUsers.value.length, 1);
	assert.equal(contacts.savingUserId.value, null);
	fail = false;
	assert.equal(await contacts.unblock(2), true);
	assert.equal(contacts.actionError.value, "");
	assert.equal(contacts.filteredUsers.value.length, 0);
	await contacts.selectView("all");
	assert.equal(contacts.filteredUsers.value.length, 1, "解除不移除全體用戶目錄");
	contacts.dispose();
});

test("切換通訊錄視圖丟棄遲到響應，解除操作不重複提交", async () => {
	let resolveAll;
	let resolveUnblock;
	let writes = 0;
	const user = { id: 2, username: "alice", displayName: "Alice", avatarUrl: "" };
	const contacts = useContacts({
		getContacts: () => new Promise((resolve) => { resolveAll = resolve; }),
		async getBlockedUsers() { return { users: [user] }; },
		unblockUser: () => { writes += 1; return new Promise((resolve) => { resolveUnblock = resolve; }); },
	});
	const pending = contacts.load();
	await contacts.selectView("blocked");
	resolveAll({ users: [] });
	await pending;
	assert.equal(contacts.filteredUsers.value.length, 1);
	const saving = contacts.unblock(2);
	assert.equal(contacts.savingUserId.value, 2);
	assert.equal(await contacts.unblock(2), false);
	await contacts.selectView("all");
	assert.equal(contacts.view.value, "blocked");
	assert.equal(writes, 1);
	resolveUnblock({ blockedByMe: false });
	assert.equal(await saving, true);
	assert.equal(contacts.filteredUsers.value.length, 0);
	contacts.dispose();
});
