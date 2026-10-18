<script setup>
import { computed } from "vue";
import { t } from "../../i18n.js";
import { messageMarkdownToPlainText } from "../../message-markdown.ts";

const props = defineProps({
	reply: { type: Object, required: true },
	clickable: { type: Boolean, default: false },
});
const emit = defineEmits(["reveal"]);

const senderName = computed(() =>
	props.reply.deleted
		? ""
		: props.reply.sender?.displayName || props.reply.sender?.username || t("common.unknown"),
);
const previewText = computed(() => {
	if (props.reply.deleted) return t("messages.replyDeleted");
	const content = messageMarkdownToPlainText(props.reply.content || "");
	if (content) return content;
	const attachment = props.reply.attachment;
	if (attachment?.kind === "voice") return t("voice.fallback");
	if (attachment?.type?.startsWith("image/")) return t("messages.photo");
	if (attachment?.type?.startsWith("video/")) return t("messages.video");
	if (attachment?.type?.startsWith("audio/")) return t("messages.audio");
	return attachment?.name || t("messages.attachment");
});
</script>

<template>
	<component
		:is="clickable && !reply.deleted ? 'button' : 'div'"
		:type="clickable && !reply.deleted ? 'button' : undefined"
		class="message-reply-preview"
		:class="{ 'message-reply-preview--clickable': clickable && !reply.deleted }"
		@click="clickable && !reply.deleted && emit('reveal')"
	>
		<strong v-if="senderName" class="message-reply-preview__sender">{{ senderName }}</strong>
		<span class="message-reply-preview__text">{{ previewText }}</span>
	</component>
</template>

<style scoped>
.message-reply-preview {
	display: grid;
	width: 100%;
	min-width: 0;
	padding: 5px 8px;
	border: 0;
	border-left: 3px solid var(--site-brand, #008069);
	border-radius: 4px;
	background: rgba(var(--site-brand-rgb, 0, 128, 105), 0.08);
	font: inherit;
	text-align: left;
}

.message-reply-preview--clickable {
	cursor: pointer;
}

.message-reply-preview--clickable:hover,
.message-reply-preview--clickable:focus-visible {
	background: rgba(var(--site-brand-rgb, 0, 128, 105), 0.14);
}

.message-reply-preview--clickable:focus-visible {
	outline: 2px solid rgba(var(--site-brand-rgb, 0, 128, 105), 0.35);
	outline-offset: 1px;
}

.message-reply-preview__sender,
.message-reply-preview__text {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.message-reply-preview__sender {
	color: var(--site-brand, #008069);
	font-size: 12px;
	font-weight: 700;
}

.message-reply-preview__text {
	color: #54656f;
	font-size: 12.5px;
	line-height: 1.35;
}
</style>
