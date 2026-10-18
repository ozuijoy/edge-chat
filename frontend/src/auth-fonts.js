// 字体独立请求，避免 Google Fonts 不可达时阻断页面 CSS 预加载和登录/注册。
export function loadAuthFonts() {
  if (document.getElementById('edgechat-auth-fonts')) return;
  const link = document.createElement('link');
  link.id = 'edgechat-auth-fonts';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Great+Vibes&family=Dancing+Script:wght@500;700&display=swap';
  document.head.appendChild(link);
}
