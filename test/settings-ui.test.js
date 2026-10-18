import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import enUS from '../frontend/src/locales/en-US.js';
import zhCN from '../frontend/src/locales/zh-CN.js';
import zhTW from '../frontend/src/locales/zh-TW.js';

const readFrontend = (path) =>
  readFileSync(new URL(`../frontend/src/${path}`, import.meta.url), 'utf8');

test('个人设置页将 Telegram 通知交给独立组件维护', () => {
  const page = readFrontend('pages/SettingsPage.vue');

  assert.match(page, /import TelegramNotificationSettings from/);
  assert.match(page, /<TelegramNotificationSettings class="settings-section" \/>/);
  assert.doesNotMatch(page, /telegramNotifications|createTelegramNotificationLink|isDemoMode/);
});

test('Telegram 通知设置覆盖加载、未绑定、等待与已绑定状态', () => {
  const component = readFrontend('components/settings/TelegramNotificationSettings.vue');

  for (const method of [
    'telegramNotifications',
    'createTelegramNotificationLink',
    'updateTelegramNotifications',
    'disconnectTelegramNotifications'
  ]) {
    assert.match(component, new RegExp(`api\\.${method}\\(`));
  }

  assert.match(component, /v-if="loading"/);
  assert.match(component, /v-else-if="telegramNotifications\?\.available"/);
  assert.match(component, /v-if="telegramNotifications\.connected"/);
  assert.match(component, /v-else-if="telegramLink"/);
  assert.match(component, /target="_blank"/);
  assert.match(component, /rel="noopener noreferrer"/);
  assert.match(component, /v-model="telegramNotifications\.dmEnabled"/);
  assert.match(component, /v-model="telegramNotifications\.mentionEnabled"/);
  assert.equal((component.match(/:disabled="telegramBusy"/g) || []).length, 5);
  assert.match(component, /onBeforeUnmount\(stopPolling\)/);
  assert.match(component, /if \(telegramPoll\) clearInterval\(telegramPoll\)/);
});

test('Telegram 通知控件复用项目按钮并在窄屏纵向排列', () => {
  const component = readFrontend('components/settings/TelegramNotificationSettings.vue');

  assert.match(component, /<UiButton/);
  assert.match(component, /class="ui-button ui-button--default ui-button--sm telegram-open-link"/);
  assert.match(component, /class="telegram-switch"/);
  assert.match(component, /input:focus-visible \+ span/);
  assert.match(component, /@media \(max-width: 420px\)/);
  assert.match(component, /\.telegram-actions > \*,/);
  assert.doesNotMatch(component, /<button(?:\s|>)/);
});

test('Telegram 状态文案在三种语言中完整且操作名称保持简洁', () => {
  for (const locale of [zhCN, zhTW, enUS]) {
    for (const key of [
      'settings.telegramStatusLoading',
      'settings.telegramStatusUnavailable',
      'settings.telegramStatusDisconnected',
      'settings.telegramStatusWaiting',
      'settings.telegramStatusConnected',
      'settings.telegramConnectedSuccess',
      'settings.telegramLinkExpired'
    ]) {
      assert.ok(locale[key]);
    }
  }

  assert.equal(zhCN['settings.telegramOpen'], '打开 Telegram');
  assert.equal(zhTW['settings.telegramOpen'], '開啟 Telegram');
  assert.equal(enUS['settings.telegramOpen'], 'Open Telegram');
});
