const MINUTE_MS = 60 * 1000;

export function activeUserSql(alias = '') {
  const prefix = alias ? `${alias}.` : '';
  // 到期時間直接在查詢時判斷，避免為少量時間偏差引入定時任務與額外寫入。
  return `${prefix}is_disabled = 0
    AND (${prefix}disabled_until IS NULL OR datetime(${prefix}disabled_until) <= CURRENT_TIMESTAMP)`;
}

export function isUserDisabled(user, now = Date.now()) {
  if (Number(user?.is_disabled)) {
    return true;
  }

  const disabledUntil = Date.parse(user?.disabled_until || '');
  return Number.isFinite(disabledUntil) && disabledUntil > now;
}

export function banExpiryFromMinutes(durationMinutes, now = Date.now()) {
  return new Date(now + durationMinutes * MINUTE_MS).toISOString();
}

export function projectUserBan(row, now = Date.now()) {
  const isPermanentlyDisabled = Boolean(Number(row.is_disabled));
  const disabledUntilTimestamp = Date.parse(row.disabled_until || '');
  const disabledUntil = Number.isFinite(disabledUntilTimestamp) && disabledUntilTimestamp > now
    ? row.disabled_until
    : null;

  return {
    isDisabled: isPermanentlyDisabled || Boolean(disabledUntil),
    isPermanentlyDisabled,
    disabledUntil
  };
}
