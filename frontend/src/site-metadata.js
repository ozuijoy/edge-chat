import { resolveServerAssetUrl } from './capacitor-platform.ts';

const defaultIconAttributes = new WeakMap();

export function applySiteMetadata(site) {
  document.title = String(site?.siteName || 'Edgechat').trim() || 'Edgechat';
  const siteIconUrl = String(site?.siteIconUrl || '').trim();

  for (const [rel, fallback] of [['icon', '/logo.svg'], ['apple-touch-icon', '/icon-192.png']]) {
    let links = [...document.querySelectorAll(`link[rel~="${rel}"]`)];
    if (!links.length) {
      const link = document.createElement('link');
      link.setAttribute('rel', rel);
      link.setAttribute('href', fallback);
      document.head.appendChild(link);
      links = [link];
    }
    for (const link of links) {
      if (!defaultIconAttributes.has(link)) {
        defaultIconAttributes.set(link, Object.fromEntries(
          ['href', 'type', 'sizes'].map(name => [name, link.getAttribute(name)])
        ));
      }
      const attributes = siteIconUrl
        ? { href: resolveServerAssetUrl(siteIconUrl), type: null, sizes: null }
        : defaultIconAttributes.get(link);
      // 所有候选图标必须同步，且不能把上传的 PNG/ICO 继续声明为 SVG。
      for (const [name, value] of Object.entries(attributes)) {
        if (value === null) link.removeAttribute(name);
        else link.setAttribute(name, value);
      }
    }
  }
}
