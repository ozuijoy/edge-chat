import { runAuthorizedBatch } from '../rbac/authorization.ts';
import { listStorageOwners } from '../data/users.js';

const BACKFILL_PAGE_SIZE = 90;
const BACKFILL_WRITE_BATCH = 20;
const USER_OWNER_KEY_PATTERN = /^([1-9]\d*)\//;

function toBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return null;
}

export function registerStorageRoutes(app) {
  app.get('/api/admin/storage', async (c) => {
    const row = await c.env.DB.prepare("SELECT setting_value FROM site_settings WHERE setting_key = 'admin_storage_snapshot'").first();
    return c.json(row ? JSON.parse(row.setting_value) : { items: [], users: [], scannedAt: null });
  });

  // 檔案已內嵌存於 D1，掃描改為單次聚合查詢，不再需要 R2 分頁游標。
  app.post('/api/admin/storage/scan', async (c) => {
    const db = c.get('authorizationDatabase');
    await runAuthorizedBatch(db, c.get('authorizationContext'), [], {
      sql: "NOT EXISTS (SELECT 1 FROM admin_audit_log WHERE actor_id = ? AND action = 'storage.scan' AND created_at > datetime('now', '-1 minute'))",
      params: [c.get('session').userId],
    });
    const { results } = await db
      .prepare(
        `SELECT
           CASE
             WHEN object_key LIKE 'telegram/%' THEN 'system:telegram'
             WHEN owner_user_id IS NOT NULL THEN 'user:' || owner_user_id
             ELSE 'system:unknown'
           END AS owner_key,
           COUNT(*) AS object_count,
           COALESCE(SUM(size), 0) AS bytes,
           strftime('%Y-%m-%dT%H:%M:%SZ', MAX(created_at)) AS latest_uploaded_at
         FROM uploaded_files
         GROUP BY 1
          ORDER BY CASE WHEN owner_key LIKE 'user:%' THEN 0 ELSE 1 END, owner_key ASC`,
      )
      .all();
    const items = results.map((row) => {
      const ownerKey = String(row.owner_key);
      const ownerType = ownerKey === 'system:telegram'
        ? 'telegram'
        : ownerKey.startsWith('user:')
          ? 'user'
          : 'unknown';
      return {
        ownerKey,
        ownerType,
        ownerId: ownerType === 'user' ? Number(ownerKey.slice('user:'.length)) : null,
        objectCount: Number(row.object_count) || 0,
        bytes: Number(row.bytes) || 0,
        latestUploadedAt: row.latest_uploaded_at || null,
      };
    });
    const users = await listStorageOwners(db);
    const scannedObjects = items.reduce((total, item) => total + item.objectCount, 0);
    const snapshot = { items, users, scannedAt: new Date().toISOString() };
    await runAuthorizedBatch(db, c.get('authorizationContext'), [
      db.prepare(`INSERT INTO site_settings (setting_key, setting_value)
        VALUES ('admin_storage_snapshot', ?)
        ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP`).bind(JSON.stringify(snapshot)),
    ]);
    return c.json({ items, users, scannedObjects, truncated: false, cursor: null });
  });

  // 一次性回填工具：把 R2 桶中尚未內嵌 D1 數據的對象逐頁複製進 uploaded_files.data。
  app.post('/api/admin/files/backfill', async (c) => {
    if (!c.env.FILES) {
      return c.json({ scanned: 0, inserted: 0, filled: 0, skipped: 0, missing: 0, truncated: false, cursor: null });
    }
    const db = c.get('authorizationDatabase');
    const context = c.get('authorizationContext');
    await runAuthorizedBatch(db, context, [], {
      sql: "NOT EXISTS (SELECT 1 FROM admin_audit_log WHERE actor_id = ? AND action = 'storage.backfill' AND created_at > datetime('now', '-10 seconds'))",
      params: [c.get('session').userId],
    });

    const cursor = c.req.query('cursor') || '';
    const listed = await c.env.FILES.list({
      limit: BACKFILL_PAGE_SIZE,
      ...(cursor ? { cursor } : {}),
    });
    const objects = listed.objects ?? [];
    const keys = objects.map((object) => String(object.key || '')).filter(Boolean);
    const counted = { scanned: keys.length, inserted: 0, filled: 0, skipped: 0, missing: 0 };

    const hasData = new Set();
    const hasRow = new Set();
    const userCandidates = new Set();
    if (keys.length) {
      const keyPlaceholders = Array.from({ length: keys.length }, () => '?').join(', ');
      const { results } = await db
        .prepare(`SELECT object_key, (data IS NOT NULL) AS has_data
          FROM uploaded_files WHERE object_key IN (${keyPlaceholders})`)
        .bind(...keys)
        .all();
      for (const row of results) {
        hasRow.add(String(row.object_key));
        if (row.has_data) hasData.add(String(row.object_key));
      }
      for (const key of keys) {
        const match = USER_OWNER_KEY_PATTERN.exec(key);
        if (match) userCandidates.add(Number(match[1]));
      }
    }

    // 用戶已完全清除時改掛系統歸屬，避免 INSERT 因外鍵約束失敗。
    const existingUserIds = new Set();
    if (userCandidates.size) {
      const userPlaceholders = Array.from({ length: userCandidates.size }, () => '?').join(', ');
      const { results } = await db
        .prepare(`SELECT id FROM users WHERE id IN (${userPlaceholders})`)
        .bind(...userCandidates)
        .all();
      for (const row of results) existingUserIds.add(Number(row.id));
      for (const candidate of userCandidates) {
        if (!existingUserIds.has(candidate)) userCandidates.delete(candidate);
      }
    }

    // 寫入一律經授權數據層注入同事務複驗與審計。
    const writes = [];
    const flush = async () => {
      if (!writes.length) return;
      await c.env.DB.batch(writes);
      writes.length = 0;
    };

    for (const object of objects) {
      const key = String(object.key || '');
      if (!key) {
        counted.missing += 1;
        continue;
      }
      if (hasData.has(key)) {
        counted.skipped += 1;
        continue;
      }
      let bytes = null;
      try {
        bytes = toBytes(await object.arrayBuffer());
      } catch {
        bytes = null;
      }
      if (!bytes || bytes.byteLength === 0) {
        counted.missing += 1;
        continue;
      }
      if (hasRow.has(key)) {
        writes.push(
          c.env.DB.prepare('UPDATE uploaded_files SET data = ? WHERE object_key = ?').bind(bytes, key),
        );
        counted.filled += 1;
      } else {
        // Telegram 導入的舊對象沒有元數據行：補建系統歸屬記錄，大小沿用桶內信封字節數。
        const match = USER_OWNER_KEY_PATTERN.exec(key);
        const ownerUserId = match && userCandidates.has(Number(match[1])) ? Number(match[1]) : null;
        writes.push(
          c.env.DB
            .prepare(
              `INSERT INTO uploaded_files (object_key, owner_user_id, filename, content_type, size, data, created_at)
               VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            )
            .bind(
              key,
              ownerUserId,
              String(object.customMetadata?.filename || key.split('/').pop() || 'file'),
              String(object.httpMetadata?.contentType || ''),
              Number(object.size || bytes.byteLength),
              bytes,
            ),
        );
        counted.inserted += 1;
      }
      if (writes.length >= BACKFILL_WRITE_BATCH) await flush();
    }
    await flush();

    return c.json({
      ...counted,
      truncated: Boolean(listed.truncated),
      cursor: listed.truncated ? String(listed.cursor) : null,
    });
  });
}
