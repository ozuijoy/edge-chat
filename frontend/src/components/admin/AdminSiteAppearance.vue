<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import api from '../../api.js';
import store from '../../store.js';
import UiButton from '../ui/Button.vue';
import UiSurface from '../ui/Surface.vue';
import { t } from '../../i18n.js';
import { can } from '../../authorization.ts';
import { resolveServerAssetUrl } from '../../capacitor-platform.ts';
import AdminSiteTheme from './AdminSiteTheme.vue';

const loading = ref(false);
const error = ref('');
const saving = ref(false);
const iconUploading = ref(false);
const themeSaving = ref(false);
const iconFileInputEl = ref(null);
const siteForm = reactive({ siteName: 'Edgechat', siteIconUrl: '' });
const busy = computed(() => loading.value || saving.value || iconUploading.value || themeSaving.value);
const iconPreviewUrl = computed(() => siteForm.siteIconUrl.startsWith('/files/')
  ? api.getFileUrl(siteForm.siteIconUrl)
  : resolveServerAssetUrl(siteForm.siteIconUrl));

async function loadSiteSettings() {
  if (busy.value) return;
  loading.value = true;
  error.value = '';
  try {
    const payload = await api.adminSiteSettings();
    siteForm.siteName = payload.site?.siteName || 'Edgechat';
    siteForm.siteIconUrl = payload.site?.siteIconUrl || '';
    store.setSite(payload.site);
  } catch (currentError) {
    error.value = currentError.message;
  } finally {
    loading.value = false;
  }
}

function openIconPicker() {
  iconFileInputEl.value?.click();
}

async function uploadSiteIcon(event) {
  if (busy.value) return;
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  iconUploading.value = true;
  error.value = '';
  try {
    const payload = await api.uploadFile(file);
    siteForm.siteIconUrl = payload.file.url;
  } catch (currentError) {
    error.value = currentError.message;
  } finally {
    iconUploading.value = false;
    event.target.value = '';
  }
}

async function saveSiteSettings() {
  if (busy.value) return;
  saving.value = true;
  error.value = '';
  try {
    const payload = await api.updateAdminSiteSettings(siteForm);
    siteForm.siteName = payload.site.siteName;
    siteForm.siteIconUrl = payload.site.siteIconUrl;
    store.setSite(payload.site);
  } catch (currentError) {
    error.value = currentError.message;
  } finally {
    saving.value = false;
  }
}

onMounted(loadSiteSettings);
</script>

<template>
  <UiSurface class="panel admin-site-appearance">
    <div class="admin-site-appearance__heading">
      <div>
        <h3 class="panel-title">{{ t('site.appearance.title') }}</h3>
        <p>{{ t('site.appearance.description') }}</p>
      </div>
      <UiButton variant="secondary" size="sm" :disabled="busy" @click="loadSiteSettings">
        {{ loading ? `${t('common.loading')}...` : t('site.reload') }}
      </UiButton>
    </div>

    <p v-if="error" class="error-text">{{ error }}</p>
    <label class="field">
      <span>{{ t('site.name') }}</span>
      <input v-model.trim="siteForm.siteName" :disabled="busy" :readonly="!can('site.appearance.update')" :placeholder="t('site.namePlaceholder')" />
    </label>
    <label class="field">
      <span>{{ t('site.iconUrl') }}</span>
      <input v-model.trim="siteForm.siteIconUrl" :disabled="busy" :readonly="!can('site.appearance.update')" :placeholder="t('site.iconUrlPlaceholder')" />
    </label>
    <div v-if="can('site.appearance.update')" class="inline-actions">
      <input ref="iconFileInputEl" type="file" accept="image/*" hidden @change="uploadSiteIcon" />
      <UiButton variant="secondary" size="sm" :disabled="busy" @click="openIconPicker">
        {{ iconUploading ? t('common.uploading') : t('site.uploadIcon') }}
      </UiButton>
      <UiButton :disabled="busy" @click="saveSiteSettings">
        {{ saving ? t('common.saving') : t('site.save') }}
      </UiButton>
    </div>
    <div class="admin-site-preview">
      <div class="admin-site-preview__icon">
        <img v-if="siteForm.siteIconUrl" :src="iconPreviewUrl" :alt="t('site.iconAlt')" />
        <span v-else>{{ siteForm.siteName.slice(0, 1) || 'C' }}</span>
      </div>
      <div class="admin-site-preview__meta">
        <strong>{{ siteForm.siteName || 'Edgechat' }}</strong>
        <span>{{ siteForm.siteIconUrl || t('site.noIconUrl') }}</span>
      </div>
    </div>
    <AdminSiteTheme :disabled="busy" @saving="themeSaving = $event" />
  </UiSurface>
</template>

<style scoped src="../../styles/admin/site-appearance.css"></style>
