import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BAN_DURATION_PRESETS,
  banExpiryDate,
  resolveBanDurationMinutes
} from '../frontend/src/admin/user-ban-duration.js';

test('封禁快捷時長、永久封禁與自定義單位統一換算為分鐘', () => {
  assert.deepEqual(BAN_DURATION_PRESETS.map((option) => option.minutes), [60, 480, 1440, 10080]);
  assert.equal(resolveBanDurationMinutes({ selection: 'one-day' }), 1440);
  assert.equal(resolveBanDurationMinutes({ selection: 'permanent' }), null);
  assert.equal(resolveBanDurationMinutes({ selection: 'custom', customDuration: 90, customUnit: 'minutes' }), 90);
  assert.equal(resolveBanDurationMinutes({ selection: 'custom', customDuration: 3, customUnit: 'hours' }), 180);
  assert.equal(resolveBanDurationMinutes({ selection: 'custom', customDuration: 2, customUnit: 'days' }), 2880);
});

test('自定義封禁時長拒絕零、負數、非整數和未知單位', () => {
  for (const input of [
    { customDuration: 0, customUnit: 'hours' },
    { customDuration: -1, customUnit: 'days' },
    { customDuration: 1.5, customUnit: 'minutes' },
    { customDuration: 1, customUnit: 'weeks' }
  ]) {
    assert.throws(
      () => resolveBanDurationMinutes({ selection: 'custom', ...input }),
      /invalid_ban_duration/
    );
  }
});

test('封禁截止時間按分鐘從當前時刻計算', () => {
  const now = Date.parse('2026-08-29T00:00:00.000Z');
  assert.equal(banExpiryDate(90, now).toISOString(), '2026-08-29T01:30:00.000Z');
});
