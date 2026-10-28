import { useEffect, useState } from 'react'
import './ViewPicker.css'

// 2026-10-28 (user: too many view buttons on phones) -- one shared view picker, the same file in every PRISM Labs app.
// On a phone (640px or narrower) a row of 4+ views becomes a full-width dropdown showing the current view; on wider
// screens, and for short rows (Season / Last 5 ...), it stays the usual pill row. options = [[key, label, title?], ...].
const QUERY = '(max-width: 640px)'

function useNarrow() {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(QUERY).matches)
  useEffect(() => {
    const m = window.matchMedia?.(QUERY)
    if (!m) return undefined
    const on = () => setNarrow(m.matches)
    on()
    if (m.addEventListener) m.addEventListener('change', on); else m.addListener(on)
    return () => { if (m.removeEventListener) m.removeEventListener('change', on); else m.removeListener(on) }
  }, [])
  return narrow
}

export default function ViewPicker({ options, value, onChange, pillClass = 'pill', rowClass = 'pill-row', min = 4, label = 'View', style }) {
  const narrow = useNarrow()
  if (narrow && options.length >= min) {
    return (
      <label className="vp" style={style}>
        <span className="vp-label">{label}</span>
        <select className="vp-select" value={String(value)}
          onChange={(e) => { const o = options.find(([k]) => String(k) === e.target.value); if (o) onChange(o[0]) }}>
          {options.map(([k, l]) => <option key={String(k)} value={String(k)}>{typeof l === 'string' ? l : String(k)}</option>)}
        </select>
        <span className="vp-chev" aria-hidden="true">▾</span>
      </label>
    )
  }
  return (
    <div className={rowClass} style={style}>
      {options.map(([k, l, title]) => (
        <button key={String(k)} type="button" title={title} className={`${pillClass} ${value === k ? 'active' : ''}`} onClick={() => onChange(k)}>{l}</button>
      ))}
    </div>
  )
}
