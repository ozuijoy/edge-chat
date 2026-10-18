#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEncryptionKeyring } from '../../worker/src/encryption.js';

const API_BASE_URL = 'https://api.cloudflare.com/client/v4';
const KEYRING_SECRET_NAME = 'EDGECHAT_ENCRYPTION_KEYRING';
const ACTIVE_KEY_SECRET_NAME = 'EDGECHAT_ENCRYPTION_ACTIVE_KEY_ID';
const AUTO_KEY_SECRET_PATTERN = /^EDGECHAT_ENCRYPTION_KEY_(\d+)$/;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${String(value)}\n`);
  }
}

function apiError(payload, fallback) {
  if (!Array.isArray(payload?.errors) || payload.errors.length === 0) return fallback;
  return payload.errors.map((error) => `${error.code}: ${error.message}`).join('; ');
}

async function listWorkerSecrets({ accountId, apiToken, workerName }) {
  const response = await fetch(
    `${API_BASE_URL}/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(workerName)}/secrets`,
    { headers: { Authorization: `Bearer ${apiToken}` } }
  );
  const payload = await response.json().catch(() => null);
  if (response.status === 404) return [];
  if (!response.ok || payload?.success === false) {
    throw new Error(apiError(payload, `Cloudflare API returned ${response.status}`));
  }
  return Array.isArray(payload?.result) ? payload.result : [];
}

export function createKeyring() {
  return JSON.stringify({
    activeKeyId: 'v1',
    keys: { v1: randomBytes(32).toString('base64') }
  });
}

function createAutomaticKey(version) {
  return {
    keyId: `auto-v${version}`,
    bindingName: `EDGECHAT_ENCRYPTION_KEY_${version}`,
    encodedKey: randomBytes(32).toString('base64')
  };
}

function writeSecretsFile(secretsFile, secrets) {
  for (const value of Object.values(secrets)) {
    console.log(`::add-mask::${value}`);
  }
  mkdirSync(dirname(secretsFile), { recursive: true });
  writeFileSync(secretsFile, JSON.stringify(secrets), { mode: 0o600 });
}

export async function prepareWorkerEncryptionSecret({
  accountId,
  apiToken,
  workerName = 'cfchat',
  secretsFile = '.tmp/worker-secrets.json',
  suppliedKeyring = '',
  applySuppliedKeyring = false,
  rotateEncryptionKey = false
} = {}) {
  const secrets = await listWorkerSecrets({ accountId, apiToken, workerName });
  const secretNames = new Set(secrets.map((secret) => secret?.name).filter(Boolean));
  const automaticKeyVersions = [...secretNames]
    .map((name) => AUTO_KEY_SECRET_PATTERN.exec(name))
    .filter(Boolean)
    .map((match) => Number(match[1]));
  const encryptionConfigured =
    secretNames.has(KEYRING_SECRET_NAME) ||
    secretNames.has(ACTIVE_KEY_SECRET_NAME) ||
    automaticKeyVersions.length > 0;

  if (applySuppliedKeyring && rotateEncryptionKey) {
    throw new Error('Choose either manual keyring update or automatic key rotation, not both');
  }

  if (!applySuppliedKeyring && !rotateEncryptionKey && encryptionConfigured) {
    setOutput('action', 'preserved');
    console.log(`Encryption secrets already exist on ${workerName}; preserving them.`);
    return { action: 'preserved' };
  }

  if (applySuppliedKeyring && !suppliedKeyring) {
    throw new Error(
      'EDGECHAT_ENCRYPTION_KEYRING repository secret is required when applying a manual keyring'
    );
  }

  if (applySuppliedKeyring || (!encryptionConfigured && suppliedKeyring)) {
    // 手动更新必须提交完整密钥环；旧 key ID 留在 keys 中，历史密文才能继续解密。
    const keyring = loadEncryptionKeyring(suppliedKeyring);
    writeSecretsFile(secretsFile, {
      [KEYRING_SECRET_NAME]: suppliedKeyring,
      [ACTIVE_KEY_SECRET_NAME]: keyring.activeKeyId
    });
    const action = encryptionConfigured ? 'updated' : 'created';
    setOutput('action', action);
    setOutput('active_key_id', keyring.activeKeyId);
    console.log(`Manual encryption keyring will be ${action} with this deployment.`);
    return { action, activeKeyId: keyring.activeKeyId, secretsFile };
  }

  const nextVersion = automaticKeyVersions.length > 0 ? Math.max(...automaticKeyVersions) + 1 : 1;
  const automaticKey = createAutomaticKey(nextVersion);
  writeSecretsFile(secretsFile, {
    [ACTIVE_KEY_SECRET_NAME]: automaticKey.keyId,
    [automaticKey.bindingName]: automaticKey.encodedKey
  });

  const action = encryptionConfigured ? 'rotated' : 'created';
  setOutput('action', action);
  setOutput('active_key_id', automaticKey.keyId);
  console.log(`Automatic encryption key ${automaticKey.keyId} will be ${action} with this deployment.`);
  return { action, activeKeyId: automaticKey.keyId, secretsFile };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  prepareWorkerEncryptionSecret({
    accountId: requireEnv('CLOUDFLARE_ACCOUNT_ID'),
    apiToken: requireEnv('CLOUDFLARE_API_TOKEN'),
    workerName: process.env.EDGECHAT_WORKER_NAME || 'cfchat',
    secretsFile: process.env.EDGECHAT_SECRETS_FILE || '.tmp/worker-secrets.json',
    suppliedKeyring: process.env.EDGECHAT_ENCRYPTION_KEYRING || '',
    applySuppliedKeyring: process.env.EDGECHAT_APPLY_ENCRYPTION_KEYRING === 'true',
    rotateEncryptionKey: process.env.EDGECHAT_ROTATE_ENCRYPTION_KEY === 'true'
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
