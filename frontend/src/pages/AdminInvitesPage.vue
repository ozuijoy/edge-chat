<script setup>
import AdminUserCreator from '../components/admin/AdminUserCreator.vue';
import RegistrationInviteManager from '../components/admin/RegistrationInviteManager.vue';
import { t } from '../i18n.js';
import { can } from '../authorization.ts';
</script>

<template>
  <div class="admin-section admin-invites-page">
    <p class="admin-invites-page__intro">{{ t('invites.intro') }}</p>

    <div class="admin-section__body">
      <section v-if="can('users.create')" id="create-user" class="admin-anchor-section">
        <AdminUserCreator />
      </section>
      <section v-if="can('invites.read')" id="registration-links" class="admin-anchor-section">
        <RegistrationInviteManager />
      </section>
    </div>
  </div>
</template>

<style scoped src="../styles/admin/invites-page.css"></style>
