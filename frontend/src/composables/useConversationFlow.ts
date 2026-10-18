import type { Ref } from "vue";

export type ConversationIdentity = {
	id: number | string;
	kind: string;
};

export type ConversationItem = ConversationIdentity & {
	[key: string]: unknown;
};

type ConversationFlowOptions = {
	conversationItems: Readonly<Ref<ConversationItem[]>>;
	refreshSidebar: () => Promise<void>;
	openConversation: (item: ConversationItem) => Promise<void>;
	openConversationView: () => void;
};

export function useConversationFlow({
	conversationItems,
	refreshSidebar,
	openConversation,
	openConversationView,
}: ConversationFlowOptions) {
	function findByIdentity(identity: ConversationIdentity) {
		return conversationItems.value.find(
			(item) =>
				item.kind === identity.kind && Number(item.id) === Number(identity.id),
		);
	}

	async function openConversationItem(item: ConversationItem) {
		await openConversation(item);
		openConversationView();
	}

	async function openByIdentity(
		identity: ConversationIdentity,
		fallback?: ConversationItem,
	) {
		const item = findByIdentity(identity) || fallback;
		if (!item) {
			return false;
		}

		await openConversationItem(item);
		return true;
	}

	async function refreshAndOpen(
		identity: ConversationIdentity,
		fallback?: ConversationItem,
	) {
		await refreshSidebar();
		return openByIdentity(identity, fallback);
	}

	return {
		findByIdentity,
		openConversationItem,
		openByIdentity,
		refreshAndOpen,
	};
}
