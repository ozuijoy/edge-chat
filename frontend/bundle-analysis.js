import { gzipSync } from 'node:zlib';

// 首屏只遍歷靜態依賴，動態頁面、彈窗與語言包應在實際使用時下載。
export function analyzeFrontendBundle(output) {
  const files = new Map(output.map((file) => [file.fileName, file]));
  const entry = output.find((file) => file.type === 'chunk' && file.isEntry);
  if (!entry) throw new Error('Missing frontend entry chunk');

  function closure(roots) {
    const visited = new Set();
    function visit(name) {
      if (visited.has(name)) return;
      const file = files.get(name);
      if (!file) throw new Error(`Missing build output: ${name}`);
      visited.add(name);
      if (file.type === 'chunk') {
        file.imports.forEach(visit);
        file.viteMetadata?.importedCss.forEach(visit);
      }
    }
    roots.forEach(visit);
    return visited;
  }

  function chunkFor(source) {
    const file = output.find((file) => file.type === 'chunk' && file.facadeModuleId?.endsWith(source));
    if (!file) throw new Error(`Missing chunk for ${source}`);
    return file.fileName;
  }

  function size(names) {
    let raw = 0;
    let gzip = 0;
    for (const name of names) {
      const file = files.get(name);
      const bytes = Buffer.from(file.type === 'chunk' ? file.code : file.source);
      raw += bytes.length;
      gzip += gzipSync(bytes).length;
    }
    return { raw, gzip, files: names.size };
  }

  function modules(names) {
    return [...names].flatMap((name) => Object.keys(files.get(name).modules || {}));
  }

  const localeSources = ['/src/locales/zh-TW.js', '/src/locales/en-US.js'];
  function pageFiles(page, locale) {
    const roots = [entry.fileName, 'index.html', chunkFor(`/src/pages/${page}.vue`), chunkFor(locale)];
    // 後臺子路由還會加載外殼；一起計量，防止公共後臺樣式逃出首屏預算。
    if (page.startsWith('Admin')) roots.push(chunkFor('/src/pages/AdminPage.vue'));
    return closure(roots);
  }
  const pages = Object.fromEntries(['LoginPage', 'ChatPage', 'AdminDashboardPage', 'AdminUsersPage'].map((page) => [
    page,
    Object.fromEntries(localeSources.map((locale) => [locale.split('/').at(-1).slice(0, -3), size(pageFiles(page, locale))]))
  ]));
  const all = new Set(files.keys());
  // 編譯產物包含全部語言和編輯器分包；public 內的自託管 Lute 由 CLI 單獨報告，避免混淆預算。
  return { pages, compiled: size(all), closure, chunkFor, pageFiles, modules, size, files };
}
