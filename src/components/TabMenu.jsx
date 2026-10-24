import { useEffect, useRef, useState } from 'react'
import './TabMenu.css'

// 2026-10-24 (user prototype): the scrolling tab bar is gone -- a ☰ button opens a slide-out menu with every page. It sits first in the
// row under the logo (☰ · date / week picker · team · search; NASCAR / F1 switch in Final Lap). Same component in CourtIQ, Slap Shot,
// Six Points and Final Lap (Going Yard keeps its own tabs).
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
      <button className="tm-toggle" aria-label={`Menu · ${current.label}`} title="Pages" aria-expanded={open} onClick={() => setOpen(true)}>
        <span className="tm-burger" aria-hidden="true"><i /><i /><i /></span>
      </button>
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
