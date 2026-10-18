// 字體獨立請求，避免 Google Fonts 不可達時阻斷頁面 CSS 預加載和登錄/註冊。
export function loadAuthFonts() {
  if (document.getElementById('edgechat-auth-fonts')) return;
  const link = document.createElement('link');
  link.id = 'edgechat-auth-fonts';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Great+Vibes&family=Dancing+Script:wght@500;700&display=swap';
  document.head.appendChild(link);
}
