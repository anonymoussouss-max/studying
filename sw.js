// Keeps the desk opening without internet. The page checks for a new version first; the art rarely changes.
const CACHE = 'kaguya-desk-2735893';
const FILES = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png'].concat(["art/duo-pet.webp","art/iroha-desk.webp","art/iroha-idle.webp","art/iroha-stern.webp","art/iroha-stern2.webp","art/iroha-study.webp","art/kaguya-annoyed.webp","art/kaguya-idle.webp","art/kaguya-late.webp","art/kaguya-look.webp","art/kaguya-p-idle.webp","art/kaguya-p-look.webp","art/kaguya-p-talk.webp"]);

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
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(w => w.length ? w[0].focus() : self.clients.openWindow('./')));
});
