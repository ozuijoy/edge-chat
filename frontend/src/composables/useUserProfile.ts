import { computed, nextTick, ref } from "vue";
import type { Ref } from "vue";
import { parseLocalUserId } from "../../../shared/user-profile.ts";
import type { ProfileIdentity, UserProfile, UserSummary } from "../../../shared/user-profile.ts";

type Options = {
	currentUserId: Readonly<Ref<number | undefined>>;
	getProfile: (id: number, options: { signal: AbortSignal }) => Promise<{ profile: UserProfile }>;
	openDm: (user: UserSummary) => Promise<{ ok: boolean; error?: string }>;
	onNavigate: () => void;
};

export function useUserProfile({ currentUserId, getProfile, openDm, onNavigate }: Options) {
	const identity = ref<ProfileIdentity | null>(null);
	const profile = ref<UserProfile | null>(null);
	const loading = ref(false);
	const unavailable = ref(false);
	const error = ref("");
	const submitting = ref(false);
	const restoreFocus = ref(true);
	const show = computed(() => identity.value !== null);
	const isSelf = computed(() => identity.value?.kind === "local" && identity.value.id === currentUserId.value);
	let generation = 0;
	let controller: AbortController | null = null;

	function close() {
		generation += 1;
		controller?.abort();
		controller = null;
		identity.value = null;
		profile.value = null;
		loading.value = false;
		submitting.value = false;
		error.value = "";
		unavailable.value = false;
	}

	async function load() {
		if (identity.value?.kind !== "local" || loading.value) return;
		const id = identity.value.id;
		const request = ++generation;
		controller = new AbortController();
		loading.value = true;
		error.value = "";
		unavailable.value = false;
		try {
			const payload = await getProfile(id, { signal: controller.signal });
			if (request === generation) profile.value = payload.profile;
		} catch (cause) {
			if (request !== generation) return;
			const failure = cause as Error & { status?: number };
			unavailable.value = failure.status === 404;
			error.value = failure.message;
		} finally {
			if (request === generation) loading.value = false;
		}
	}

	function openUserProfile(target: ProfileIdentity) {
		// 外部 ID 即使是数字也只保留外部身份，不参与本地 ID 解析。
		if (target.kind === "local" && parseLocalUserId(target.id) === null) return;
		if (loading.value && identity.value?.kind === target.kind &&
			identity.value.id === target.id &&
			(target.kind !== "external" || (identity.value.kind === "external" && identity.value.source === target.source))) return;
		close();
		restoreFocus.value = true;
		identity.value = { ...target };
		void load();
	}

	async function sendMessage() {
		if (!profile.value || isSelf.value || submitting.value) return;
		const request = generation;
		const user = profile.value;
		submitting.value = true;
		error.value = "";
		try {
			const result = await openDm(user);
			if (request !== generation) return;
			if (!result.ok) {
				error.value = result.error || "";
				return;
			}
			restoreFocus.value = false;
			close();
			await nextTick();
			onNavigate();
		} catch (cause) {
			if (request === generation) error.value = (cause as Error).message;
		} finally {
			if (request === generation) submitting.value = false;
		}
	}

	return { identity, profile, show, loading, unavailable, error, submitting, restoreFocus,
		isSelf, openUserProfile, close, retry: load, sendMessage };
}
