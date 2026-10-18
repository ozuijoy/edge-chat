import { computed } from "vue";
import { t } from "../i18n.js";

export function useActiveRoom({ activeRoom }) {
	const activeRoomKey = computed(() =>
		activeRoom.value?.kind && activeRoom.value?.id
			? `${activeRoom.value.kind}:${activeRoom.value.id}`
			: "",
	);

	const canManageActiveRoom = computed(
		() =>
			activeRoom.value &&
			activeRoom.value.kind !== "dm" &&
			activeRoom.value.canManage,
	);

	const hasManageLayer = computed(() =>
		Boolean(activeRoom.value && activeRoom.value.kind !== "dm"),
	);

	function applyActiveChannel(channel) {
		activeRoom.value = {
			id: channel.id,
			kind: channel.kind,
			name: channel.name,
			isGeneral: Boolean(channel.isGeneral),
			description: channel.description,
			avatarUrl: channel.avatarUrl || "",
			avatarKey: channel.avatarKey || "",
			ownerDisplayName: channel.ownerDisplayName || "",
			canManage: Boolean(channel.canManage),
			myRole: channel.myRole || "",
			memberCount: Number(channel.memberCount || 0),
		};
	}

	function selectDm(dm) {
		activeRoom.value = {
			id: dm.id,
			kind: "dm",
			name: dm.name,
			otherUser: dm.otherUser,
			isBlockedByMe: Boolean(dm.isBlockedByMe),
		};
	}

	function roomLabel(room) {
		if (!room) {
			return t("chat.noConversationSelected");
		}
		if (room.kind === "dm") {
			return room.otherUser?.displayName || room.name;
		}
		return room.name;
	}

	function roomSubtitle(room, connected = false) {
		if (!room) {
			return "";
		}
		if (room.kind === "dm") {
			return room.otherUser?.username
				? `@${room.otherUser.username}`
				: connected
					? t("chat.online")
					: t("chat.connecting");
		}
		if (room.memberCount) {
			return t("chat.memberCount", { count: room.memberCount });
		}
		return room.isGeneral ? t("chat.generalGroup") : t("chat.groupConversation");
	}

	return {
		activeRoomKey,
		canManageActiveRoom,
		hasManageLayer,
		applyActiveChannel,
		selectDm,
		roomLabel,
		roomSubtitle,
	};
}
