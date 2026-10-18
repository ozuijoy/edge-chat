import assert from 'node:assert/strict';
import test from 'node:test';
import { Hono } from 'hono';
import { registerUploadRoutes } from './api/upload.js';
import { encryptAttachment } from './encryption.js';

const keyring = JSON.stringify({
  activeKeyId: 'v1',
  keys: {
    v1: Buffer.from(Uint8Array.from({ length: 32 }, (_, index) => 255 - index)).toString('base64')
  }
});

// D1-first 存取層 mock：getFileRecord / canAccessFile / recordUploadedFile 均走 D1。
// - accessible: 控管 canAccessFile 是否放行
// - record: 模擬 uploaded_files 行（data 為加密 BLOB）
function fileDb({ accessible = true, record = null } = {}) {
  return {
    prepare(sql) {
      return {
        bind() {
          return {
            async all() {
              if (sql.includes('SELECT object_key, owner_user_id, filename, content_type, size, data, created_at')) {
                return record ? { results: [record] } : { results: [] };
              }
              if (sql.includes('SELECT (')) {
                // canAccessFile public-reference 查詢
                return accessible ? { results: [{ public_reference: 0, site_icon_url: null, site_icon_content_type: null }] } : { results: [] };
              }
              // canAccessFile 成員/所有者查詢
              if (sql.includes('AS found')) {
                return accessible ? { results: [{ found: 1 }] } : { results: [] };
              }
              // getUploadedFileMetadata / getOwnedUploadedFileMetadata 形狀
              if (sql.includes('SELECT filename, content_type, size')) {
                return record
                  ? { results: [{ filename: record.filename, content_type: record.content_type, size: record.size }] }
                  : { results: [] };
              }
              return { results: [] };
            },
            run() {
              return { meta: { changes: 1, last_row_id: 1 } };
            }
          };
        },
        async run() {
          return { meta: { changes: 1, last_row_id: 1 } };
        }
      };
    }
  };
}

test('attachment upload reports when the deployment has no D1 binding', async () => {
  const app = new Hono();
  app.use('/api/*', async (c, next) => {
    c.set('session', { userId: 42 });
    return next();
  });
  registerUploadRoutes(app);

  const formData = new FormData();
  formData.set('file', new File(['hello'], 'hello.txt', { type: 'text/plain' }));
  const response = await app.request(
    'https://edgechat.test/api/upload',
    {
      method: 'POST',
      body: formData
    },
    { EDGECHAT_ENCRYPTION_KEYRING: keyring }
  );

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: '當前部署缺少 D1 資料庫，無法上傳附件'
  });
});

test('authorized attachment download decrypts bytes and disables shared caching', async () => {
  const objectKey = '42/報告.bin';
  const plaintext = Uint8Array.from([1, 2, 3, 4]);
  const ciphertext = await encryptAttachment(keyring, plaintext, objectKey);
  const app = new Hono();
  registerUploadRoutes(app);

  const response = await app.request(
    `https://edgechat.test/files/${encodeURIComponent(objectKey)}`,
    {},
    {
      DB: fileDb({
        accessible: true,
        record: {
          object_key: objectKey,
          owner_user_id: 42,
          filename: '報告.bin',
          content_type: 'application/octet-stream',
          size: 4,
          data: ciphertext.buffer,
          created_at: '2026-08-10 00:00:00',
        }
      }),
      EDGECHAT_ENCRYPTION_KEYRING: keyring
    }
  );

  assert.equal(response.status, 200);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), plaintext);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.match(response.headers.get('content-disposition'), /%E5%A0%B1%E5%91%8A\.bin/);
});

test('unauthorized attachment download is rejected before reading D1', async () => {
  	const dbRead = false;
	const app = new Hono();
	registerUploadRoutes(app);

	const response = await app.request(
		'https://edgechat.test/files/42/private.bin',
		{},
		{
			DB: fileDb({ accessible: false }),
			EDGECHAT_ENCRYPTION_KEYRING: keyring
		}
	);

	assert.equal(response.status, 403);
	assert.equal(dbRead, false);
});

test('authorized attachment download reports when the deployment has no D1 binding', async () => {
  const app = new Hono();
  registerUploadRoutes(app);

  const response = await app.request(
    'https://edgechat.test/files/42/private.bin',
    {},
    { EDGECHAT_ENCRYPTION_KEYRING: keyring }
  );

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: '當前部署缺少 D1 資料庫，無法讀取附件'
  });
});

test('telegram attachment downloads through message authorization without uploaded file ownership', async () => {
  const objectKey = 'telegram/-1001/9-example.jpg';
  const plaintext = Uint8Array.from([5, 6, 7]);
  const ciphertext = await encryptAttachment(keyring, plaintext, objectKey);
  const app = new Hono();
  registerUploadRoutes(app);

  const response = await app.request(
    `https://edgechat.test/files/${encodeURIComponent(objectKey)}`,
    {},
    {
      DB: fileDb({
        accessible: true,
        record: {
          object_key: objectKey,
          owner_user_id: null,
          filename: 'telegram-photo.jpg',
          content_type: 'image/jpeg',
          size: 3,
          data: ciphertext.buffer,
          created_at: '2026-08-10 00:00:00',
        }
      }),
      EDGECHAT_ENCRYPTION_KEYRING: keyring
    }
  );

  assert.equal(response.status, 200);
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), plaintext);
  assert.equal(response.headers.get('content-type'), 'image/jpeg');
  assert.match(response.headers.get('content-disposition'), /telegram-photo\.jpg/);
});
