// Edgechat minimal service worker.
// Purpose: satisfy the PWA installability requirement so Chrome/Edge show the
// install button in the address bar. It intentionally does NOT cache anything
// and does NOT intercept API, /files, or WebSocket traffic — every request is
// passed straight through to the network.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Never touch non-GET requests (PUT/POST/DELETE, WebSocket upgrades, etc.).
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Same-origin GET requests, including page navigations, pass through here;
  // API, uploads and cross-origin requests use the browser's default handling.
  if (url.origin !== self.location.origin) {
    return;
  }
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/files')) {
    return;
  }

  // Pass-through response; no caching, so nothing goes stale.
  event.respondWith(fetch(request));
});

// Focus (or open) the app when a system notification is clicked, and tell the
// page which room it belongs to so it can navigate there.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        const client = clientList.find((c) => 'focus' in c);
        if (client) {
          client.postMessage({ type: 'edgechat:notification-click', data });
          return client.focus();
        }
        const url = new URL('/', self.location.origin);
        if (data.roomKind && Number.isSafeInteger(Number(data.roomId)) && Number(data.roomId) > 0) {
          url.searchParams.set('notificationRoomKind', data.roomKind);
          url.searchParams.set('notificationRoomId', String(data.roomId));
        }
        return self.clients.openWindow(url.href);
      }),
  );
});
