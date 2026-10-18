import Bowser from 'bowser';

export function describeUserAgent(userAgent: string) {
  if (!userAgent) return { browser: '', system: '', model: '' };
  const parsed = Bowser.parse(userAgent);
  const androidModel = /Android[^;)]*;\s*(?:[a-z]{2}(?:[-_][A-Z]{2})?;\s*)?([^;)]+?)\s+Build\//.exec(userAgent)?.[1];
  // UA 缩减会把 Android 型号统一成 K，不能将这个占位符误报为真实设备。
  const model = parsed.platform.model || (androidModel && androidModel !== 'K' ? androidModel : '');
  return {
    browser: [parsed.browser.name, parsed.browser.version].filter(Boolean).join(' '),
    system: [parsed.os.name, parsed.os.version].filter(Boolean).join(' '),
    model,
  };
}
