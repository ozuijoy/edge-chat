<script setup>
import UiButton from '../ui/Button.vue';
import UiInput from '../ui/Input.vue';
import UiSurface from '../ui/Surface.vue';
import UiTextarea from '../ui/Textarea.vue';
import { t } from '../../i18n.js';

defineProps({
  show: {
    type: Boolean,
    default: false
  },
  mode: {
    type: String,
    default: ''
  },
  users: {
    type: Array,
    default: () => []
  },
  usersWithoutDm: {
    type: Array,
    default: () => []
  },
  form: {
    type: Object,
    required: true
  },
  submitting: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['toggle-mode', 'create-group', 'open-dm']);
</script>

<template>
  <UiSurface v-if="show" tone="soft" class="quick-panel">
    <div class="quick-panel__switch">
      <UiButton :variant="mode === 'group' ? 'default' : 'secondary'" size="sm" @click="emit('toggle-mode', 'group')">
        {{ t('quickActions.createGroup') }}
      </UiButton>
      <UiButton :variant="mode === 'dm' ? 'default' : 'secondary'" size="sm" @click="emit('toggle-mode', 'dm')">
        {{ t('quickActions.startDm') }}
      </UiButton>
    </div>

    <div v-if="mode === 'group'" class="quick-panel__body">
      <label class="field">
        <span class="field-label">{{ t('group.nameGeneric') }}</span>
        <UiInput v-model="form.name" :placeholder="t('quickActions.groupNameExample')" />
      </label>

      <label class="field">
        <span class="field-label">{{ t('quickActions.description') }}</span>
        <UiTextarea v-model="form.description" :rows="3" :placeholder="t('quickActions.descriptionHint')" />
      </label>

      <label class="field">
        <span class="field-label">{{ t('quickActions.visibility') }}</span>
        <select v-model="form.kind" class="ui-input">
          <option value="public">{{ t('chat.publicGroup') }}</option>
          <option value="private">{{ t('chat.privateGroup') }}</option>
        </select>
      </label>

      <div class="member-picker-list">
        <label v-for="user in users" :key="`create-${user.id}`" class="member-picker-item">
          <input v-model="form.memberUserIds" type="checkbox" :value="user.id" />
          <span>{{ user.displayName }}</span>
          <small>@{{ user.username }}</small>
        </label>
      </div>

      <UiButton :disabled="submitting" block @click="emit('create-group')">
        {{ submitting ? t('common.creating') : t('quickActions.confirmCreate') }}
      </UiButton>
    </div>

    <div v-else-if="mode === 'dm'" class="quick-panel__body">
      <UiSurface v-if="!usersWithoutDm.length" tone="soft" class="empty-state">
        {{ t('conversation.allUsersHaveDm') }}
      </UiSurface>

      <div v-else class="compact-list">
        <button
          v-for="user in usersWithoutDm"
          :key="`quick-dm-${user.id}`"
          type="button"
          class="compact-list__item"
          @click="emit('open-dm', user)"
        >
          <strong>{{ user.displayName }}</strong>
          <span>@{{ user.username }}</span>
        </button>
      </div>
    </div>
  </UiSurface>
</template>
