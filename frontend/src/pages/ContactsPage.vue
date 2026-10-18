<script setup lang="ts">
import { Menu, Search, UsersRound, UserRoundCheck } from "@lucide/vue";
import { onBeforeUnmount, watch } from "vue";
import type { UserSummary } from "../../../shared/user-profile.ts";
import UiAvatar from "../components/ui/Avatar.vue";
import UiButton from "../components/ui/Button.vue";
import { useContacts } from "../composables/useContacts.ts";
import { t } from "../i18n.js";

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{
	openNavigation: [];
	openProfile: [user: UserSummary];
	unblocked: [userId: number];
}>();
const { query, view, loading, error, actionError, savingUserId, filteredUsers, load, selectView, unblock, dispose } = useContacts();

watch(() => props.visible, (visible) => { if (visible) void load(true); }, { immediate: true });
onBeforeUnmount(dispose);

async function unblockContact(userId: number) {
	if (await unblock(userId)) emit("unblocked", userId);
}
</script>

<template>
  <main class="contacts-page">
    <header class="contacts-page__header">
      <div class="contacts-page__title-row">
        <button type="button" class="contacts-page__menu" :aria-label="t('nav.openNavigation')" @click="emit('openNavigation')">
          <Menu :size="22" aria-hidden="true" />
        </button>
        <h1>{{ t('contacts.title') }}</h1>
      </div>
      <div class="contacts-page__filters" role="group" :aria-label="t('contacts.title')">
        <button type="button" :aria-pressed="view === 'all'" :disabled="savingUserId !== null" @click="selectView('all')">{{ t('contacts.all') }}</button>
        <button type="button" :aria-pressed="view === 'blocked'" :disabled="savingUserId !== null" @click="selectView('blocked')">{{ t('contacts.blocked') }}</button>
      </div>
      <label class="contacts-page__search">
        <Search :size="18" aria-hidden="true" />
        <span class="sr-only">{{ t('contacts.search') }}</span>
        <input v-model="query" type="search" :placeholder="t('contacts.search')" autocomplete="off" />
      </label>
    </header>

    <section class="contacts-page__body" :aria-busy="loading">
      <p v-if="actionError" class="contacts-page__error" role="alert">{{ actionError }}</p>
      <div v-if="loading" class="contacts-page__state" role="status">
        <span class="contacts-page__spinner" aria-hidden="true"></span>
        <span>{{ t('contacts.loading') }}</span>
      </div>
      <div v-else-if="error" class="contacts-page__state" role="alert">
        <UsersRound :size="30" aria-hidden="true" />
        <p>{{ t('contacts.loadFailed') }}</p>
        <UiButton variant="secondary" @click="load(true)">{{ t('common.retry') }}</UiButton>
      </div>
      <div v-else-if="!filteredUsers.length" class="contacts-page__state" role="status">
        <UsersRound :size="30" aria-hidden="true" />
        <p>{{ query.trim() ? t('contacts.noResults') : t(view === 'blocked' ? 'contacts.blockedEmpty' : 'contacts.empty') }}</p>
      </div>
      <ul v-else class="contacts-page__list" :aria-label="t(view === 'blocked' ? 'contacts.blocked' : 'contacts.list')">
        <li v-for="user in filteredUsers" :key="user.id">
          <button
            type="button"
            class="contacts-page__row"
            :aria-label="t('profile.view', { name: user.displayName || user.username })"
            @click="emit('openProfile', user)"
          >
            <UiAvatar :src="user.avatarUrl" :fallback="user.displayName || user.username" size="md" />
            <span>{{ user.displayName || user.username }}</span>
          </button>
          <button
            v-if="view === 'blocked'"
            type="button"
            class="contacts-page__unblock"
            :disabled="savingUserId !== null"
            :aria-label="t('contacts.unblockNamed', { name: user.displayName || user.username })"
            :aria-busy="savingUserId === user.id"
            @click="unblockContact(user.id)"
          >
            <span v-if="savingUserId === user.id" class="contacts-page__spinner contacts-page__spinner--small" aria-hidden="true"></span>
            <UserRoundCheck v-else :size="18" aria-hidden="true" />
            <span>{{ t('chat.unblock') }}</span>
          </button>
        </li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
.contacts-page {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  background: var(--chat-paper);
  color: var(--chat-ink);
}

.contacts-page__header {
  display: grid;
  gap: 20px;
  padding: 28px clamp(20px, 5vw, 64px) 24px;
  border-bottom: 1px solid var(--chat-line);
  background: var(--chat-paper);
}

