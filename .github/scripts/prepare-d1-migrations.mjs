#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { D1_MIGRATIONS } from "./d1-migration-manifest.mjs";
import { buildD1MigrationPlan } from "./d1-migration-plan.mjs";
import { D1_REPAIRS } from "./d1-repair-manifest.mjs";
import { collectSchemaArtifacts, collectAppliedMigrations, inspectSchema, schemaTables } from "../../worker/src/maintenance/schema-contract.ts";
import { generateSchemaManifest } from "./generate-schema-manifest.mjs";
import { verifyAdminBootstrap } from "./generate-admin-bootstrap-sql.mjs";

const API_BASE_URL = "https://api.cloudflare.com/client/v4";
const OUTPUT_PATH = ".tmp/edgechat-d1-migrations.sql";
const requiredEnv = [
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "EDGECHAT_D1_DATABASE_ID",
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const databaseId = process.env.EDGECHAT_D1_DATABASE_ID;
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function extractApiError(payload, fallback) {
  if (!payload || !Array.isArray(payload.errors) || payload.errors.length === 0) {
    return fallback;
  }
  return payload.errors.map((error) => `${error.code}: ${error.message}`).join("; ");
}

async function queryD1(sql) {
  const response = await fetch(
    `${API_BASE_URL}/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql }),
    },
  );
  const payload = await response.json();
  if (!response.ok || payload?.success === false) {
    throw new Error(extractApiError(payload, `Cloudflare D1 query failed with ${response.status}`));
  }
  return payload.result?.[0]?.results ?? [];
}

async function main() {
  if (process.argv.includes("--verify-admin")) {
    await verifyAdminBootstrap(queryD1);
    console.log("Active super administrator verified.");
    return;
  }
  const manifest = await generateSchemaManifest();
  if (process.argv.includes("--verify")) {
    const result = await inspectSchema(queryD1, manifest);
    if (result.status !== "ok") {
      throw new Error(`D1 schema verification failed: ${JSON.stringify(result)}`);
    }
    console.log(`D1 schema verified: ${result.expectedMigration}`);
    return;
  }
  // D1 的内部表可出现在 sqlite_master，但不允许读取列；只查询应用 manifest 中的表。
  const artifacts = await collectSchemaArtifacts(queryD1, schemaTables(manifest));
  const appliedMigrations = await collectAppliedMigrations(queryD1, artifacts);
  const plan = await buildD1MigrationPlan({
    migrations: D1_MIGRATIONS,
    repairs: D1_REPAIRS,
    appliedMigrations,
    artifacts,
    readSql(file) {
      return readFileSync(resolve(repositoryRoot, file), "utf8");
    },
  });
  const outputFile = resolve(repositoryRoot, OUTPUT_PATH);
  mkdirSync(dirname(outputFile), { recursive: true });
  writeFileSync(outputFile, plan.sql, "utf8");

  for (const decision of plan.decisions) {
    console.log(`[d1-migration] ${decision.id}: ${decision.action}`);
  }
  console.log(`D1 migration plan written to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
