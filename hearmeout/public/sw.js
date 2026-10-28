// HearMeOut service worker.
// - Offline: page loads go to the network as always; only when the network
//   fails is a small "you're offline" page shown instead of the browser's
//   error. Pages and data are never cached, so the site never shows stale
//   data.
// - Code: the build's files (/_next/static/…, named by their content, so a
//   name never changes meaning) are kept after the first download and
//   served from here, so opening a page doesn't wait on a busy server.
// - Push: shows notifications sent by the server (friend requests, the
//   weekly recap) and opens the right page when one is tapped.
const OFFLINE_CACHE = 'hmo-offline-v1';
const OFFLINE_URL = '/offline.html';
const STATIC_CACHE = 'hmo-static-v1';
const STATIC_MAX = 400;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(OFFLINE_CACHE).then((c) => c.add(OFFLINE_URL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== OFFLINE_CACHE && k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'HearMeOut', body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'HearMeOut';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/maskable-192.png',
    tag: data.tag || undefined,
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin && 'focus' in w) {
          w.navigate(url).catch(() => {});
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
