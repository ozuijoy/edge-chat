<script setup>
import { Ban, CalendarClock, X } from '@lucide/vue';
import { computed, nextTick, ref, toRef, watch } from 'vue';
import {
  BAN_DURATION_PRESETS,
  banExpiryDate,
  resolveBanDurationMinutes
} from '../../admin/user-ban-duration.js';
import { useOverlayLifecycle } from '../../composables/useOverlayLifecycle.js';
import { formatDateTime, t } from '../../i18n.js';
import UiAvatar from '../ui/Avatar.vue';
import UiButton from '../ui/Button.vue';

const props = defineProps({
  show: { type: Boolean, default: false },
  user: { type: Object, default: null },
  saving: { type: Boolean, default: false },
  error: { type: String, default: '' }
});

const emit = defineEmits(['close', 'confirm']);
const selection = ref('one-day');
const customDuration = ref(1);
const customUnit = ref('days');
const localError = ref('');
const selectedOptionEl = ref(null);
const customDurationEl = ref(null);

const options = computed(() => [
  ...BAN_DURATION_PRESETS.map((option) => ({
    ...option,
    label: t(option.labelKey)
  })),
  { value: 'custom', label: t('users.ban.presets.custom') },
  { value: 'permanent', label: t('users.units.permanent') }
]);

const durationMinutes = computed(() => {
  try {
    return resolveBanDurationMinutes({
      selection: selection.value,
      customDuration: customDuration.value,
      customUnit: customUnit.value
    });
  } catch {
    return undefined;
  }
});

const durationSummary = computed(() => {
  if (durationMinutes.value === null) return t('users.ban.permanentSummary');
  if (durationMinutes.value === undefined) return t('users.invalidDuration');
  return t('users.ban.expiresAt', {
    time: formatDateTime(banExpiryDate(durationMinutes.value))
  });
});

function requestClose() {
  if (!props.saving) emit('close');
}

function setSelectedOption(element) {
  selectedOptionEl.value = element;
}

useOverlayLifecycle({
  open: toRef(props, 'show'),
  onClose: requestClose,
  focusTarget: selectedOptionEl
});

watch(
  () => props.show,
  (show) => {
    if (!show) return;
    selection.value = 'one-day';
    customDuration.value = 1;
    customUnit.value = 'days';
    localError.value = '';
  }
);

async function selectDuration(value) {
  selection.value = value;
  localError.value = '';
  if (value === 'custom') {
    await nextTick();
    customDurationEl.value?.focus();
  }
}

function submitBan() {
  if (props.saving) return;
  try {
    const minutes = resolveBanDurationMinutes({
      selection: selection.value,
      customDuration: customDuration.value,
      customUnit: customUnit.value
    });
    localError.value = '';
    emit('confirm', minutes);
  } catch {
    localError.value = t('users.invalidDuration');
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="admin-ban-dialog">
      <div v-if="show" class="admin-ban-dialog__overlay" @click.self="requestClose">
        <form
          class="admin-ban-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="user-ban-dialog-title"
          @submit.prevent="submitBan"
        >
          <header class="admin-ban-dialog__header">
            <div class="admin-ban-dialog__title-row">
              <span class="admin-ban-dialog__title-icon" aria-hidden="true"><Ban /></span>
              <div>
                <h2 id="user-ban-dialog-title">{{ t('users.ban.title', { name: user?.displayName || '' }) }}</h2>
                <p>{{ t('users.ban.description') }}</p>
              </div>
            </div>
            <button
              type="button"
              class="admin-ban-dialog__close"
              :aria-label="t('common.close')"
              :title="t('common.close')"
              :disabled="saving"
              @click="requestClose"
            >
              <X aria-hidden="true" />
            </button>
          </header>

          <div class="admin-ban-dialog__user">
            <UiAvatar
              :src="user?.avatarUrl"
              :alt="user?.displayName"
              :fallback="user?.displayName || user?.username || '?'"
            />
            <div>
              <strong>{{ user?.displayName }}</strong>
              <span>@{{ user?.username }}</span>
            </div>
          </div>

          <fieldset class="admin-ban-dialog__duration">
            <legend>{{ t('users.durationValue') }}</legend>
            <div class="admin-ban-dialog__options">
              <button
                v-for="(option, index) in options"
                :key="option.value"
                :ref="option.value === selection ? setSelectedOption : undefined"
                type="button"
                class="admin-ban-dialog__option"
                :class="{ 'admin-ban-dialog__option--selected': selection === option.value }"
                :aria-pressed="selection === option.value"
                :disabled="saving"
                @click="selectDuration(option.value)"
              >
                {{ option.label }}
              </button>
            </div>
          </fieldset>

          <div v-if="selection === 'custom'" class="admin-ban-dialog__custom">
            <label class="field">
              <span>{{ t('users.durationValue') }}</span>
              <input ref="customDurationEl" v-model.number="customDuration" type="number" min="1" step="1" :disabled="saving">
            </label>
            <label class="field">
              <span>{{ t('users.durationUnit') }}</span>
              <select v-model="customUnit" :disabled="saving">
                <option value="minutes">{{ t('users.units.minutes') }}</option>
                <option value="hours">{{ t('users.units.hours') }}</option>
                <option value="days">{{ t('users.units.days') }}</option>
              </select>
            </label>
          </div>

          <div class="admin-ban-dialog__summary" :class="{ 'admin-ban-dialog__summary--permanent': durationMinutes === null }">
            <CalendarClock aria-hidden="true" />
            <span>{{ durationSummary }}</span>
          </div>

          <p v-if="localError || error" class="admin-ban-dialog__error">{{ localError || error }}</p>

          <footer class="admin-ban-dialog__actions">
            <UiButton variant="secondary" :disabled="saving" @click="requestClose">{{ t('common.cancel') }}</UiButton>
            <UiButton type="submit" variant="destructive" :disabled="saving">
              {{ saving ? t('users.ban.saving') : t('users.confirmDisable') }}
            </UiButton>
          </footer>
        </form>
      </div>
    </Transition>
  </Teleport>
</template>
