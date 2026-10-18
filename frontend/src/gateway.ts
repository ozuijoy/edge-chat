// Worker 只在已认证的文档中注入元数据，普通部署、demo 与原生客户端保留既有路径。
export const hasDocumentSession = typeof document !== 'undefined'
  && document.querySelector('meta[name="app-session"]')?.getAttribute('content') === '1';
export const apiPrefix = typeof document === 'undefined' ? '/api'
  : document.querySelector('meta[name="app-path"]')?.getAttribute('content') || '/api';
export const isGatewayMode = apiPrefix !== '/api';
