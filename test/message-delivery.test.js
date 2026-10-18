import assert from "node:assert/strict";
import test from "node:test";

import {
	MessageSubmissionError,
	createMessageSubmission,
} from "../worker/src/message-submission.js";
import { createUnreadProjection } from "../worker/src/unread-projection.js";

test("消息提交 module 统一持久化参数与广播 packet", async () => {
	const calls = [];
	const message = { id: 11, content: "hello" };
	const submit = createMessageSubmission({
		async persistMessage(env, args) {
			calls.push({ env, args });
			return message;
		},
	});
	const env = {};
	const result = await submit(
		env,
		{ room: { id: 3 }, principal: { userId: 7 } },
		{ content: "hello", attachment: { key: "a" } },
	);

	assert.deepEqual(calls, [{
		env,
		args: {
			channelId: 3,
			senderId: 7,
			content: "hello",
			attachment: { key: "a" },
			mentionUserIds: [],
		},
	}]);
	assert.equal(result.message, message);
	assert.deepEqual(JSON.parse(result.packet), { protocolVersion: 1, type: "message", message });
});

test("消息提交只转换可预期的空消息错误", async () => {
	const submitEmpty = createMessageSubmission({
		async persistMessage() {
			throw new Error("Message content cannot be empty");
		},
	});
	await assert.rejects(
		submitEmpty({}, { room: {}, principal: {} }, {}),
		(error) => error instanceof MessageSubmissionError && error.message === "消息内容不能为空",
	);

	const original = new Error("database unavailable");
	const submitFailure = createMessageSubmission({
		async persistMessage() {
			throw original;
		},
	});
	await assert.rejects(submitFailure({}, { room: {}, principal: {} }, {}), original);
});

test("未读投影排除发送者，并行投影所有收件人", async () => {
	const countCalls = [];
	const notifications = [];
	const resolvers = new Map();
	const project = createUnreadProjection({
		async enqueueNotification() {},
		async listMemberIds() {
			return [1, 2, 3];
		},
		countUnread(_db, { userId }) {
			countCalls.push(userId);
			return new Promise((resolve) => resolvers.set(userId, resolve));
		},
		async countMentions(_db, { userId }) {
			return userId === 2 ? 1 : 0;
		},
		async notifyInbox(_env, userId, payload) {
			notifications.push({ userId, payload });
		},
	});
	const pending = project(
		{ DB: {} },
		{
			room: { id: "4", kind: "private", name: "Team" },
			senderId: 1,
			message: {
				id: "8",
				createdAt: "now",
				content: "@bob hello",
				mentionUserIds: [2],
				sender: { displayName: "Alice" },
			},
		},
	);
	await Promise.resolve();
	assert.deepEqual(countCalls, [2, 3]);
	resolvers.get(2)(5);
	resolvers.get(3)(6);
	await pending;
	assert.deepEqual(notifications, [
		{
			userId: 2,
				payload: {
					protocolVersion: 1,
					type: "room_message",
				room: { id: 4, kind: "private", name: "Team" },
				messageId: 8,
				createdAt: "now",
					unreadCount: 5,
					mentionUnreadCount: 1,
						mentionsMe: true,
						replyToMe: false,
					contentPreview: "@bob hello",
					sender: { displayName: "Alice" },
			},
		},
		{
			userId: 3,
				payload: {
					protocolVersion: 1,
					type: "room_message",
				room: { id: 4, kind: "private", name: "Team" },
				messageId: 8,
				createdAt: "now",
					unreadCount: 6,
						mentionsMe: false,
						replyToMe: false,
					contentPreview: "@bob hello",
					sender: { displayName: "Alice" },
			},
		},
	]);
});

test("单个未读收件人失败被隔离，成员查询失败也不阻塞提交链路", async () => {
	const notifications = [];
	const failures = [];
	const project = createUnreadProjection({
		async listMemberIds() {
			return [2, 3];
		},
		async countUnread(_db, { userId }) {
			if (userId === 2) throw new Error("count failed");
			return 1;
		},
		async countMentions() {
			return 0;
		},
		async notifyInbox(_env, userId) {
			notifications.push(userId);
		},
		logFailure(message, data) {
			failures.push({ message, data });
		},
	});
	await project(
		{ DB: {} },
		{ room: { id: 4 }, senderId: 1, message: { id: 8 } },
	);
	assert.deepEqual(notifications, [3]);
	assert.equal(failures[0].message, "unread recipient projection failed");

	const outerFailures = [];
	const projectWithListFailure = createUnreadProjection({
		async listMemberIds() {
			throw new Error("list failed");
		},
		logFailure(message, data) {
			outerFailures.push({ message, data });
		},
	});
	await projectWithListFailure(
		{ DB: {} },
		{ room: { id: 4 }, senderId: 1, message: { id: 8 } },
	);
	assert.equal(outerFailures[0].message, "unread projection failed");
});

test("回复原作者会触发与提及同级的有人@我投影", async () => {
	const notifications = [];
	const counted = [];
	const project = createUnreadProjection({
		async enqueueNotification() {},
		async listMemberIds() {
			return [1, 2, 3];
		},
		async countUnread() {
			return 2;
		},
		async countMentions(_db, { userId }) {
			counted.push(userId);
			return 1;
		},
		async notifyInbox(_env, userId, payload) {
			notifications.push({ userId, payload });
		},
	});

	await project(
		{ DB: {} },
			{
				room: { id: 4, kind: "private", name: "Team" },
				senderId: 1,
				message: {
					id: 9,
					createdAt: "now",
					content: "done",
					mentionUserIds: [],
					replyTo: { id: 8, deleted: true },
					sender: { displayName: "Alice" },
				},
				replyToSenderId: 2,
			},
		);

	assert.deepEqual(counted, [2]);
	assert.equal(notifications.find((item) => item.userId === 2).payload.replyToMe, true);
	assert.equal(notifications.find((item) => item.userId === 2).payload.mentionUnreadCount, 1);
	assert.equal(notifications.find((item) => item.userId === 3).payload.replyToMe, false);
});

test("外部通知只投递私信和明确提及，不投递普通群消息或自己的消息", async () => {
	const pushed = [];
	const project = createUnreadProjection({
		async listMemberIds() { return [1, 2, 3]; },
		async countUnread() { return 1; },
		async countMentions() { return 1; },
		async notifyInbox() {},
		async enqueueNotification(_env, event) { pushed.push([event.userId, event.kind]); },
	});
	const message = { id: 10, sender: { kind: "local", id: 1 }, mentionUserIds: [2] };
	await project({ DB: {} }, { room: { id: 3, kind: "private" }, senderId: 1, message });
	assert.deepEqual(pushed, [[2, "mention"]]);
	pushed.length = 0;
	await project({ DB: {} }, { room: { id: 4, kind: "dm" }, senderId: 1, message });
	assert.deepEqual(pushed, [[2, "dm"], [3, "dm"]]);
});
