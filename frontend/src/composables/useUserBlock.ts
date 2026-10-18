import { computed, ref, type Ref } from "vue";
import api from "../api.js";
import { t } from "../i18n.js";

interface DirectMessage {
	id: number;
	kind: "dm";
	isBlockedByMe?: boolean;
	otherUser: { id: number; displayName?: string };
}

interface UserBlockApi {
	blockUser(userId: number): Promise<{ blockedByMe: boolean }>;
	unblockUser(userId: number): Promise<{ blockedByMe: boolean }>;
}

export function useUserBlock({
	activeRoom,
	dms,
	error,
	blockApi = api,
	confirmBlock = (message: string) => globalThis.confirm(message),
}: {
	activeRoom: Ref<DirectMessage | Record<string, unknown> | null>;
	dms: Ref<DirectMessage[]>;
	error: Ref<string>;
	blockApi?: UserBlockApi;
	confirmBlock?: (message: string) => boolean;
}) {
	const saving = ref(false);
	const isBlockedByMe = computed(
		() => activeRoom.value?.kind === "dm" && Boolean(activeRoom.value.isBlockedByMe),
	);

	function peerUserId() {
		return Number(
			activeRoom.value?.kind === "dm"
				? (activeRoom.value as DirectMessage).otherUser?.id
				: 0,
		);
	}

	function applyBlockState(userId: number, blockedByMe: boolean) {
		if (activeRoom.value?.kind === "dm" && peerUserId() === userId) {
			activeRoom.value.isBlockedByMe = blockedByMe;
		}
		const dm = dms.value.find((item) => Number(item.otherUser.id) === userId);
		if (dm) dm.isBlockedByMe = blockedByMe;
	}

	async function toggleUserBlock() {
		if (activeRoom.value?.kind !== "dm" || saving.value) return false;
		const room = activeRoom.value as DirectMessage;
		const userId = peerUserId();
		const nextBlocked = !room.isBlockedByMe;
		if (
			nextBlocked &&
			!confirmBlock(t("chat.blockUserConfirm", { name: room.otherUser.displayName || "" }))
		) {
			return false;
		}

		saving.value = true;
		error.value = "";
		try {
			const result = nextBlocked
				? await blockApi.blockUser(userId)
				: await blockApi.unblockUser(userId);
			applyBlockState(userId, result.blockedByMe);
			return true;
		} catch (currentError) {
			error.value = currentError instanceof Error ? currentError.message : String(currentError);
			return false;
		} finally {
			saving.value = false;
		}
	}

	return { isBlockedByMe, saving, toggleUserBlock, applyBlockState };
}
