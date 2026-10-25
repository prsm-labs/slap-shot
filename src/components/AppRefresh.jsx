import { useState } from 'react'
import './AppRefresh.css'

// 2026-10-25 (user: an "app refresh" button in every header -- better than a page refresh because it refreshes the data and
// the page). Clears this site's Cache Storage, asks any service worker to update, then reloads with a one-time ?refresh=
// stamp so the page itself is fetched fresh (data files are re-checked with the server on every load anyway). Works inside
// a home-screen app, where there is no browser reload button. Same file in CourtIQ, Slap Shot, Six Points and Final Lap.
try {
  const u = new URL(window.location.href)
  if (u.searchParams.has('refresh')) { u.searchParams.delete('refresh'); window.history.replaceState(null, '', u.pathname + u.search + u.hash) }
} catch { /* old browser: the stamp just stays in the address */ }

export default function AppRefresh() {
  const [busy, setBusy] = useState(false)
  const go = async () => {
    if (busy) return
    setBusy(true)
    try { if (window.caches) for (const k of await window.caches.keys()) await window.caches.delete(k) } catch { /* none */ }
    try { for (const r of (await navigator.serviceWorker?.getRegistrations?.()) || []) await r.update() } catch { /* none */ }
    const u = new URL(window.location.href)
    u.searchParams.set('refresh', Date.now().toString(36))
    window.location.replace(u.toString())
  }
  return (
    <button type="button" className={`app-refresh ${busy ? 'busy' : ''}`} onClick={go} disabled={busy}
      title="Refresh the app — reloads the page and pulls the latest data" aria-label="Refresh the app">
      <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 11a8 8 0 1 0-2.3 5.7" />
        <path d="M20 4v7h-7" />
      </svg>
    </button>
  )
}
