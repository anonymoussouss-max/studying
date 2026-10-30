// Keeps the desk opening without internet. The page checks for a new version first; the art rarely changes.
const CACHE = 'kaguya-desk-2784369';
const FILES = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png'].concat(["duo-pet.webp","iroha-desk.webp","iroha-idle.webp","iroha-stern.webp","iroha-stern2.webp","iroha-study.webp","kaguya-annoyed.webp","kaguya-idle.webp","kaguya-late.webp","kaguya-look.webp","kaguya-p-idle.webp","kaguya-p-look.webp","kaguya-p-talk.webp"]);

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // the AI and sync always go straight to the backend
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put('index.html', copy)); return r; }).catch(() => caches.match('index.html')));
    return;
  }
  // the question bank is cached the first time it's used
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r.ok && url.pathname.endsWith('.json')) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; })));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(w => w.length ? w[0].focus() : self.clients.openWindow('./')));
});
