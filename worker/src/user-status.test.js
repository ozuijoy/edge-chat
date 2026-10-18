import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activeUserSql,
  banExpiryFromMinutes,
  isUserDisabled,
  projectUserBan
} from './user-status.js';

const NOW = Date.parse('2026-08-20T10:00:00.000Z');

test('用戶封禁狀態同時支持永久、臨時與自然到期', () => {
  assert.equal(isUserDisabled({ is_disabled: 1, disabled_until: null }, NOW), true);
  assert.equal(isUserDisabled({ is_disabled: 0, disabled_until: '2026-08-20T10:05:00.000Z' }, NOW), true);
  assert.equal(isUserDisabled({ is_disabled: 0, disabled_until: '2026-08-20T09:59:00.000Z' }, NOW), false);
  assert.equal(isUserDisabled({ is_disabled: 0, disabled_until: null }, NOW), false);
});

test('管理員用戶投影不會繼續展示已經到期的臨時封禁', () => {
  assert.deepEqual(projectUserBan({ is_disabled: 1, disabled_until: null }, NOW), {
    isDisabled: true,
    isPermanentlyDisabled: true,
    disabledUntil: null
  });
  assert.deepEqual(projectUserBan({
    is_disabled: 0,
    disabled_until: '2026-08-20T10:05:00.000Z'
  }, NOW), {
    isDisabled: true,
    isPermanentlyDisabled: false,
    disabledUntil: '2026-08-20T10:05:00.000Z'
  });
  assert.deepEqual(projectUserBan({
    is_disabled: 0,
    disabled_until: '2026-08-20T09:59:00.000Z'
  }, NOW), {
    isDisabled: false,
    isPermanentlyDisabled: false,
    disabledUntil: null
  });
});

test('封禁截止時間按分鐘計算且活躍用戶 SQL 使用數據庫當前時間', () => {
  assert.equal(banExpiryFromMinutes(65, NOW), '2026-08-20T11:05:00.000Z');
  assert.match(activeUserSql('u'), /u\.is_disabled = 0/);
  assert.match(activeUserSql('u'), /datetime\(u\.disabled_until\) <= CURRENT_TIMESTAMP/);
});
