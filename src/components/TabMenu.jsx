import { useEffect, useRef, useState } from 'react'
import './TabMenu.css'

// 2026-10-24 (user): the horizontally scrolling tab bar is now a ☰ button + the current page's name; tapping it slides out
// a menu with every page. Same component in CourtIQ, Slap Shot, Six Points and Final Lap (Going Yard keeps its own tabs).
export default function TabMenu({ tabs, tab, setTab }) {
  const [open, setOpen] = useState(false)
  const panel = useRef(null)
  const current = tabs.find((t) => t.key === tab) || tabs[0]

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.querySelector('.tm-item.active')?.focus()
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open])

  const pick = (key) => {
    setTab(key)
    setOpen(false)
    window.scrollTo({ top: 0 })
  }

  return (
    <>
      <div className="tm-bar">
        <button className="tm-toggle" aria-label="Open the page menu" aria-expanded={open} onClick={() => setOpen(true)}>
          <span className="tm-burger" aria-hidden="true"><i /><i /><i /></span>
          <span className="tm-current">{current.label}</span>
        </button>
      </div>
      <div className={`tm-backdrop${open ? ' open' : ''}`} onClick={() => setOpen(false)} aria-hidden="true" />
      <nav className={`tm-panel${open ? ' open' : ''}`} ref={panel} aria-label="Pages" aria-hidden={!open}>
        <div className="tm-head">
          <span>Menu</span>
          <button className="tm-close" aria-label="Close the menu" onClick={() => setOpen(false)}>✕</button>
        </div>
        <div className="tm-list">
          {tabs.map((t) => (
            <button key={t.key} className={`tm-item${t.key === current.key ? ' active' : ''}`} aria-current={t.key === current.key ? 'page' : undefined} onClick={() => pick(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </>
  )
}
