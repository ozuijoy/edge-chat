import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { compileScript, parse } from '@vue/compiler-sfc';
import { computed, reactive, ref } from 'vue';
import { applySiteMetadata } from '../frontend/src/site-metadata.js';

function iconDocument() {
  const links = [];
  const createElement = () => ({
    attributes: {},
    getAttribute(name) { return this.attributes[name] ?? null; },
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
  });
  const html = readFileSync(new URL('../frontend/index.html', import.meta.url), 'utf8');
  for (const match of html.matchAll(/<link\s+([^>]+)>/g)) {
    const link = createElement();
    for (const attribute of match[1].matchAll(/([\w-]+)="([^"]*)"/g)) link.setAttribute(attribute[1], attribute[2]);
    links.push(link);
  }
  return {
    links, createElement,
    head: { appendChild(link) { links.push(link); } },
    querySelectorAll(selector) {
      const rel = selector.match(/rel~="([^"]+)"/)[1];
      return links.filter(link => link.getAttribute('rel')?.split(' ').includes(rel));
    },
  };
}

test('真實 HTML 中所有瀏覽器與觸屏圖標同步切換，清除後恢復原格式與尺寸', () => {
  const previous = globalThis.document;
  const document = iconDocument();
  globalThis.document = document;
  try {
    const defaults = document.links.map(link => ({ ...link.attributes }));
    for (const icon of ['/files/1%2Ficon.png', 'https://cdn.example/new.ico']) {
      applySiteMetadata({ siteName: ' New name ', siteIconUrl: icon });
      assert.equal(document.title, 'New name');
      const icons = document.links.filter(link => link.getAttribute('rel').includes('icon'));
      assert.equal(icons.length, 4);
      for (const link of icons) {
        assert.equal(link.getAttribute('href'), icon);
        assert.equal(link.getAttribute('type'), null);
        assert.equal(link.getAttribute('sizes'), null);
      }
    }
    applySiteMetadata({ siteIconUrl: '' });
    assert.equal(document.title, 'Edgechat');
    assert.deepEqual(document.links.map(link => link.attributes), defaults);
  } finally { globalThis.document = previous; }
});

test('無默認圖標聲明時創建圖標，重複更新不會增加候選數量', () => {
  const previous = globalThis.document;
  const document = iconDocument();
  document.links.length = 0;
  globalThis.document = document;
  try {
    applySiteMetadata({ siteIconUrl: '/custom.png' });
    applySiteMetadata({ siteIconUrl: '/other.png' });
    assert.equal(document.links.length, 2);
    applySiteMetadata({});
    assert.deepEqual(document.links.map(link => link.getAttribute('href')), ['/logo.svg', '/icon-192.png']);
  } finally { globalThis.document = previous; }
});

const { descriptor } = parse(readFileSync(new URL('../frontend/src/components/admin/AdminSiteAppearance.vue', import.meta.url), 'utf8'));
const { scriptSetupAst } = compileScript(descriptor, { id: 'site-appearance-test' });
const setupSource = scriptSetupAst.filter(node => node.type !== 'ImportDeclaration')
  .map(node => descriptor.scriptSetup.content.slice(node.start, node.end)).join('\n');

function appearancePage(overrides = {}) {
  const saved = [];
  const state = runInNewContext(`${setupSource}\n({ siteForm, busy, iconPreviewUrl, uploadSiteIcon, saveSiteSettings, loadSiteSettings });`, {
    computed, reactive, ref, onMounted() {},
    resolveServerAssetUrl: value => value,
    store: { setSite() {} },
    api: {
      getFileUrl: url => `${url}?token=preview-token`,
      async updateAdminSiteSettings(form) {
        saved.push({ ...form });
        return { site: { ...form } };
      },
      ...overrides,
    },
  });
  return { ...state, saved };
}

test('上傳期間不能保存舊圖標，完成後預覽帶認證而保存 URL 不含 token', async () => {
  let finishUpload;
  const state = appearancePage({ uploadFile: () => new Promise(resolve => { finishUpload = resolve; }) });
  const event = { target: { files: [{ name: 'icon.png' }], value: 'selected' } };
  const pending = state.uploadSiteIcon(event);
  assert.equal(state.busy.value, true);
  await state.saveSiteSettings();
  await state.loadSiteSettings();
  assert.equal(state.saved.length, 0);
  finishUpload({ file: { url: '/files/1%2Ficon.png' } });
  await pending;
  assert.equal(state.busy.value, false);
  assert.equal(event.target.value, '');
  assert.equal(state.iconPreviewUrl.value, '/files/1%2Ficon.png?token=preview-token');
  await state.saveSiteSettings();
  assert.equal(state.saved[0].siteIconUrl, '/files/1%2Ficon.png');
  state.siteForm.siteIconUrl = 'https://cdn.example/icon.png';
  assert.equal(state.iconPreviewUrl.value, 'https://cdn.example/icon.png');
  assert.match(descriptor.template.content, /:src="iconPreviewUrl"/);
  assert.match(descriptor.template.content, /:disabled="busy" @click="saveSiteSettings"/);
});
