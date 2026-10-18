import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import initSqlJs from 'sql.js';
import { collectSchemaArtifacts } from '../../worker/src/maintenance/schema-contract.ts';
import { D1_MIGRATIONS, D1_RETIRED_MIGRATIONS } from './d1-migration-manifest.mjs';
import { migrationChecksums } from './d1-migration-plan.mjs';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

export async function generateSchemaManifest() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  try {
    const schema = read('worker/schema.sql').replaceAll('\r\n', '\n').replaceAll('\r', '\n');
    // 使用真实 SQLite 执行完整 schema，避免正则解析 DDL，也不额外维护表/列/索引清单。
    db.exec(schema);
    const artifacts = await collectSchemaArtifacts(async (sql) => {
      const result = db.exec(sql)[0];
      return result ? result.values.map((values) => Object.fromEntries(result.columns.map((column, index) => [column, values[index]]))) : [];
    });
    return {
      version: JSON.parse(read('package.json')).version,
      schemaHash: createHash('sha256').update(schema).digest('hex'),
      artifacts: [...artifacts].sort(),
      retiredMigrations: D1_RETIRED_MIGRATIONS,
      migrations: D1_MIGRATIONS.map((migration) => {
        const checksums = migrationChecksums(read(migration.file));
        return { id: migration.id, checksum: checksums.current, compatibleChecksums: [...checksums.compatible].sort() };
      })
    };
  } finally {
    db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifest = await generateSchemaManifest();
  mkdirSync(new URL('worker/src/generated/', root), { recursive: true });
  writeFileSync(new URL('worker/src/generated/schema-manifest.json', root), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Schema manifest: ${manifest.artifacts.length} artifacts, ${manifest.migrations.at(-1).id}`);
}
