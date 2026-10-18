import {
  canAccessFile,
  getFileRecord,
  getUploadedFileByClientId,
  recordUploadedFile
} from '../data/uploaded-files.js';
import { decryptAttachment, encryptAttachment } from '../encryption.js';
import { normalizeContentType, sanitizeFilename } from '../attachment-metadata.js';
import { validateSession } from '../session.js';
import { errorResponse, MAX_FILE_SIZE_DEFAULT, requestBodyTooLarge } from '../utils.js';

const FILE_RESPONSE_CACHE_CONTROL = 'private, no-store';
const UPLOAD_BODY_OVERHEAD_BYTES = 1024 * 1024;
const BLOCKED_MIME_TYPES = new Set([
  'text/html',
  'application/xhtml+xml',
  'image/svg+xml',
  'text/javascript',
  'application/javascript',
  'text/xml',
  'application/xml'
]);

function isInlineContentType(contentType) {
  if (!contentType) {
    return false;
  }
  if (contentType === 'application/pdf') {
    return true;
  }
  if (contentType.startsWith('image/')) {
    return contentType !== 'image/svg+xml';
  }
	if (contentType.startsWith('video/')) {
		return true;
	}
	if (contentType.startsWith('audio/')) {
		return true;
	}
	return false;
}

function contentDispositionValue(kind, filename) {
  const safeUtf8 = sanitizeFilename(filename);
  const safeAscii = safeUtf8
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/"/g, '')
    .trim()
    .slice(0, 150) || 'file';
  return `${kind}; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(safeUtf8)}`;
}

function validateUpload(env, file) {
  const maxFileSize = Number(env.MAX_FILE_SIZE || MAX_FILE_SIZE_DEFAULT);
  if (file.size > maxFileSize) {
    throw new Error(`文件大小不能超過 ${Math.round(maxFileSize / 1024 / 1024)}MB`);
  }

  const contentType = normalizeContentType(file.type);
  if (BLOCKED_MIME_TYPES.has(contentType)) {
    throw new Error('該文件類型不允許上傳');
  }

  const allowed = String(env.ALLOWED_FILE_TYPES || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (allowed.length && !allowed.some((prefix) => contentType.startsWith(prefix))) {
    throw new Error('該文件類型不允許上傳');
  }
}

export function registerUploadRoutes(app) {
  app.post('/api/upload', async (c) => {
    const session = c.get('session');
    const maxFileSize = Number(c.env.MAX_FILE_SIZE || MAX_FILE_SIZE_DEFAULT);
    if (requestBodyTooLarge(c.req.raw, maxFileSize + UPLOAD_BODY_OVERHEAD_BYTES)) {
      return errorResponse(`文件大小不能超過 ${Math.round(maxFileSize / 1024 / 1024)}MB`, 413);
    }
    if (!c.env.DB) {
      return errorResponse('當前部署缺少 D1 資料庫，無法上傳附件', 503);
    }
    const formData = await c.req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return errorResponse('請選擇文件');
    }

    try {
      const result = await saveUploadedFile(c.env, session, file);
      return c.json({ file: result.file });
    } catch (error) {
      const message = String(error?.message || '');
      if (message.startsWith('文件大小不能超過') || message === '該文件類型不允許上傳') {
        return errorResponse(message);
      }
      throw error;
    }
  });

  app.get('/files/:key{.+}', async (c) => {
    if (!c.env.DB) {
      return c.json({ error: '當前部署缺少 D1 資料庫，無法讀取附件' }, { status: 503 });
    }
    const key = decodeURIComponent(c.req.param('key'));
    const authorization = c.req.header('authorization') || '';
    const token = authorization.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length).trim()
      : new URL(c.req.url).searchParams.get('token') || '';
    const auth = token ? await validateSession(c.env, token) : null;
    const canRead = await canAccessFile(c.env.DB, key, auth?.ok ? auth.session.userId : null, [new URL(c.req.url).origin]);
    if (!canRead) {
      return new Response('Forbidden', { status: 403 });
    }

    // 優先讀 D1 內嵌數據；R2 時期未回填的舊記錄回落到 FILES 桶。
    const record = await getFileRecord(c.env.DB, key);
    const headers = new Headers();
    let rawBytes = null;
    let legacyCustomMetadata = null;
    if (record?.data) {
      rawBytes = record.data;
      const parsed = Date.parse(`${String(record.createdAt || '').replace(' ', 'T')}Z`);
      if (Number.isFinite(parsed)) {
        headers.set('last-modified', new Date(parsed).toUTCString());
      }
    } else {
      if (!c.env.FILES) {
        return new Response('Not Found', { status: 404 });
      }
      const object = await c.env.FILES.get(key);
      if (!object) {
        return new Response('Not Found', { status: 404 });
      }
      rawBytes = new Uint8Array(await object.arrayBuffer());
      object.writeHttpMetadata(headers);
      if (object.uploaded) {
        headers.set('last-modified', object.uploaded.toUTCString());
      }
      legacyCustomMetadata = object.customMetadata || null;
    }

    let decrypted;
    try {
      decrypted = await decryptAttachment(c.env, rawBytes, key);
    } catch (error) {
      console.error('Failed to decrypt attachment', { key, error });
      throw error;
    }

    headers.set('cache-control', FILE_RESPONSE_CACHE_CONTROL);
    headers.set('x-content-type-options', 'nosniff');
    headers.set('referrer-policy', 'no-referrer');
    headers.set(
      'content-security-policy',
      "sandbox; default-src 'none'; base-uri 'none'; form-action 'none'"
    );

    const contentType =
      (record ? normalizeContentType(record.contentType) : '') ||
      normalizeContentType(headers.get('content-type')) ||
      'application/octet-stream';
    headers.set('content-type', contentType);
    const inlineAllowed = isInlineContentType(contentType);
    const dispositionKind =
      inlineAllowed && !contentType.startsWith('text/') ? 'inline' : 'attachment';
    const filename =
      record?.filename || legacyCustomMetadata?.filename || key.split('/').pop() || 'file';
    headers.set('content-disposition', contentDispositionValue(dispositionKind, filename));

    return new Response(decrypted.bytes, { headers });
  });
}

export async function saveUploadedFile(env, session, file, { clientUploadId = null } = {}) {
  validateUpload(env, file);
  if (clientUploadId) {
    const existing = await getUploadedFileByClientId(env.DB, session.userId, clientUploadId);
    if (existing) return { file: existing, created: false };
  }

  const extension = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
  const key = `${session.userId}/${Date.now()}-${crypto.randomUUID()}${extension}`;
  const filename = sanitizeFilename(file.name);
  const contentType = normalizeContentType(file.type) || 'application/octet-stream';
  const encryptedFile = await encryptAttachment(env, await file.arrayBuffer(), key);

  // 檔案內容內嵌寫入 D1，單條語句即完成落盤與元數據登記，不再需要外部桶補償刪除。
  try {
    await recordUploadedFile(env.DB, {
      key,
      ownerUserId: session.userId,
      filename, contentType,
      size: file.size,
      data: encryptedFile,
      clientUploadId
    });
  } catch (error) {
    if (clientUploadId && String(error?.message || error).includes('UNIQUE')) {
      const existing = await getUploadedFileByClientId(env.DB, session.userId, clientUploadId);
      if (existing) return { file: existing, created: false };
    }
    throw error;
  }

  return {
    created: true,
    file: {
      key,
      name: filename,
      type: contentType,
      size: file.size,
      url: `/files/${encodeURIComponent(key)}`
    }
  };
}
