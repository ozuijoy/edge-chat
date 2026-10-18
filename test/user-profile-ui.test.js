import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ref } from "vue";
import { useUserProfile } from "../frontend/src/composables/useUserProfile.ts";
import { useConversationCreation } from "../frontend/src/composables/useConversationCreation.js";
import { requestDemo } from "../frontend/src/demo/api.js";
import { demoState, resetDemoState, setDemoUserBlocked } from "../frontend/src/demo/state.js";

const local = (id) => ({ kind: "local", id, username: `user${id}`, displayName: `User ${id}`, avatarUrl: "" });
const detail = (id) => ({ ...local(id), bio: `Bio ${id}` });
const flush = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
	let resolve;
	let reject;
	const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
	return { promise, resolve, reject };
}
function harness(overrides = {}) {
	const requests = [];
	const dmCalls = [];
	let navigated = 0;
	const card = useUserProfile({
		currentUserId: ref(1),
		getProfile(id, options) {
			const task = deferred();
			requests.push({ id, options, ...task });
			return task.promise;
		},
		async openDm(user) { dmCalls.push(user); return { ok: true }; },
		onNavigate() { navigated += 1; },
		...overrides,
	});
	return { card, requests, dmCalls, get navigated() { return navigated; } };
}

test("资料只在打开时读取、同一未完成请求去重、A/B 迟到与关闭竞态隔离", async () => {
	const { card, requests, dmCalls } = harness();
	assert.equal(requests.length, 0);
	card.openUserProfile(local(2));
	card.openUserProfile(local(2));
	assert.equal(requests.length, 1);
	card.openUserProfile(local(3));
	assert.equal(requests[0].options.signal.aborted, true);
	requests[1].resolve({ profile: detail(3) });
	await flush();
	requests[0].resolve({ profile: detail(2) });
	await flush();
	assert.equal(card.profile.value.id, 3);
	assert.equal(dmCalls.length, 0);
	card.openUserProfile(local(4));
	card.close();
	requests[2].resolve({ profile: detail(4) });
	await flush();
	assert.equal(card.show.value, false);
	assert.equal(card.profile.value, null);
	card.openUserProfile(local(3));
	assert.equal(requests.length, 4, "下次打开读取当前资料，不缓存旧简介");
	card.close();
});

test("外部数字 ID 与本地 ID 不混淆，不请求详情、不允许私信", async () => {
	const { card, requests, dmCalls } = harness();
	card.openUserProfile({ kind: "external", source: "telegram", id: "2", displayName: "External", avatarUrl: "" });
	assert.equal(requests.length, 0);
	assert.equal(card.identity.value.kind, "external");
	await card.sendMessage();
	assert.equal(dmCalls.length, 0);
	card.openUserProfile(local(2));
	assert.equal(requests.length, 1);
	card.openUserProfile({ kind: "external", source: "telegram", id: "2", displayName: "External", avatarUrl: "" });
	requests[0].resolve({ profile: detail(2) });
	await flush();
	assert.equal(card.profile.value, null);
	assert.equal(card.identity.value.kind, "external");
	card.close();
});

test("读取失败可重试，404 不可用，自己不能发私信", async () => {
	const { card, requests, dmCalls } = harness();
	card.openUserProfile(local(2));
	requests[0].reject(new Error("offline"));
	await flush();
	assert.equal(card.error.value, "offline");
	const retry = card.retry();
	requests[1].resolve({ profile: detail(2) });
	await retry;
	assert.equal(card.error.value, "");
	card.openUserProfile(local(3));
	requests[2].reject(Object.assign(new Error("unavailable"), { status: 404 }));
	await flush();
	assert.equal(card.unavailable.value, true);
	card.openUserProfile(local(1));
	requests[3].resolve({ profile: detail(1) });
	await flush();
	assert.equal(card.isSelf.value, true);
	await card.sendMessage();
	assert.equal(dmCalls.length, 0);
	card.close();
});

test("私信重复点击保护、失败保留资料卡、成功关闭并转移焦点", async () => {
	const dmTask = deferred();
	let calls = 0;
	const h = harness({ openDm: () => { calls += 1; return dmTask.promise; } });
	h.card.openUserProfile(local(2));
	h.requests[0].resolve({ profile: detail(2) });
	await flush();
	const sending = h.card.sendMessage();
	await h.card.sendMessage();
	assert.equal(calls, 1);
	assert.equal(h.card.submitting.value, true);
	dmTask.resolve({ ok: false, error: "Denied" });
	await sending;
	assert.equal(h.card.show.value, true);
	assert.equal(h.card.error.value, "Denied");
	assert.equal(h.card.submitting.value, false);
	const successful = harness();
	successful.card.openUserProfile(local(2));
	successful.requests[0].resolve({ profile: detail(2) });
	await flush();
	await successful.card.sendMessage();
	assert.equal(successful.card.show.value, false);
	assert.equal(successful.card.restoreFocus.value, false);
	assert.equal(successful.navigated, 1);
});

