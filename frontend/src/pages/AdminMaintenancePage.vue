<script setup>
import { CheckCircle2, CircleAlert, Download, RefreshCw, ShieldCheck } from '@lucide/vue';
import { computed, ref } from 'vue';
import api from '../api.js';
import UiButton from '../components/ui/Button.vue';
import { useI18n } from '../i18n.js';
import store from '../store.js';

const { locale, t } = useI18n();
const report = ref(null);
const loading = ref(false);
const error = ref('');
const schema = computed(() => report.value?.checks.find((check) => check.id === 'schema')?.schema);
const detailKeys = ['missingArtifacts', 'missingMigrations', 'changedMigrations', 'unknownMigrations'];
const checkedTime = computed(() => report.value ? new Date(report.value.checkedAt).toLocaleString(locale.value) : '');

async function runChecks() {
  loading.value = true;
  error.value = '';
  report.value = null;
  try {
    report.value = await api.adminMaintenance();
  } catch (currentError) {
    error.value = currentError.message;
  } finally {
    loading.value = false;
  }
}

function exportReport() {
  const url = URL.createObjectURL(new Blob([JSON.stringify(report.value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `edgechat-diagnostics-${report.value.checkedAt.slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <section class="admin-section maintenance-page" :aria-busy="loading">
    <header class="admin-section__header">
      <div class="admin-section__heading">
        <h2>{{ t('admin.nav.maintenance') }}</h2>
        <p>{{ t('maintenance.description') }}</p>
      </div>
      <div class="maintenance-actions">
        <UiButton v-if="report && store.session?.isSuperAdmin" variant="secondary" @click="exportReport">
          <Download :size="17" aria-hidden="true" />{{ t('maintenance.download') }}
        </UiButton>
        <UiButton :disabled="loading" @click="runChecks">
          <RefreshCw :size="17" aria-hidden="true" :class="{ 'admin-spin': loading }" />
          {{ loading ? t('maintenance.running') : report ? t('maintenance.rerun') : t('maintenance.run') }}
        </UiButton>
      </div>
    </header>
    <div class="admin-section__body maintenance-body">
      <p v-if="error" class="error-text" role="alert">{{ error }}</p>
      <div v-if="!report" class="maintenance-empty" role="status">
        <ShieldCheck :size="36" aria-hidden="true" />
        <h3>{{ loading ? t('maintenance.running') : t('maintenance.empty') }}</h3>
        <p>{{ t('maintenance.emptyDescription') }}</p>
      </div>
      <template v-else>
        <p v-if="report.demo" class="maintenance-demo">{{ t('maintenance.demo') }}</p>
        <div class="maintenance-summary" :data-status="report.status" role="status">
          <CheckCircle2 v-if="report.status === 'ok'" :size="24" aria-hidden="true" />
          <CircleAlert v-else :size="24" aria-hidden="true" />
          <div>
            <h3>{{ t(`maintenance.summary.${report.status}`) }}</h3>
            <p>{{ t('maintenance.summaryTime', { time: checkedTime, duration: report.durationMs }) }}</p>
          </div>
        </div>
        <dl class="maintenance-versions">
          <div><dt>{{ t('maintenance.version') }}</dt><dd>{{ report.version }}</dd></div>
          <div v-if="store.session?.isSuperAdmin">
            <dt>{{ t('maintenance.databaseVersion') }}</dt>
            <dd>{{ schema?.appliedMigration || t('maintenance.unknown') }}</dd>
            <p>{{ t('maintenance.expected', { version: report.expectedMigration }) }}</p>
            <p v-if="schema">{{ t('maintenance.progress', { applied: schema.appliedCount, expected: schema.expectedCount }) }}</p>
          </div>
        </dl>
        <div class="maintenance-checks" role="table" :aria-label="t('maintenance.check')">
          <div class="maintenance-checks__head" role="row">
            <span role="columnheader">{{ t('maintenance.check') }}</span>
            <span role="columnheader">{{ t('maintenance.method') }}</span>
            <span role="columnheader">{{ t('maintenance.result') }}</span>
          </div>
          <div v-for="check in report.checks" :key="check.id" class="maintenance-check" role="row">
            <strong role="rowheader">{{ t(`maintenance.${check.id}`) }}</strong>
            <span class="maintenance-method" role="cell">{{ t(`maintenance.method.${check.id}`) }}</span>
            <div role="cell">
              <span class="maintenance-status" :data-status="check.status">
                <CheckCircle2 v-if="check.status === 'ok'" :size="15" aria-hidden="true" />
                <CircleAlert v-else :size="15" aria-hidden="true" />
                {{ t(`maintenance.status.${check.status}`) }}
              </span>
              <p v-if="check.code && !['ok', 'reachable', 'presence_only'].includes(check.code)" class="maintenance-check-note">{{ t(`maintenance.code.${check.code}`) }}</p>
            </div>
          </div>
        </div>
        <details v-if="store.session?.isSuperAdmin" class="maintenance-details" :open="report.status === 'error'">
          <summary>{{ t('maintenance.details') }}</summary>
          <template v-if="schema">
            <div v-for="key in detailKeys.filter((key) => schema[key].length)" :key="key" class="maintenance-detail">
              <h4>{{ t(`maintenance.${key}`) }}</h4>
              <ul><li v-for="item in schema[key]" :key="item"><code>{{ item }}</code></li></ul>
            </div>
            <div class="maintenance-detail"><h4>{{ t('maintenance.schemaHash') }}</h4><code>{{ schema.schemaHash }}</code></div>
          </template>
          <div class="maintenance-detail">
            <h4>{{ t('maintenance.environment') }}</h4>
            <ul class="maintenance-env">
              <li v-for="item in report.environment" :key="item.name">
                <code>{{ item.name }}</code>
                <span>{{ t(item.required ? 'maintenance.required' : 'maintenance.optional') }} · {{ t(item.present ? 'maintenance.present' : item.required ? 'maintenance.status.missing' : 'maintenance.default') }}</span>
              </li>
            </ul>
          </div>
        </details>
      </template>
      <aside class="maintenance-guide">
        <h3>{{ t('maintenance.guide') }}</h3>
        <ol>
          <li>{{ t('maintenance.guideDeploy') }}</li>
          <li>{{ t('maintenance.guideSchema') }}</li>
          <li>{{ t('maintenance.guideBindings') }}</li>
        </ol>
        <p>{{ t('maintenance.limits') }}</p>
      </aside>
    </div>
  </section>
</template>

<style scoped src="../styles/admin/maintenance.css"></style>
