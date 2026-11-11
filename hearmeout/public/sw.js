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
const STATIC_CACHE = 'hmo-static-v2';
const STATIC_MAX = 48;
const STATIC_MAX_BYTES = 8 * 1024 * 1024;
const STATIC_ASSET_MAX = 1024 * 1024;
let staticSizes = null;
let staticWrites = Promise.resolve();

function isStaticAsset(url) {
  return url.origin === self.location.origin && url.pathname.startsWith('/_next/static/') &&
    /\.(?:js|css|woff2?|ttf|otf)$/.test(url.pathname);
}

// Only public, immutable build files belong here. In particular, a proxy's
// HTML error/login answer must never become a cached script.
function canStoreStatic(response) {
  const control = response.headers.get('cache-control') || '';
  const type = response.headers.get('content-type') || '';
  return response.status === 200 && !response.redirected &&
    /\bimmutable\b/i.test(control) && !/\b(?:private|no-store)\b/i.test(control) &&
    /^(?:text\/(?:css|javascript)|application\/(?:javascript|x-javascript|font-woff|octet-stream)|font\/)/i.test(type) &&
    Number(response.headers.get('content-length') || 0) <= STATIC_ASSET_MAX;
}

function rememberStatic(request, response) {
  if (!canStoreStatic(response)) return Promise.resolve();
  const copy = response.clone();
  // Writes and eviction share one queue, including concurrent lazy chunks.
  // Keep the original response (headers/body) and count decoded bytes in
  // the background, without delaying the page's response.
  staticWrites = staticWrites.then(async () => {
    const bytes = (await copy.arrayBuffer()).byteLength;
    if (bytes > STATIC_ASSET_MAX) return;
    const cache = await caches.open(STATIC_CACHE);
    if (!staticSizes) {
      staticSizes = new Map();
      for (const key of await cache.keys()) {
        const saved = await cache.match(key);
        if (saved) staticSizes.set(key.url, (await saved.arrayBuffer()).byteLength);
      }
    }
    if (staticSizes.has(request.url)) return;
    let total = [...staticSizes.values()].reduce((sum, size) => sum + size, 0);
    while (staticSizes.size >= STATIC_MAX || total + bytes > STATIC_MAX_BYTES) {
      const oldest = staticSizes.entries().next().value;
      if (!oldest) break;
      await cache.delete(oldest[0]);
      staticSizes.delete(oldest[0]);
      total -= oldest[1];
    }
    await cache.put(request, response);
    staticSizes.set(request.url, bytes);
  }).catch(() => { staticSizes = null; }); // Storage may be full or disabled.
  return staticWrites;
}

async function matchStatic(request) {
  try { return await (await caches.open(STATIC_CACHE)).match(request); } catch { return undefined; }
}

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
  const request = event.request;
  if (request.method !== 'GET') return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }
  if (request.headers.has('range') || !isStaticAsset(new URL(request.url))) return;
  event.respondWith((async () => {
    const hit = await matchStatic(request);
    if (hit) return hit;
    const response = await fetch(request);
    event.waitUntil(rememberStatic(request, response.clone()));
    return response;
  })());
});

// The first visit loaded its scripts before this worker took control.
// After load/idle, the page sends only the assets it actually used. HTTP
// cache supplies those copies; no screens, APIs or entire site are fetched.
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'WARM_STATIC' || !Array.isArray(event.data.urls)) return;
  const source = event.source;
  if (!source || source.type !== 'window' || new URL(source.url).origin !== self.location.origin) return;
  event.waitUntil((async () => {
    const urls = [...new Set(event.data.urls.filter((url) => typeof url === 'string'))].slice(0, STATIC_MAX);
    for (const value of urls) {
      try {
        const url = new URL(value, self.location.origin);
        if (!isStaticAsset(url)) continue;
        const request = new Request(url, { credentials: 'omit', cache: 'force-cache' });
        if (await matchStatic(request)) continue;
        await rememberStatic(request, await fetch(request));
      } catch { /* Warming is optional; a single failed asset stops nothing. */ }
    }
  })());
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
