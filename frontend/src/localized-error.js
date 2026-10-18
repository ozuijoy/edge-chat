import { localizeServerError, t } from './i18n.js';

export function localizeErrorMessage(value) {
  return localizeServerError(value);
}

export function localizedError(error) {
  if (!(error instanceof Error)) return new Error(localizeErrorMessage(error));
  error.message = localizeErrorMessage(error.message) || t('updates.checkFailed');
  return error;
}
