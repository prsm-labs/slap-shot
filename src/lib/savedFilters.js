import { useSyncExternalStore } from 'react'

// 2026-10-28 (user: alerts -- "tell me when a player matches my filter"). Same file in CourtIQ, Slap Shot and Six Points.
// ⚙ Filters -> "🔔 Alert me" saves the panel's current filter (plus the header team / position it was set under). Each
// app's alert runner re-checks every saved filter whenever its slate loads or refreshes (check below): the first check
// of a night / week sends one summary ("4 players match today"), after that each player who newly matches gets an
// alert. Saving a filter records who already matches without alerting. Kept in this browser only (localStorage).
const KEY = 'savedFilterAlerts'
let list = read()
const listeners = new Set()
function read() { try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] } }
function write(next) {
  list = next
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* private mode */ }
  listeners.forEach((l) => l())
}
export function useSavedFilters() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => list, () => list)
}
export function saveFilter(name, value, scope = {}) {
  const id = `f${Date.now().toString(36)}`
  write([...list, { id, name: name || 'My filter', value, scope, created: Date.now(), seen: {} }].slice(-12))
  return id
}
export function removeFilter(id) { write(list.filter((f) => f.id !== id)) }

// slateKey = the night / week the pool is for; matchesOf(filter) -> [{ id, name, player }]; push = the app's pushAlert
export function checkSavedFilters(slateKey, matchesOf, push) {
  if (!slateKey || !list.length) return
  let changed = false
  const next = list.map((f) => {
    const m = matchesOf(f)
    if (!m) return f
    const ids = m.map((x) => String(x.id))
    const seen = f.seen?.[slateKey]
    if (!seen) {
      // first look at this slate: silent if it was just saved, else one summary
      const justSaved = Date.now() - (f.created || 0) < 60000
      if (!justSaved && m.length) {
        push({ id: `sf-${f.id}-${slateKey}`, type: 'filter', title: `🔔 ${f.name}`,
          body: `${m.length} player${m.length === 1 ? '' : 's'} match: ${m.slice(0, 4).map((x) => x.name).join(', ')}${m.length > 4 ? '…' : ''}`, player: m[0].player })
      }
    } else {
      for (const x of m) {
        if (seen.includes(String(x.id))) continue
        push({ id: `sf-${f.id}-${slateKey}-${x.id}`, type: 'filter', title: `🔔 New match: ${x.name}`, body: f.name, player: x.player })
      }
    }
    const merged = [...new Set([...(seen || []), ...ids])]
    if (!seen || merged.length !== seen.length) changed = true
    // keep the last 3 slates' seen lists
    const keys = Object.keys(f.seen || {}).filter((k) => k !== slateKey).sort().slice(-2)
    return { ...f, seen: { ...Object.fromEntries(keys.map((k) => [k, f.seen[k]])), [slateKey]: merged } }
  })
  if (changed) write(next)
}
