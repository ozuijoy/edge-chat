export const isDemoMode = false;
export const runtimeSessionToken = '';

export async function requestRuntime() {
  throw new Error('Runtime request adapter is unavailable in production mode.');
}

export function getRuntimeFileUrl(value) {
  return String(value || '');
}

export function connectRuntimeRoomSocket() {
  return null;
}

export function connectRuntimeInboxSocket() {
  return null;
}

export function getRuntimeUpdateResult() {
  return null;
}

export function resetRuntime() {}
