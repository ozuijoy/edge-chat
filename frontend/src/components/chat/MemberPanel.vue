<script setup>
import { X } from '@lucide/vue';
import UiAvatar from '../ui/Avatar.vue';
import UiBadge from '../ui/Badge.vue';
import UiButton from '../ui/Button.vue';
import UiSurface from '../ui/Surface.vue';
import { t } from '../../i18n.js';
import SenderTitleBadge from './SenderTitleBadge.vue';

defineProps({
  room: {
    type: Object,
    default: null
  },
  members: {
    type: Array,
    default: () => []
  },
  loading: {
    type: Boolean,
    default: false
  },
  canManage: {
    type: Boolean,
    default: false
  },
  inviteUserId: {
    type: String,
    default: ''
  },
  availableInviteUsers: {
    type: Array,
    default: () => []
  },
  inviteSubmitting: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['close', 'update:inviteUserId', 'invite', 'remove-member', 'delete-group', 'open-profile']);
</script>

<template>
  <UiSurface v-if="room && room.kind !== 'dm'" tone="soft" class="chat-member-panel">
    <div class="chat-member-panel__header">
      <div class="window-heading">
        <h1 style="font-size: 1.12rem">{{ t('members.groupMembers') }}</h1>
        <p>{{ loading ? t('common.syncing') : t('chat.memberCount', { count: members.length }) }}</p>
      </div>

      <div class="chat-member-panel__actions">
        <UiBadge variant="secondary">{{ room.myRole === 'owner' ? t('members.owner') : t('members.member') }}</UiBadge>
        <UiButton v-if="canManage && !room.isGeneral" variant="destructive" size="sm" @click="emit('delete-group')">
          {{ t('group.delete') }}
        </UiButton>
        <button type="button" class="chat-member-panel__close" :aria-label="t('chat.closeMembers')" @click="emit('close')">
          <X :size="20" aria-hidden="true" />
        </button>
      </div>
    </div>

    <div class="member-chip-list">
      <div v-for="member in members" :key="member.id" class="member-chip">
        <button type="button" class="profile-avatar-trigger" :aria-label="t('profile.view', { name: member.displayName })" @click="emit('open-profile', member)">
          <UiAvatar :src="member.avatarUrl" :fallback="member.displayName" size="sm" />
        </button>
        <div class="member-chip__text">
          <div class="member-chip__name">
            <strong>{{ member.displayName }}</strong>
            <SenderTitleBadge :identity="member" />
          </div>
          <span>@{{ member.username }}</span>
        </div>
        <div class="member-chip__actions">
          <UiBadge :variant="member.role === 'owner' ? 'warm' : 'secondary'">
            {{ member.role === 'owner' ? t('members.owner') : t('members.member') }}
          </UiBadge>
          <UiButton
			v-if="canManage && !room.isGeneral && member.role !== 'owner'"
            variant="secondary"
            size="sm"
            @click="emit('remove-member', member)"
          >
            {{ t('common.remove') }}
          </UiButton>
        </div>
      </div>
    </div>

    <div v-if="canManage && !room.isGeneral" class="chat-member-panel__actions">
      <select
        class="ui-input"
        :value="inviteUserId"
        @change="emit('update:inviteUserId', $event.target.value)"
      >
        <option value="">{{ t('members.selectInvitee') }}</option>
        <option v-for="user in availableInviteUsers" :key="`invite-${user.id}`" :value="user.id">
          {{ user.displayName }} @{{ user.username }}
        </option>
      </select>
      <UiButton :disabled="inviteSubmitting || !inviteUserId" @click="emit('invite')">
        {{ inviteSubmitting ? t('members.inviting') : t('members.invite') }}
      </UiButton>
    </div>
  </UiSurface>
</template>

<style scoped>
.member-chip__name {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.member-chip__name strong {
  min-width: 0;
  overflow-wrap: anywhere;
}

.chat-member-panel__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin: -8px -8px -8px 0;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #54656f;
  touch-action: manipulation;
}

.chat-member-panel__close:hover,
.chat-member-panel__close:active {
  background: rgba(0, 0, 0, 0.06);
}
</style>
