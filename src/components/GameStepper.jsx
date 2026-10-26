import { useEffect, useRef, useState } from 'react'
import './GameStepper.css'

// ◀ ▶ Game stepper (2026-10-26, user: switch matchup to matchup on big slates without tapping the cards each time). Same file
// in CourtIQ, Slap Shot and Six Points, under each app's game strip:
//  - a slim bar while ONE game is picked: ◀ previous · "3 / 14 · DAL @ PHI" · next ▶ (same order as the strip)
//  - keyboard ← / → anywhere (not while typing; from "All games" → starts at the first game, ← at the last)
//  - touch: swipe left = next game, right = previous, while one game is picked. Ignored when the swipe starts on
//    something that scrolls sideways (tables, the strip itself), a form field, an open menu / slideout / dialog, or the
//    screen edge (the phone's own back gesture).
// A short toast names the new game, since the strip may be scrolled out of view. No wrap-around at either end.

const SKIP = 'input, textarea, select, [contenteditable="true"], [role="dialog"], [class*="slide"], [class*="modal"], [class*="tm-panel"], [class*="tm-backdrop"]'
// an open player / team slideout, the page menu or a notice: arrows and swipes belong to it, not the strip
const OVERLAY = '.slide-panel.open, aside.slide, .slideout-panel, .tm-panel.open, .early-overlay, [role="dialog"]'

function scrollsSideways(el) {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (n.scrollWidth > n.clientWidth + 2) {
      const ox = getComputedStyle(n).overflowX
      if (ox === 'auto' || ox === 'scroll') return true
    }
  }
  return false
}

export default function GameStepper({ items, index, onPick, activeSelector }) {
  const [toast, setToast] = useState(null)
  const state = useRef({})
  Object.assign(state.current, { items, index, onPick })

  useEffect(() => {
    let timer = null
    const go = (step, from) => {
      const { items: list, index: i, onPick: pick } = state.current
      if (!list.length) return
      const next = i < 0 ? (step > 0 ? 0 : list.length - 1) : i + step
      if (next < 0 || next >= list.length) return
      pick(list[next].key)
      if (from !== 'button') {
        setToast(`${next + 1} / ${list.length} · ${list[next].label}`)
        clearTimeout(timer)
        timer = setTimeout(() => setToast(null), 1400)
      }
      // keep the picked card in view inside the strip without moving the page
      requestAnimationFrame(() => {
        const el = activeSelector && document.querySelector(activeSelector)
        const row = el?.parentElement
        if (el && row && row.scrollWidth > row.clientWidth) row.scrollTo({ left: el.offsetLeft - row.offsetLeft - row.clientWidth / 2 + el.clientWidth / 2, behavior: 'smooth' })
      })
    }
    state.current.go = go
    const onKey = (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.target?.closest?.(SKIP) || document.querySelector(OVERLAY)) return
      e.preventDefault()
      go(e.key === 'ArrowRight' ? 1 : -1, 'key')
    }
    let start = null
    const onStart = (e) => {
      const t = e.touches[0]
      start = e.touches.length === 1 && state.current.index >= 0 && t.clientX > 24 && t.clientX < innerWidth - 24
        && !e.target.closest?.(SKIP) && !document.querySelector(OVERLAY) && !scrollsSideways(e.target) ? { x: t.clientX, y: t.clientY, at: Date.now() } : null
    }
    const onEnd = (e) => {
      if (!start) return
      const t = e.changedTouches[0], dx = t.clientX - start.x, dy = t.clientY - start.y
      const ok = Math.abs(dx) >= 70 && Math.abs(dy) <= Math.abs(dx) * 0.5 && Date.now() - start.at <= 700
      start = null
      if (ok) go(dx < 0 ? 1 : -1, 'swipe')
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchend', onEnd)
    }
  }, [activeSelector])

  const cur = index >= 0 ? items[index] : null
  return (
    <>
      {cur && (
        <div className="game-stepper">
          <button type="button" className="gs-btn" disabled={index === 0} onClick={() => state.current.go(-1, 'button')}
            aria-label={index > 0 ? `Previous game: ${items[index - 1].label}` : 'No previous game'}>◀<span className="gs-side">{index > 0 ? items[index - 1].label : ''}</span></button>
          <span className="gs-now"><b>{cur.label}</b><span className="gs-count">{index + 1} / {items.length} · swipe or ← →</span></span>
          <button type="button" className="gs-btn r" disabled={index === items.length - 1} onClick={() => state.current.go(1, 'button')}
            aria-label={index < items.length - 1 ? `Next game: ${items[index + 1].label}` : 'No next game'}><span className="gs-side">{index < items.length - 1 ? items[index + 1].label : ''}</span>▶</button>
        </div>
      )}
      {toast && <div className="gs-toast" role="status">{toast}</div>}
    </>
  )
}