test("私信迟到结果不能关闭后来打开的资料卡", async () => {
	const dmTask = deferred();
	const h = harness({ openDm: () => dmTask.promise });
	h.card.openUserProfile(local(2));
	h.requests[0].resolve({ profile: detail(2) });
	await flush();
	const sending = h.card.sendMessage();
	h.card.close();
	h.card.openUserProfile(local(3));
	dmTask.resolve({ ok: true });
	await sending;
	assert.equal(h.card.show.value, true);
	assert.equal(h.card.identity.value.id, 3);
	assert.equal(h.navigated, 0);
	h.card.close();
});

test("Demo 简介规范化、清空、会话恢复与已有/新建私信复用拉黑状态", async () => {
	resetDemoState();
	try {
		const patch = (body) => requestDemo("/me/profile", { method: "PATCH", body });
		assert.equal((await patch({ bio: " 中文\r\n😀 " })).session.bio, "中文\n😀");
		assert.equal((await patch({ avatarKey: null })).session.bio, "中文\n😀");
		assert.equal((await patch({ displayName: "Updated" })).session.bio, "中文\n😀");
		assert.equal((await requestDemo("/auth/session")).session.bio, "中文\n😀");
		const profile = (await requestDemo("/users/1/profile")).profile;
		assert.deepEqual(Object.keys(profile).sort(), ["avatarUrl", "bio", "displayName", "id", "username"]);
		await assert.rejects(patch({ bio: 3 }), /文本/);
		await assert.rejects(patch({ bio: "😀".repeat(201) }), /200/);
		assert.equal((await patch({ bio: "" })).session.bio, "");
		const error = ref("");
		const opened = [];
		const flow = useConversationCreation({
			users: ref([]), dms: ref([]), error,
			refreshAndOpen: async (_identity, fallback) => { opened.push(fallback.source); return true; },
			openGroupDialog() {},
			conversationApi: { openDm: (userId) => requestDemo("/dm/open", { method: "POST", body: { userId } }) },
		});
		const existing = demoState.dms[0];
		const peer = existing.participantIds.find((id) => id !== 1);
		setDemoUserBlocked(1, peer, true);
		const count = demoState.dms.length;
		assert.equal((await flow.openDm(local(peer))).ok, true);
		assert.equal(demoState.dms.length, count);
		assert.equal(opened[0].isBlockedByMe, true);
		const user = demoState.users.find((candidate) => candidate.id !== 1 &&
			!demoState.dms.some((dm) => dm.participantIds.includes(candidate.id)));
		assert.ok(user);
		assert.equal((await flow.openDm(user)).ok, true);
		assert.equal(demoState.dms.length, count + 1);
		assert.equal((await flow.openDm(user)).ok, true);
		assert.equal(demoState.dms.length, count + 1);
	} finally { resetDemoState(); }
});

test("资料入口与纯文本模板不改变消息菜单，设置头像请求不带未保存简介", () => {
	const read = (path) => readFileSync(new URL(`../frontend/src/${path}`, import.meta.url), "utf8");
	const dialog = read("components/chat/UserProfileDialog.vue");
	assert.doesNotMatch(dialog, /v-html|MentionText|wsStatus/);
	assert.match(dialog, /\{\{ profile\.bio \|\|/);
	assert.match(dialog, /white-space: pre-wrap/);
	assert.match(dialog, /role="dialog"/);
	assert.match(dialog, /aria-labelledby/);
	assert.match(dialog, /safe-area-inset-bottom/);
	const page = read("pages/ChatPage.vue");
	const row = read("components/chat/MessageRow.vue");
	assert.match(row, /@click="emit\('profile', msg.sender\)"/);
	assert.match(page, /@profile="openSenderProfile"/);
	assert.match(page, /@click="openLocalUserProfile\(activeRoom.otherUser\)"/);
	assert.match(page, /@open-profile="openLocalUserProfile"/);
	assert.match(page, /@contextmenu="openMessageContextMenu/);
	assert.match(page, /@long-press="startMessageLongPress/);
	const settings = read("pages/SettingsPage.vue");
	assert.doesNotMatch(settings, /watch\(session/);
	for (const request of settings.matchAll(/api\.updateProfile\(\{([^}]+)\}\)/g)) {
		if (request[1].includes("avatarKey")) {
			assert.doesNotMatch(request[1], /bio|displayName/);
		}
	}
});
