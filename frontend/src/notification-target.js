const ROOM_KINDS = new Set(['dm', 'public', 'private']);
const KIND_PARAM = 'notificationRoomKind';
const ID_PARAM = 'notificationRoomId';

export function parseNotificationRoomTarget(data) {
  const kind = data?.roomKind;
  const id = Number(data?.roomId);
  return ROOM_KINDS.has(kind) && Number.isSafeInteger(id) && id > 0
    ? { kind, id }
    : null;
}

export function takeNotificationRoomTarget(browserWindow) {
  const url = new URL(browserWindow.location.href);
  if (!url.searchParams.has(KIND_PARAM) && !url.searchParams.has(ID_PARAM)) {
    return null;
  }

  const target = parseNotificationRoomTarget({
    roomKind: url.searchParams.get(KIND_PARAM),
    roomId: url.searchParams.get(ID_PARAM),
  });
  url.searchParams.delete(KIND_PARAM);
  url.searchParams.delete(ID_PARAM);
  browserWindow.history.replaceState(
    browserWindow.history.state,
    '',
    `${url.pathname}${url.search}${url.hash}`,
  );
  return target;
}
