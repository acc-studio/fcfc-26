/* FCFC '26 service worker — web push only.
 * Receives pushes sent by scripts/notify.ts (web-push / VAPID) and shows them;
 * a tap focuses an open tab or opens the app. No offline/caching logic. */

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = data.title || "FCFC '26";
  const options = {
    body: data.body || '',
    icon: data.icon || '/icon',
    badge: data.badge || '/icon',
    tag: data.tag,            // same tag collapses/replaces an earlier notification
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        // Focus an already-open FCFC tab rather than opening a duplicate.
        if ('focus' in client) { client.focus(); return; }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});

// Take control promptly so the first subscribe works without a reload.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
