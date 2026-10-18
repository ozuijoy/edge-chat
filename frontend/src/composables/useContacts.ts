import { computed, ref } from "vue";
import type { UserSummary } from "../../../shared/user-profile.ts";
import api from "../api.js";

type ContactsApi = {
	getContacts: (options?: { signal?: AbortSignal }) => Promise<{ users: UserSummary[] }>;
	getBlockedUsers: (options?: { signal?: AbortSignal }) => Promise<{ users: UserSummary[] }>;
	unblockUser: (userId: number) => Promise<{ blockedByMe: boolean }>;
};

export function useContacts(contactsApi: ContactsApi = api) {
	const users = ref<UserSummary[]>([]);
	const query = ref("");
	const view = ref<"all" | "blocked">("all");
	const loading = ref(false);
	const error = ref("");
	const actionError = ref("");
	const savingUserId = ref<number | null>(null);
	let loaded = false;
	let generation = 0;
	let controller: AbortController | null = null;
	const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

	const sortedUsers = computed(() =>
		[...users.value].sort((left, right) => {
			const leftName = left.displayName || left.username;
			const rightName = right.displayName || right.username;
			return collator.compare(leftName, rightName)
				|| collator.compare(left.username, right.username)
				|| left.id - right.id;
		}),
	);
	const filteredUsers = computed(() => {
		const needle = query.value.trim().toLocaleLowerCase();
		if (!needle) return sortedUsers.value;
		return sortedUsers.value.filter((user) =>
			[user.displayName, user.username].some((value) =>
				String(value || "").toLocaleLowerCase().includes(needle),
			),
		);
	});

	async function load(force = false) {
		if (savingUserId.value !== null) return;
		if (!force && (loading.value || loaded)) return;
		controller?.abort();
		controller = new AbortController();
		const request = ++generation;
		loading.value = true;
		error.value = "";
		try {
			const payload = view.value === "blocked"
				? await contactsApi.getBlockedUsers({ signal: controller.signal })
				: await contactsApi.getContacts({ signal: controller.signal });
			if (request !== generation) return;
			users.value = payload.users;
			loaded = true;
		} catch (cause) {
			if (request !== generation) return;
			error.value = (cause as Error).message;
		} finally {
			if (request === generation) loading.value = false;
		}
	}

	async function selectView(next: "all" | "blocked") {
		if (next === view.value || savingUserId.value !== null) return;
		view.value = next;
		actionError.value = "";
		await load(true);
	}

	async function unblock(userId: number) {
		if (savingUserId.value !== null) return false;
		savingUserId.value = userId;
		actionError.value = "";
		try {
			await contactsApi.unblockUser(userId);
			users.value = users.value.filter((user) => user.id !== userId);
			return true;
		} catch (cause) {
			actionError.value = (cause as Error).message;
			return false;
		} finally {
			savingUserId.value = null;
		}
	}

	function dispose() {
		generation += 1;
		controller?.abort();
		controller = null;
	}

	return { users, query, view, loading, error, actionError, savingUserId, filteredUsers, load, selectView, unblock, dispose };
}
