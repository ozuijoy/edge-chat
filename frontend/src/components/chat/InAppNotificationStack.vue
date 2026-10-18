<script setup lang="ts">
import { AtSign, MessageCircle, Reply, X } from '@lucide/vue';
import { useI18n } from '../../i18n.js';
import type { InAppNotification } from '../../composables/useInAppNotifications.ts';
import UiAvatar from '../ui/Avatar.vue';

defineProps<{
	notifications: InAppNotification[];
}>();

const emit = defineEmits<{
	open: [notification: InAppNotification];
	dismiss: [id: number];
}>();
const { t } = useI18n();
</script>

<template>
	<Teleport to="body">
		<section
			class="in-app-notification-host"
			:aria-label="t('notifications.inAppRegion')"
			aria-live="polite"
		>
			<TransitionGroup name="in-app-notification" tag="ul" class="in-app-notification-list">
				<li
					v-for="notification in notifications"
					:key="notification.id"
					class="in-app-notification"
					:class="{ 'in-app-notification--attention': notification.mentionsMe || notification.replyToMe }"
				>
					<button
						type="button"
						class="in-app-notification__content"
						:aria-label="t('notifications.openConversation', { room: notification.roomName })"
						@click="emit('open', notification)"
					>
						<UiAvatar
							class="in-app-notification__avatar"
							:src="notification.senderAvatarUrl"
							:alt="notification.senderName"
							:fallback="notification.senderName"
							size="sm"
						/>
						<span class="in-app-notification__body">
							<strong>{{ notification.senderName }}</strong>
							<span class="in-app-notification__room">
								<Reply v-if="notification.replyToMe" :size="14" aria-hidden="true" />
								<AtSign v-else-if="notification.mentionsMe" :size="14" aria-hidden="true" />
								<MessageCircle v-else :size="14" aria-hidden="true" />
								<span>{{ notification.roomName }}</span>
							</span>
							<span class="in-app-notification__preview">{{ notification.preview }}</span>
						</span>
					</button>
					<button
						type="button"
						class="in-app-notification__dismiss"
						:title="t('notifications.dismissInApp')"
						:aria-label="t('notifications.dismissInApp')"
						@click="emit('dismiss', notification.id)"
					>
						<X :size="16" aria-hidden="true" />
					</button>
				</li>
			</TransitionGroup>
		</section>
	</Teleport>
</template>

<style scoped>
.in-app-notification-host {
	position: fixed;
	right: max(16px, env(safe-area-inset-right));
	bottom: max(16px, env(safe-area-inset-bottom));
	z-index: 1000;
	width: min(360px, calc(100vw - 32px));
	pointer-events: none;
}

.in-app-notification-list {
	display: grid;
	gap: 10px;
	margin: 0;
	padding: 0;
	list-style: none;
}

	.in-app-notification {
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 1fr) 44px;
		overflow: hidden;
		border: 1px solid #dfe1e5;
		border-radius: 8px;
		background: #ffffff;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
		pointer-events: auto;
	}

	.in-app-notification--attention {
		border-left: 4px solid var(--site-brand, #3390ec);
	}

	.in-app-notification__content {
		display: grid;
		grid-template-columns: 42px minmax(0, 1fr);
		gap: 10px;
		align-items: start;
		min-width: 0;
		padding: 10px 0 10px 12px;
		border: 0;
		background: transparent;
		color: #1c1d22;
		text-align: left;
		cursor: pointer;
	}

	.in-app-notification__content:hover {
		background: #f4f4f5;
	}

	.in-app-notification__content:focus-visible,
	.in-app-notification__dismiss:focus-visible {
		outline: 2px solid var(--site-brand, #3390ec);
		outline-offset: -2px;
	}

	.in-app-notification__avatar {
		width: 42px;
		height: 42px;
		border-radius: 50%;
		box-shadow: none;
	}

.in-app-notification__body {
	display: grid;
	gap: 2px;
	min-width: 0;
}

.in-app-notification__body strong {
	overflow: hidden;
	font-size: 14px;
	line-height: 1.35;
	text-overflow: ellipsis;
	white-space: nowrap;
}

	.in-app-notification__room {
	display: flex;
	align-items: center;
	gap: 4px;
	min-width: 0;
		color: var(--site-brand, #3390ec);
	font-size: 12px;
	line-height: 1.35;
}

.in-app-notification__room span {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

	.in-app-notification__preview {
	display: -webkit-box;
	overflow: hidden;
		color: #707579;
	font-size: 13px;
	line-height: 1.4;
	overflow-wrap: anywhere;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 2;
}

	.in-app-notification__dismiss {
	display: inline-flex;
	align-items: center;
	justify-content: center;
		width: 44px;
		height: 44px;
		margin: 0;
	padding: 0;
	border: 0;
	border-radius: 50%;
	background: transparent;
		color: #8e9297;
	cursor: pointer;
}

	.in-app-notification__dismiss:hover {
		background: #f4f4f5;
		color: #1c1d22;
}

.in-app-notification-enter-active,
.in-app-notification-leave-active {
	transition: opacity 180ms ease, transform 180ms ease;
}

.in-app-notification-enter-from,
.in-app-notification-leave-to {
	opacity: 0;
	transform: translateY(10px);
}

	@media (max-width: 480px) {
		.in-app-notification-host {
			left: max(10px, env(safe-area-inset-left));
			right: max(10px, env(safe-area-inset-right));
			bottom: max(10px, env(safe-area-inset-bottom));
			width: auto;
		}
	}

@media (prefers-reduced-motion: reduce) {
	.in-app-notification-enter-active,
	.in-app-notification-leave-active {
		transition: none;
	}
}
</style>
