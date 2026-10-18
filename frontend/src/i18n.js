import { computed, readonly, ref } from 'vue';

export const TRADITIONAL_CHINESE_LOCALE = 'zh-TW';
export const ENGLISH_LOCALE = 'en-US';
export const LOCALE_OPTIONS = Object.freeze([
  { value: TRADITIONAL_CHINESE_LOCALE, label: '繁體中文' },
  { value: ENGLISH_LOCALE, label: 'English' }
]);

const STORAGE_KEY = 'edgechat.locale';
const localeLoaders = {
  [TRADITIONAL_CHINESE_LOCALE]: () => import('./locales/zh-TW.js'),
  [ENGLISH_LOCALE]: () => import('./locales/en-US.js')
};

function normalizeLocale(value) {
  if (Object.hasOwn(localeLoaders, value)) return value;
  // 舊版儲存的 zh-CN 等中文標籤一律升級為正體中文。
  return /^zh(?:-|$)/i.test(String(value || '')) ? TRADITIONAL_CHINESE_LOCALE : ENGLISH_LOCALE;
}

export function detectBrowserLocale(value) {
  const language = String(value || '').replaceAll('_', '-');
  return /^zh(?:-|$)/i.test(language) ? TRADITIONAL_CHINESE_LOCALE : ENGLISH_LOCALE;
}

function initialLocale() {
  const storedLocale = typeof localStorage === 'undefined' ? '' : localStorage.getItem(STORAGE_KEY);
  if (storedLocale) return normalizeLocale(storedLocale);
  const browserLanguage = globalThis.navigator?.languages?.[0] || globalThis.navigator?.language;
  return detectBrowserLocale(browserLanguage);
}

const locale = ref(initialLocale());
const localeLoading = ref(false);
const activeMessages = ref({});
let translateServerError = (message) => message;

function interpolate(template, params) {
  return template.replace(/\{([a-zA-Z][\w]*)\}/g, (match, key) =>
    Object.hasOwn(params, key) ? String(params[key]) : match
  );
}

function applyDocumentLocale() {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale.value;
  const description = document.querySelector('meta[name="description"]');
  if (description) description.setAttribute('content', t('app.description'));
}

export function t(key, params = {}) {
  const template = activeMessages.value[key] ?? key;
  return interpolate(template, params);
}

export function localizeServerError(value) {
  const message = String(value || '');
  return message ? translateServerError(message) : message;
}

export async function setLocale(value, { persist = true } = {}) {
  const nextLocale = normalizeLocale(value);
  localeLoading.value = true;
  try {
    const localeModule = await localeLoaders[nextLocale]();
    activeMessages.value = localeModule.default;
    translateServerError = localeModule.localizeServerError || ((message) => message);
    locale.value = nextLocale;
    if (persist && typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, nextLocale);
    applyDocumentLocale();
  } finally {
    localeLoading.value = false;
  }
}

export function initializeI18n() {
  return setLocale(locale.value, { persist: false });
}

const SQLITE_UTC_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/;

export function parseDateValue(value) {
  if (value instanceof Date) return value;
  // D1 的 CURRENT_TIMESTAMP 是 UTC，但返回值沒有時區標記；補成 ISO UTC 後才能按瀏覽器時區正確展示。
  const normalizedValue =
    typeof value === 'string' && SQLITE_UTC_DATE_TIME_PATTERN.test(value)
      ? `${value.replace(' ', 'T')}Z`
      : value;
  return new Date(normalizedValue);
}

// 只緩存三個固定展示格式；自定義 options 保持原語義，不引入無限增長的全局緩存。
const dateTimeFormatter = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }));
const dateFormatter = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }));
const timeFormatter = computed(() => new Intl.DateTimeFormat(locale.value, { hour: '2-digit', minute: '2-digit' }));

function formatWith(value, options, formatter) {
  const date = parseDateValue(value);
  return Number.isNaN(date.getTime()) ? '' : (options === undefined ? formatter.value : new Intl.DateTimeFormat(locale.value, options)).format(date);
}

export function formatDateTime(value, options) {
  return formatWith(value, options, dateTimeFormatter);
}

export function formatDate(value, options) {
  return formatWith(value, options, dateFormatter);
}

export function formatTime(value, options) {
  return formatWith(value, options, timeFormatter);
}

export function compareLocalized(left, right) {
  return String(left).localeCompare(String(right), locale.value);
}

export function getLocale() {
  return locale.value;
}

export function useI18n() {
  return {
    locale: readonly(locale),
    localeLoading: readonly(localeLoading),
    isEnglish: computed(() => locale.value === ENGLISH_LOCALE),
    t,
    setLocale,
    formatDate,
    formatDateTime,
    formatTime,
    compareLocalized
  };
}
