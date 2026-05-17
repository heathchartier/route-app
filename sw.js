const CACHE = 'hcroutes-v12';
const ASSETS = [
  '/route-app/', '/route-app/index.html', '/route-app/manifest.json',
  '/route-app/apple-touch-icon.png', '/route-app/icon-180.png',
  '/route-app/icon-192.png', '/route-app/icon-512.png', '/route-app/icon.svg'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      var net = fetch(e.request).then(res => {
        if (res && res.status === 200 && e.request.url.startsWith(self.location.origin)) {
          var clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});

self.addEventListener('push', e => {
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch(x) {}
  e.waitUntil(
    self.registration.showNotification(data.title || 'FieldIQ', {
      body: data.body || '',
      icon: '/route-app/icon-192.png',
      badge: '/route-app/icon-192.png',
      title: data.title || 'FieldIQ'
    })
  );
});
