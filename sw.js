const CACHE = 'hcroutes-v4';
const ASSETS = ['/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png', '/icon.svg'];

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
      }).catch(() => cached || caches.match('/index.html'));
      return cached || net;
    })
  );
});

self.addEventListener('push', e => {
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch(x) {}
  e.waitUntil(
    self.registration.showNotification(data.title || 'HC Routes', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png'
    })
  );
});