.contacts-page__title-row { display: flex; align-items: center; gap: 8px; }
.contacts-page__title-row h1 { margin: 0; font-size: 24px; font-weight: 650; letter-spacing: 0; }

.contacts-page__menu {
  display: none;
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--chat-muted);
}

.contacts-page__search {
  display: flex;
  align-items: center;
  width: min(100%, 620px);
  height: 44px;
  gap: 10px;
  padding: 0 14px;
  border: 1px solid var(--chat-line);
  border-radius: 22px;
  background: var(--chat-hover);
  color: var(--chat-muted);
}

.contacts-page__search:focus-within { border-color: var(--chat-accent); box-shadow: 0 0 0 2px rgba(var(--site-brand-rgb, 0, 128, 105), 0.14); }
.contacts-page__search input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--chat-ink); font: inherit; letter-spacing: 0; }

.contacts-page__body {
  width: min(100%, 760px);
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  padding: 8px clamp(12px, 5vw, 64px) calc(24px + env(safe-area-inset-bottom));
}

.contacts-page__list { margin: 0; padding: 0; list-style: none; }
.contacts-page__list li { display: flex; align-items: center; gap: 8px; }
.contacts-page__list li + li { border-top: 1px solid var(--chat-hover); }
.contacts-page__filters { display: flex; gap: 8px; }
.contacts-page__filters button { min-height: 44px; padding: 0 16px; border: 1px solid var(--chat-line); border-radius: 6px; background: transparent; color: var(--chat-muted); font: inherit; cursor: pointer; }
.contacts-page__filters button[aria-pressed="true"] { border-color: var(--chat-accent); background: var(--chat-selected); color: var(--chat-accent); }
.contacts-page__filters button:hover, .contacts-page__unblock:hover { background: var(--chat-hover); }
.contacts-page__filters button:focus-visible, .contacts-page__unblock:focus-visible { outline: 2px solid var(--chat-accent); outline-offset: 2px; }
.contacts-page__unblock { display: inline-flex; flex: 0 0 auto; min-height: 44px; align-items: center; justify-content: center; gap: 6px; padding: 0 10px; border: 0; border-radius: 6px; background: transparent; color: var(--chat-accent); font: inherit; font-size: 14px; cursor: pointer; white-space: nowrap; }
.contacts-page__filters button:disabled, .contacts-page__unblock:disabled { opacity: 0.6; cursor: wait; }
.contacts-page__error { color: var(--chat-danger); font-size: 14px; }

.contacts-page__row {
  display: flex;
  width: 100%;
  min-width: 0;
  flex: 1;
  min-height: 80px;
  align-items: center;
  gap: 14px;
  padding: 10px 8px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--chat-ink);
  cursor: pointer;
  text-align: left;
  touch-action: manipulation;
}

.contacts-page__row:hover { background: var(--chat-hover); }
.contacts-page__row:active { background: var(--chat-selected); }
.contacts-page__row:focus-visible, .contacts-page__menu:focus-visible { outline: 2px solid var(--chat-accent); outline-offset: 2px; }
.contacts-page__row > span { min-width: 0; overflow: hidden; font-size: 15px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.contacts-page__row .ui-avatar { width: 42px; height: 42px; border-radius: 50%; box-shadow: none; }

.contacts-page__state {
  display: grid;
  min-height: 240px;
  place-items: center;
  align-content: center;
  gap: 12px;
  padding: 24px;
  color: var(--chat-muted);
  text-align: center;
}

.contacts-page__state p { margin: 0; }
.contacts-page__spinner { width: 26px; height: 26px; border: 2px solid var(--chat-line); border-top-color: var(--chat-accent); border-radius: 50%; animation: contacts-spin 700ms linear infinite; }
.contacts-page__spinner--small { width: 18px; height: 18px; }
@keyframes contacts-spin { to { transform: rotate(360deg); } }

@media (max-width: 960px) {
  .contacts-page__header {
    gap: 10px;
    padding: max(8px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) 12px max(12px, env(safe-area-inset-left));
  }
  .contacts-page__menu { display: grid; }
  .contacts-page__title-row h1 { font-size: 21px; }
  .contacts-page__search { width: 100%; }
  .contacts-page__body { width: 100%; padding-right: max(8px, env(safe-area-inset-right)); padding-left: max(8px, env(safe-area-inset-left)); scrollbar-gutter: auto; }
}

@media (prefers-reduced-motion: reduce) {
  .contacts-page__spinner { animation: none; }
}
</style>
