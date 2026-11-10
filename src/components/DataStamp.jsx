// 2026-11-10 (user: add a time stamp at the bottom of each app showing when its data was last updated). Shared file -- same in
// CourtIQ, Slap Shot, Six Points and Final Lap. Reads the pipeline's own stamp from the app's main data file (no build time):
// ISO with a zone -> shown in Eastern; "YYYY-MM-DD HH:MM" / "YYYY-MM-DDTHH:MM" without a zone = already Eastern (Slap Shot, Final Lap).
// Re-checks every 10 minutes and when the app is shown again.
import { useEffect, useState } from 'react'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const hm = (h, m) => `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`

export function formatStamp(s) {
  if (!s) return null
  const t = String(s).trim()
  const local = t.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/)
  if (local) {
    const [, y, mo, d, h, mi] = local.map(Number)
    const wd = DAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()]
    return `${wd} ${mo}/${d}, ${hm(h, mi)} ET`
  }
  const dt = new Date(t)
  if (Number.isNaN(dt.getTime())) return null
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'short', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: false,
  }).formatToParts(dt).map((x) => [x.type, x.value]))
  return `${p.weekday} ${p.month}/${p.day}, ${hm(Number(p.hour) % 24, Number(p.minute))} ET`
}

export default function DataStamp({ url, pick, label = 'Data updated' }) {
  const [txt, setTxt] = useState(null)
  useEffect(() => {
    let dead = false
    const load = () => fetch(url, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!dead && d) setTxt(formatStamp(pick(d))) })
      .catch(() => {})
    load()
    const id = setInterval(load, 10 * 60 * 1000)
    const vis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', vis)
    return () => { dead = true; clearInterval(id); document.removeEventListener('visibilitychange', vis) }
  }, [url])
  if (!txt) return null
  return <span className="data-stamp">{label} {txt}</span>
}
