import { computed, ref } from "vue";
import api from "../api.js";
import { t } from "../i18n.js";

export function useConversationCreation({
	users,
	dms,
	error,
	refreshAndOpen,
	openGroupDialog,
	conversationApi = api,
}) {
	const showAddConversation = ref(false);
	const openingDmUserId = ref(null);

	const usersWithoutDm = computed(() => {
		const existingDmUserIds = new Set(
			dms.value.map((dm) => Number(dm.otherUser?.id)),
		);
		return users.value.filter(
			(user) => !existingDmUserIds.has(Number(user.id)),
		);
	});

	function openAddConversation() {
		error.value = "";
		showAddConversation.value = true;
	}

	function closeAddConversation() {
		showAddConversation.value = false;
	}

	function startGroupCreation() {
		closeAddConversation();
		openGroupDialog();
	}

	async function openDm(user) {
		if (!user || openingDmUserId.value !== null) {
			return { ok: false, error: t("common.opening") };
		}

		openingDmUserId.value = Number(user.id);
		error.value = "";
		try {
			const payload = await conversationApi.openDm(user.id);
			const opened = await refreshAndOpen(
				{ kind: "dm", id: payload.dm.id },
				{ kind: "dm", id: payload.dm.id, source: payload.dm },
			);
			if (opened !== true) throw new Error(t("profile.openFailed"));
			closeAddConversation();
			return { ok: true };
		} catch (currentError) {
			error.value = currentError.message;
			return { ok: false, error: currentError.message };
		} finally {
			openingDmUserId.value = null;
		}
	}

	return {
		show: showAddConversation,
		usersWithoutDm,
		openingDmUserId,
		open: openAddConversation,
		close: closeAddConversation,
		startGroupCreation,
		openDm,
	};
}
