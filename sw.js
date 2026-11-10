// code-beat service worker: always tries the network first so players get the newest game,
// and falls back to the last saved copy when offline.
const CACHE = 'code-beat-v3';
const CORE = ['./', './index.html', './icon.svg', './manifest.webmanifest', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !fonts) return; // server calls, music files and releases are never cached here

  // pages and version checks always go to the network first, skipping the browser cache
  const fresh = req.mode === 'navigate' || url.pathname.endsWith('version.json');
  e.respondWith(
    fetch(fresh ? req.url : req, fresh ? { cache: 'no-store', credentials: 'same-origin' } : undefined)
      .then((res) => {
        if (res.ok && (sameOrigin || fonts)) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});

// push notifications from the code-beat server
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: '코드 비트', body: e.data ? e.data.text() : '' }; }
  const title = d.title || '코드 비트';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || '', tag: d.tag || 'code-beat', renotify: true,
    icon: './icons/icon-192.png', badge: './icons/icon-192.png',
    data: { url: './' + (d.cat === 'update' ? '?from=push-update' : d.cat === 'social' ? '?from=push-inbox' : '?from=push') }
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if (c.url.startsWith(self.registration.scope) && 'focus' in c) { if (target.includes('push-update') && 'navigate' in c) c.navigate(target); return c.focus(); } }
    return self.clients.openWindow(target);
  }));
});
