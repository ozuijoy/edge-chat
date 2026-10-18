import manifest from '../../../worker/src/generated/schema-manifest.json' with { type: 'json' };
import { assessSchema, D1_MIGRATION_LEDGER } from '../../../worker/src/maintenance/schema-contract.ts';

export function demoMaintenanceReport() {
  const schema = assessSchema(
    manifest,
    new Set([...manifest.artifacts, `table:${D1_MIGRATION_LEDGER}`]),
    new Map(manifest.migrations.map((migration) => [migration.id, migration.checksum]))
  );
  return {
    demo: true, checkedAt: new Date().toISOString(), durationMs: 0, status: 'ok',
    version: `v${manifest.version}`, expectedMigration: schema.expectedMigration,
    checks: ['d1', 'schema', 'sessions', 'files', 'channelRoom', 'userInbox', 'scheduler', 'instanceBridge', 'voiceCall', 'telegramNotifications', 'environment'].map((id) => ({
      id, status: 'ok', code: 'ok', durationMs: 0, ...(id === 'schema' ? { schema } : {})
    })),
    environment: [{ name: 'EDGECHAT_ENCRYPTION_KEYRING', required: true, present: true }]
  };
}
