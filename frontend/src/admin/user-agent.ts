import Bowser from 'bowser';

export function describeUserAgent(userAgent: string) {
  if (!userAgent) return { browser: '', system: '', model: '' };
  const parsed = Bowser.parse(userAgent);
  const androidModel = /Android[^;)]*;\s*(?:[a-z]{2}(?:[-_][A-Z]{2})?;\s*)?([^;)]+?)\s+Build\//.exec(userAgent)?.[1];
  // UA 縮減會把 Android 型號統一成 K，不能將這個佔位符誤報為真實設備。
  const model = parsed.platform.model || (androidModel && androidModel !== 'K' ? androidModel : '');
  return {
    browser: [parsed.browser.name, parsed.browser.version].filter(Boolean).join(' '),
    system: [parsed.os.name, parsed.os.version].filter(Boolean).join(' '),
    model,
  };
}
