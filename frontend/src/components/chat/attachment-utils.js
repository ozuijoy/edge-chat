const PREVIEWABLE_IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'avif'
]);

function cleanMimeType(value) {
  return String(value || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
}

function extensionFrom(value) {
  const cleanValue = String(value || '')
    .split('?')[0]
    .split('#')[0]
    .toLowerCase();
  const match = cleanValue.match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
}

export function isPreviewableImageAttachment(attachment) {
  if (!attachment) {
    return false;
  }

  const mimeType = cleanMimeType(attachment.type);
  if (mimeType === 'image/svg+xml') {
    return false;
  }
  if (mimeType.startsWith('image/')) {
    return true;
  }

  // 舊消息或異常瀏覽器可能缺少 MIME，保留擴展名兜底以免歷史圖片只能顯示成下載鏈接。
  const extension = extensionFrom(attachment.name) || extensionFrom(attachment.url);
  return PREVIEWABLE_IMAGE_EXTENSIONS.has(extension);
}

export function isVideoAttachment(attachment) {
  return cleanMimeType(attachment?.type).startsWith('video/');
}

export function isPdfAttachment(attachment) {
  return cleanMimeType(attachment?.type) === 'application/pdf';
}
