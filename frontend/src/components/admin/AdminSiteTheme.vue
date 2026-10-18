<script setup>
import { ref } from 'vue';
import api from '../../api.js';
import store from '../../store.js';
import { can } from '../../authorization.ts';
import { t } from '../../i18n.js';
import { SITE_COLOR_THEMES } from '../../../../shared/site-theme.ts';

defineProps({ disabled: Boolean });
const emit = defineEmits(['saving']);
const saving = ref('');
const error = ref('');
const saved = ref(false);

async function selectTheme(colorTheme) {
  if (saving.value || !can('site.appearance.update') || store.site.colorTheme === colorTheme) return;
  saving.value = colorTheme;
  emit('saving', true);
  error.value = '';
  saved.value = false;
  try {
    // 只提交配色，避免一键切换顺带保存尚未确认的名称或图标草稿。
    const payload = await api.updateAdminSiteSettings({ colorTheme });
    store.setSite(payload.site);
    saved.value = true;
  } catch (currentError) {
    error.value = currentError.message;
  } finally {
    saving.value = '';
    emit('saving', false);
  }
}
</script>

<template>
  <section class="site-theme" :aria-label="t('site.theme.title')">
    <h4>{{ t('site.theme.title') }}</h4>
    <p class="site-theme__description">{{ t('site.theme.description') }}</p>
    <div class="site-theme__options">
      <button
        v-for="theme in SITE_COLOR_THEMES" :key="theme" type="button"
        class="site-theme__option" :data-palette="theme"
        :aria-pressed="store.site.colorTheme === theme"
        :disabled="disabled || !!saving || !can('site.appearance.update')"
        @click="selectTheme(theme)"
      >
        <span class="site-theme__swatches" aria-hidden="true"><i /><i /><i /></span>
        <span class="site-theme__label">{{ t(`site.theme.${theme}`) }}</span>
        <span class="site-theme__state">
          {{ saving === theme ? t('common.saving') : store.site.colorTheme === theme ? t('site.theme.current') : t('site.theme.apply') }}
        </span>
      </button>
    </div>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <p v-if="saved" class="site-theme__feedback" role="status">{{ t('site.theme.saved') }}</p>
  </section>
</template>

<style scoped src="../../styles/admin/site-theme.css"></style>
