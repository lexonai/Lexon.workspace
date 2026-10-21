// Minimal service worker: makes the app installable and caches only static build assets.
// API/auth/data requests are never cached, so nothing private is stored offline.
const CACHE = 'lexon-static-v1'
self.addEventListener('install', e => { self.skipWaiting() })
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()) })
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url)
  if (e.request.method !== 'GET' || u.origin !== location.origin || !u.pathname.includes('/assets/')) return
  e.respondWith(caches.open(CACHE).then(async c => { const hit = await c.match(e.request); if (hit) return hit; const res = await fetch(e.request); c.put(e.request, res.clone()); return res }))
})
