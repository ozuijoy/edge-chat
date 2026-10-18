import assert from "node:assert/strict";
import test from "node:test";
import { ref } from "vue";

import { useConversationCreation } from "../frontend/src/composables/useConversationCreation.js";

function createHarness(overrides = {}) {
	const users = ref([
		{ id: 1, username: "alice", displayName: "Alice" },
		{ id: 2, username: "bob", displayName: "Bob" },
		{ id: 3, username: "carol", displayName: "Carol" },
	]);
	const dms = ref([
		{ id: 12, kind: "dm", otherUser: { id: 2, username: "bob", displayName: "Bob" } },
	]);
	const error = ref("");
	const calls = [];
	const conversationApi = {
		async openDm(userId) {
			calls.push(["openDm", userId]);
			return { dm: { id: 21, kind: "dm", otherUser: users.value[0] } };
		},
		...overrides.conversationApi,
	};
	const creation = useConversationCreation({
		users,
		dms,
		error,
		refreshAndOpen: overrides.refreshAndOpen || (async (identity, fallback) => {
			calls.push(["refreshAndOpen", identity, fallback]);
			return true;
		}),
		openGroupDialog: () => calls.push(["openGroupDialog"]),
		conversationApi,
	});

	return { creation, users, error, calls };
}

test("添加人员入口同时保留新私聊和创建群聊动作", () => {
	const { creation, users, calls } = createHarness();
	assert.deepEqual(
		creation.usersWithoutDm.value.map((user) => user.id),
		[1, 3],
	);

	creation.open();
	assert.equal(creation.show.value, true);
	creation.startGroupCreation();
	assert.equal(creation.show.value, false);
	assert.deepEqual(calls, [["openGroupDialog"]]);

	users.value.push({ id: 4, username: "dave", displayName: "Dave" });
	assert.deepEqual(
		creation.usersWithoutDm.value.map((user) => user.id),
		[1, 3, 4],
	);
});

test("发起新私聊后刷新侧栏并自动打开对应会话", async () => {
	const { creation, users, calls } = createHarness();
	creation.open();
	assert.deepEqual(await creation.openDm(users.value[0]), { ok: true });

	assert.deepEqual(calls, [
		["openDm", 1],
		[
			"refreshAndOpen",
			{ kind: "dm", id: 21 },
			{
				kind: "dm",
				id: 21,
				source: {
					id: 21,
					kind: "dm",
					otherUser: users.value[0],
				},
			},
		],
	]);
	assert.equal(creation.show.value, false);
	assert.equal(creation.openingDmUserId.value, null);
});

test("私聊创建失败时保留弹窗并向用户显示错误", async () => {
	const { creation, users, error, calls } = createHarness({
		conversationApi: {
			async openDm(userId) {
				calls.push(["openDm", userId]);
				throw new Error("暂时无法发起对话");
			},
		},
	});
	creation.open();
	assert.deepEqual(await creation.openDm(users.value[2]), { ok: false, error: "暂时无法发起对话" });

	assert.equal(creation.show.value, true);
	assert.equal(creation.openingDmUserId.value, null);
	assert.equal(error.value, "暂时无法发起对话");
	assert.deepEqual(calls, [["openDm", 3]]);
});

test("创建私信接口成功但未能进入会话时，明确返回失败并保留弹窗", async () => {
	const { creation, users } = createHarness({ refreshAndOpen: async () => false });
	creation.open();
	const result = await creation.openDm(users.value[0]);
	assert.equal(result.ok, false);
	assert.ok(result.error);
	assert.equal(creation.show.value, true);
});
