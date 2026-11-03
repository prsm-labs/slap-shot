// 2026-11-02 (user): 📦 offline snapshot. Registered only after a viewer taps "Save for offline" (src/lib/offline.js), so nobody
// else is touched. Online, every request goes to the network as before -- the saved copy is never refreshed behind the viewer's
// back, so its time stamp stays true. Only when the network fails does the page / data come from the copy, and the page is told
// so it can show the "Offline snapshot" banner. /api/ (live scores, lineups, injuries) is never cached. Same file in CourtIQ,
// Slap Shot, Six Points and Final Lap.
const CACHE = 'degen-offline-v1'
let servedFromCache = false

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
self.addEventListener('message', (e) => {
  if (e.data?.type === 'offline-status') e.source?.postMessage({ type: 'offline-status', fromCache: servedFromCache })
})

async function tell() {
  for (const c of await self.clients.matchAll({ includeUncontrolled: true })) c.postMessage({ type: 'offline-status', fromCache: true })
}
const withTimeout = (p, ms) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('timeout')), ms)
  p.then((v) => { clearTimeout(t); resolve(v) }, (err) => { clearTimeout(t); reject(err) })
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return
  e.respondWith(handle(req, url))
})

async function handle(req, url) {
  const cache = await caches.open(CACHE)
  const nav = req.mode === 'navigate'
  // hashed build files never change, so the saved one is as good as the network's
  if (url.pathname.startsWith('/assets/')) {
    const hit = await cache.match(url.pathname)
    if (hit) return hit
  }
  try {
    const res = await (nav ? withTimeout(fetch(req), 8000) : fetch(req))
    if (nav) servedFromCache = false
    return res
  } catch (err) {
    const hit = await cache.match(nav ? '/' : url.pathname, { ignoreSearch: true })
    if (hit) {
      if (nav || url.pathname.startsWith('/data/')) { servedFromCache = true; tell() }
      return hit
    }
    return Response.error()
  }
}
