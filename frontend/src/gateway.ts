// Worker 只在已認證的文檔中注入元數據，普通部署、demo 與原生客戶端保留既有路徑。
export const hasDocumentSession = typeof document !== 'undefined'
  && document.querySelector('meta[name="app-session"]')?.getAttribute('content') === '1';
export const apiPrefix = typeof document === 'undefined' ? '/api'
  : document.querySelector('meta[name="app-path"]')?.getAttribute('content') || '/api';
export const isGatewayMode = apiPrefix !== '/api';
