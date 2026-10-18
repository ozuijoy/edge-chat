import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import enUS from '../frontend/src/locales/en-US.js';
import zhTW from '../frontend/src/locales/zh-TW.js';
import {
  detectBrowserLocale,
  ENGLISH_LOCALE,
  formatDate,
  formatDateTime,
  formatTime,
  getLocale,
  parseDateValue,
  setLocale,
  t,
  TRADITIONAL_CHINESE_LOCALE
} from '../frontend/src/i18n.js';
import { localizeErrorMessage } from '../frontend/src/localized-error.js';

test('語言運行時僅按需導入當前語言包', async () => {
  const source = await readFile(new URL('../frontend/src/i18n.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /^import .+ from ['"].*locales/m);
  assert.doesNotMatch(source, /locales\/zh-CN\.js/);
  assert.match(source, /\(\) => import\('\.\/locales\/zh-TW\.js'\)/);
  assert.match(source, /\(\) => import\('\.\/locales\/en-US\.js'\)/);
});

test('兩種語言包保持相同鍵集合', () => {
  assert.deepEqual(Object.keys(enUS).sort(), Object.keys(zhTW).sort());
});

test('演示 Star 入口提供兩種語言提示文案', () => {
  assert.equal(zhTW['demo.star'], '在 GitHub 上給我們點個 Star');
  assert.equal(enUS['demo.star'], 'Star on GitHub');
});

test('正體中文界面支持插值與未知鍵回退', async () => {
  await setLocale(TRADITIONAL_CHINESE_LOCALE);
  assert.equal(getLocale(), TRADITIONAL_CHINESE_LOCALE);
  assert.equal(t('chat.memberCount', { count: 3 }), '3 位成員');
  assert.equal(t('missing.translation.key'), 'missing.translation.key');
});

test('瀏覽器中文語言一律使用正體中文，其餘語言默認英文', () => {
  for (const language of [
    'zh',
    'zh-CN',
    'zh-SG',
    'zh-MY',
    'zh-Hans',
    'zh-Hans-HK',
    'zh-CHS',
    'zh-TW',
    'zh-HK',
    'zh-MO',
    'zh-Hant',
    'zh-Hant-CN',
    'zh-CHT',
    'ZH_hant_tw'
  ]) {
    assert.equal(detectBrowserLocale(language), TRADITIONAL_CHINESE_LOCALE);
  }

  for (const language of ['en-US', 'en-HK', 'ms-MY', 'ja-JP', '']) {
    assert.equal(detectBrowserLocale(language), ENGLISH_LOCALE);
  }
});

test('語言切換會持久化選擇', async () => {
  const stored = new Map();
  const originalLocalStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value)
  };

  try {
    await setLocale(TRADITIONAL_CHINESE_LOCALE);
    assert.equal(getLocale(), TRADITIONAL_CHINESE_LOCALE);
    assert.equal(stored.get('edgechat.locale'), TRADITIONAL_CHINESE_LOCALE);
    assert.equal(t('auth.signIn'), '登錄');
    await setLocale('zh-CN');
    assert.equal(getLocale(), TRADITIONAL_CHINESE_LOCALE);
  } finally {
    await setLocale(ENGLISH_LOCALE);
    if (originalLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalLocalStorage;
  }
});

test('日期格式跟隨當前語言', async () => {
  const value = new Date('2026-08-18T12:00:00.000Z');
  const options = { dateStyle: 'long', timeZone: 'UTC' };

  await setLocale(TRADITIONAL_CHINESE_LOCALE);
  const chinese = formatDate(value, options);
  await setLocale(ENGLISH_LOCALE);
  const english = formatDate(value, options);

  assert.equal(chinese, new Intl.DateTimeFormat(TRADITIONAL_CHINESE_LOCALE, options).format(value));
  assert.equal(english, new Intl.DateTimeFormat(ENGLISH_LOCALE, options).format(value));
  assert.notEqual(chinese, english);
  await setLocale(TRADITIONAL_CHINESE_LOCALE);
});

test('常用日期格式複用固定三個 formatter，切換語言失效，自定義選項保持即時語義', async () => {
  const Native = Intl.DateTimeFormat;
  let constructions = 0;
  Intl.DateTimeFormat = new Proxy(Native, {
    construct(target, args) {
      constructions++;
      return Reflect.construct(target, args);
    }
  });
  const value = '2026-10-11T02:03:00Z';
  try {
    for (const locale of ['zh-TW', 'en-US']) {
      await setLocale(locale);
      const before = constructions;
      for (let i = 0; i < 500; i++) {
        formatDateTime(value);
        formatDate(value);
        formatTime(value);
      }
      assert.equal(constructions - before, 3);
      assert.equal(formatTime(value), new Native(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(value)));
    }
    await setLocale(TRADITIONAL_CHINESE_LOCALE);
    const options = { hour: 'numeric', timeZone: 'UTC' };
    assert.equal(formatTime(value, options), new Native('zh-TW', options).format(new Date(value)));
    options.timeZone = 'Asia/Shanghai';
    assert.equal(formatTime(value, options), new Native('zh-TW', options).format(new Date(value)));
    assert.equal(formatTime('invalid'), '');
  } finally {
    Intl.DateTimeFormat = Native;
  }
});

test('D1 時間按 UTC 解析並轉換為客戶端時區', async () => {
  const d1Value = '2026-09-16 12:34:56';
  const isoValue = '2026-09-16T12:34:56.000Z';
  const options = { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Shanghai' };

  assert.equal(parseDateValue(d1Value).toISOString(), isoValue);
  assert.equal(parseDateValue(isoValue).toISOString(), isoValue);
  assert.equal(formatDateTime(d1Value, options), formatDateTime(isoValue, options));
  assert.equal(formatDateTime('not-a-date', options), '');
});

test('服務端固定與動態錯誤會按當前語言本地化', async () => {
  await setLocale(ENGLISH_LOCALE);
  assert.equal(localizeErrorMessage('賬號或密碼錯誤'), 'Incorrect username or password');
  assert.equal(
    localizeErrorMessage('封禁時長必須是正整數分鐘'),
    'Ban duration must be a positive integer number of minutes'
  );
  assert.equal(localizeErrorMessage('文件大小不能超過 16MB'), 'File size cannot exceed 16 MB');

  await setLocale(TRADITIONAL_CHINESE_LOCALE);
  assert.equal(localizeErrorMessage('賬號或密碼錯誤'), '賬號或密碼錯誤');
  assert.equal(localizeErrorMessage('文件大小不能超過 16MB'), '文件大小不能超過 16MB');

});
