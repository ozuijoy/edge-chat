import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';
import { analyzeFrontendBundle } from '../../frontend/bundle-analysis.js';

const root = fileURLToPath(new URL('../..', import.meta.url));
const result = await build({
  configFile: resolve(root, 'frontend/vite.config.js'),
  logLevel: 'silent',
  build: { write: false }
});
const analysis = analyzeFrontendBundle(result.output);
for (const [page, locales] of Object.entries(analysis.pages)) {
  for (const [locale, size] of Object.entries(locales)) {
    assert.ok(size.gzip <= 300_000, `${page} (${locale}) exceeds the 300 KB gzip target`);
  }
}
assert.ok(analysis.compiled.gzip <= 500_000, 'Compiled frontend exceeds 500 KB gzip');

async function directorySize(directory) {
  let raw = 0;
  let gzip = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    const size = entry.isDirectory()
      ? await directorySize(path)
      : await readFile(path).then((bytes) => ({ raw: bytes.length, gzip: gzipSync(bytes).length }));
    raw += size.raw;
    gzip += size.gzip;
  }
  return { raw, gzip };
}
const publicAssets = await directorySize(resolve(root, 'frontend/public'));
console.log(JSON.stringify({
  unit: 'bytes; gzip per file, excludes HTTP headers/API responses/user uploads',
  firstScreen: analysis.pages,
  compiledAllFeatures: analysis.compiled,
  publicAssets,
  completeIncludingSelfHostedEditor: {
    raw: analysis.compiled.raw + publicAssets.raw,
    gzip: analysis.compiled.gzip + publicAssets.gzip
  },
  note: 'The 500 KB budget applies to compiled JS/CSS/HTML. The preserved on-demand Lute editor runtime alone exceeds 500 KB gzip.'
}, null, 2));
