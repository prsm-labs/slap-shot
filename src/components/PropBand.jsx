import { useState } from 'react'
import './PropBand.css'

// 📱 Prop band (2026-11-03, user: blend the mockup's prop card with the info-rich phone cards). Same file in CourtIQ, Slap Shot and
// Six Points. Sits in its own table cell (class tc-band) that only shows in phone card mode (tableCards.css); the table on wider
// screens never shows it. One prop row on top of the card: the line with − / +, our chance at it as the big number, his hit rates
// on that line (L5 / L10 / L20 or what the app has), his last 5 games as bars against the line, and the app's Gambly button for that
// exact line. "More ▾" opens the card's folded cells (class tc-more) on this card only.
const pctTxt = (v) => (v == null ? '—' : v >= 0.995 ? '99%' : v < 0.01 ? '<1%' : `${Math.round(v * 100)}%`)
const tone = (r, chance) => (r == null || chance == null ? '' : r >= chance + 0.12 ? 'up' : r <= chance - 0.12 ? 'down' : '')

export default function PropBand({ lineLabel, chance, auto, onStep, onAuto, canDown = true, canUp = true, rates = [], last = [], line, action, more = true }) {
  const [open, setOpen] = useState(false)
  const toggle = (e) => {
    const tr = e.currentTarget.closest('tr')
    const v = !open
    setOpen(v)
    if (tr) { if (v) tr.setAttribute('data-tc-open', ''); else tr.removeAttribute('data-tc-open') }
  }
  const top = Math.max(line || 1, ...last.map((x) => x ?? 0), 1)
  return (
    <div className="pb">
      <div className="pb-line">
        <div className="pb-step">
          <button type="button" aria-label="Lower the line" disabled={!canDown} onClick={() => onStep(-1)}>−</button>
          <b>{lineLabel}</b>
          <button type="button" aria-label="Raise the line" disabled={!canUp} onClick={() => onStep(1)}>+</button>
        </div>
        <span className="pb-mode">{auto ? 'his line' : <button type="button" onClick={onAuto} title="Back to each player's own line">↺ his line</button>}</span>
        <span className="pb-chance" title="Our calibrated chance at this line">{pctTxt(chance)}</span>
      </div>
      <div className="pb-row">
        {rates.map(([k, hit, n]) => (
          <span key={k} className={`pb-rate ${n ? tone(hit / n, chance) : ''}`} title={n ? `Cleared it ${hit} of his last ${n}` : 'No games'}>
            <i>{k}</i>{n ? `${hit}/${n}` : '—'}
          </span>
        ))}
        {last.length > 0 && (
          <span className="pb-bars" title={`Last ${last.length} games vs ${lineLabel} (oldest to newest)`}>
            {last.map((v, i) => <i key={i} className={v != null && v >= line ? 'y' : 'n'} style={{ height: `${Math.max(8, Math.round(((v ?? 0) / top) * 100))}%` }}><em>{v ?? '—'}</em></i>)}
            <s style={{ bottom: `${Math.round((line / top) * 100)}%` }} />
          </span>
        )}
        <span className="pb-act">
          {action}
          {more && <button type="button" className="pb-more" onClick={toggle}>{open ? 'Less ▴' : 'More ▾'}</button>}
        </span>
      </div>
    </div>
  )
}

// Shared helpers for the labs: the line a card shows (the lab's set line, else his own line -- the highest line he has a 50%+ chance
// at, else his lowest), every line any player has (for − / +), and hit counts from a list of values.
export function ownLine(ladder) {
  if (!ladder?.length) return null
  const ok = ladder.filter(([, ch]) => ch >= 0.5)
  return ok.length ? ok[ok.length - 1][0] : ladder[0][0]
}
export function chanceAt(ladder, T) {
  if (!ladder?.length || T == null) return null
  const hit = ladder.find(([L]) => L === T)
  if (hit) return hit[1]
  if (T < ladder[0][0]) return 0.995
  if (T > ladder[ladder.length - 1][0]) return 0.005
  return null
}
export function hitsOf(values, T, n) {
  const g = values.filter((v) => v != null).slice(-n)
  return [g.filter((v) => v >= T).length, g.length]
}
export function stepFrom(options, from, d) {
  if (!options.length) return null
  let i = options.indexOf(from)
  if (i < 0) i = options.findIndex((x) => x >= from)
  if (i < 0) i = options.length - 1
  return options[Math.max(0, Math.min(options.length - 1, i + d))]
}
