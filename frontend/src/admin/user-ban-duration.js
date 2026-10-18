export const BAN_DURATION_PRESETS = Object.freeze([
  { value: 'one-hour', minutes: 60, labelKey: 'users.ban.presets.oneHour' },
  { value: 'eight-hours', minutes: 8 * 60, labelKey: 'users.ban.presets.eightHours' },
  { value: 'one-day', minutes: 24 * 60, labelKey: 'users.ban.presets.oneDay' },
  { value: 'seven-days', minutes: 7 * 24 * 60, labelKey: 'users.ban.presets.sevenDays' }
]);

export const BAN_UNIT_MINUTES = Object.freeze({
  minutes: 1,
  hours: 60,
  days: 24 * 60
});

export function resolveBanDurationMinutes({ selection, customDuration, customUnit }) {
  if (selection === 'permanent') return null;

  if (selection === 'custom') {
    const durationMinutes = Number(customDuration) * BAN_UNIT_MINUTES[customUnit];
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1) {
      throw new RangeError('invalid_ban_duration');
    }
    return durationMinutes;
  }

  const preset = BAN_DURATION_PRESETS.find((option) => option.value === selection);
  if (!preset) throw new RangeError('invalid_ban_duration');
  return preset.minutes;
}

export function banExpiryDate(durationMinutes, now = Date.now()) {
  return new Date(now + durationMinutes * 60 * 1000);
}
