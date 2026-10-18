import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test, { after, before } from "node:test";
import { ref } from "vue";
import { createServer } from "vite";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
let vite;
let useActiveRoom;
let useConversationFlow;
let useMessageContextMenu;
let useUserBlock;

before(async () => {
	vite = await createServer({
		root: projectRoot,
		configFile: false,
		appType: "custom",
		logLevel: "silent",
		server: { middlewareMode: true },
	});
	({ useActiveRoom } = await vite.ssrLoadModule(
		"/frontend/src/composables/useActiveRoom.js",
	));
	({ useConversationFlow } = await vite.ssrLoadModule(
		"/frontend/src/composables/useConversationFlow.ts",
	));
	({ useMessageContextMenu } = await vite.ssrLoadModule(
		"/frontend/src/composables/useMessageContextMenu.ts",
	));
	({ useUserBlock } = await vite.ssrLoadModule(
		"/frontend/src/composables/useUserBlock.ts",
	));
});

after(async () => {
	await vite?.close();
});

test("会话流程统一按 kind 和 id 查找并在打开后切换聊天视图", async () => {
	const calls = [];
	const conversationItems = ref([
		{ id: 7, kind: "private", source: { id: 7 } },
	]);
	const flow = useConversationFlow({
		conversationItems,
		async refreshSidebar() {
			calls.push(["refreshSidebar"]);
			conversationItems.value = [{ id: 9, kind: "dm", source: { id: 9 } }];
		},
		async openConversation(item) {
			calls.push(["openConversation", item]);
		},
		openConversationView() {
			calls.push(["openConversationView"]);
		},
	});

	assert.equal(await flow.openByIdentity({ kind: "private", id: "7" }), true);
	assert.equal(await flow.openByIdentity({ kind: "private", id: 8 }), false);
	assert.equal(await flow.refreshAndOpen({ kind: "dm", id: 9 }), true);
	assert.deepEqual(calls, [
		["openConversation", { id: 7, kind: "private", source: { id: 7 } }],
		["openConversationView"],
		["refreshSidebar"],
		["openConversation", { id: 9, kind: "dm", source: { id: 9 } }],
		["openConversationView"],
	]);
});

test("消息菜单允许所有会话成员通过右键和触摸长按打开回复操作", () => {
	const menu = useMessageContextMenu();
	let prevented = false;
	menu.openMessageContextMenu(
		{
			clientX: 12,
			clientY: 18,
			preventDefault() {
				prevented = true;
			},
		},
		{ id: 1 },
	);
	assert.equal(prevented, true);
	assert.deepEqual(menu.messageMenu.value, {
		message: { id: 1 },
		x: 12,
		y: 18,
	});

	menu.closeMessageMenu();
	menu.openMessageContextMenu(
		{ clientX: 30, clientY: 40, preventDefault() {} },
		{ id: 2 },
	);
	assert.deepEqual(menu.messageMenu.value.message, { id: 2 });

	const nativeSetTimeout = globalThis.setTimeout;
	const nativeClearTimeout = globalThis.clearTimeout;
	let scheduledCallback;
	let clearedTimer = null;
	globalThis.setTimeout = (callback) => {
		scheduledCallback = callback;
		return 41;
	};
	globalThis.clearTimeout = (timer) => {
		clearedTimer = timer;
	};
	try {
		menu.startMessageLongPress(
			{ pointerType: "touch", pointerId: 3, clientX: 20, clientY: 24 },
			{ id: 3 },
		);
		scheduledCallback();
		assert.deepEqual(menu.messageMenu.value, {
			message: { id: 3 },
			x: 20,
			y: 24,
		});

		menu.closeMessageMenu();
		menu.startMessageLongPress(
			{ pointerType: "touch", pointerId: 4, clientX: 10, clientY: 10 },
			{ id: 4 },
		);
		menu.trackMessageLongPress({ pointerId: 4, clientX: 21, clientY: 10 });
		assert.equal(clearedTimer, 41);
		assert.equal(menu.messageMenu.value.message, null);
	} finally {
		globalThis.setTimeout = nativeSetTimeout;
		globalThis.clearTimeout = nativeClearTimeout;
	}
});

test("私信拉黑先确认，并同步当前会话与侧栏状态", async () => {
	const activeRoom = ref({
		id: 10,
		kind: "dm",
		otherUser: { id: 2, displayName: "Alice" },
		isBlockedByMe: false,
	});
	const dms = ref([{ ...activeRoom.value }]);
	const error = ref("");
	const calls = [];
	let confirmed = false;
	const userBlock = useUserBlock({
		activeRoom,
		dms,
		error,
		confirmBlock(message) {
			calls.push(["confirm", message]);
			return confirmed;
		},
		blockApi: {
			async blockUser(userId) {
				calls.push(["block", userId]);
				return { blockedByMe: true };
			},
			async unblockUser(userId) {
				calls.push(["unblock", userId]);
				return { blockedByMe: false };
			},
		},
	});

	assert.equal(await userBlock.toggleUserBlock(), false);
	assert.equal(userBlock.isBlockedByMe.value, false);
	confirmed = true;
	assert.equal(await userBlock.toggleUserBlock(), true);
	assert.equal(userBlock.isBlockedByMe.value, true);
	assert.equal(dms.value[0].isBlockedByMe, true);
	assert.equal(await userBlock.toggleUserBlock(), true);
	assert.equal(userBlock.isBlockedByMe.value, false);
	assert.deepEqual(calls.map(([type]) => type), ["confirm", "confirm", "block", "unblock"]);
	userBlock.applyBlockState(2, true);
	assert.equal(userBlock.isBlockedByMe.value, true);
	userBlock.applyBlockState(2, false);
	assert.equal(userBlock.isBlockedByMe.value, false);
	assert.equal(dms.value[0].isBlockedByMe, false, "通讯录解除同步隐藏的当前私聊与侧栏");
});

test("刷新后打开私信保留服务端返回的拉黑状态", () => {
	const activeRoom = ref(null);
	const { selectDm } = useActiveRoom({ activeRoom });
	selectDm({
		id: 10,
		name: "Alice",
		otherUser: { id: 2, displayName: "Alice" },
		isBlockedByMe: true,
	});

	const userBlock = useUserBlock({
		activeRoom,
		dms: ref([]),
		error: ref(""),
	});
	assert.equal(activeRoom.value.isBlockedByMe, true);
	assert.equal(userBlock.isBlockedByMe.value, true);
});
