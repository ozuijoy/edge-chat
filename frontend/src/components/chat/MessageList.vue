<script setup lang="ts">
import MessageRow from "./MessageRow.vue";
import type { MessageSender, MessageView } from "./message-view.ts";

defineProps<{
	messages: MessageView[];
	currentUserId?: number;
	isDirect: boolean;
	highlightedMessageId: number | null;
}>();

// 將列表與草稿、通話計時、菜單等頁面狀態隔開，避免每次輸入都遍歷歷史消息。
const emit = defineEmits<{
	profile: [sender: MessageSender];
	reveal: [messageId: number | string | null | undefined];
	contextmenu: [event: MouseEvent, message: MessageView];
	"long-press": [event: PointerEvent, message: MessageView];
	"track-press": [event: PointerEvent];
	"cancel-press": [];
}>();
</script>

<template>
	<MessageRow
		v-for="msg in messages"
		:key="msg.id"
		:msg="msg"
		:current-user-id="currentUserId"
		:is-direct="isDirect"
		:highlighted="Number(highlightedMessageId) === Number(msg.id)"
		@profile="emit('profile', $event)"
		@reveal="emit('reveal', $event)"
		@contextmenu="(event, message) => emit('contextmenu', event, message)"
		@long-press="(event, message) => emit('long-press', event, message)"
		@track-press="emit('track-press', $event)"
		@cancel-press="emit('cancel-press')"
	/>
</template>
