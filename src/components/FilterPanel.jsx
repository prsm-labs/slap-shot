import { useState } from 'react'
import './FilterPanel.css'

// 2026-10-25 (user: tag filters -- B2B, B2B tmrw, listed Top / PRISM Pick, Data limited -- and a grade SCALE for the grade /
// matchup / H2H letters instead of "A, B or C or better", in every app; open / close the panel). Same file in CourtIQ, Slap
// Shot, Six Points and Final Lap; each app's filter store owns the state and the matching, this only draws it.
//
// groups: [{ key, label, type, options: [{ v, label, title, n }], hint, match }]
//   type 'one'   -- a single choice (value[key] = v or null), e.g. a chance floor
//   type 'multi' -- pick any number (value[key] = [v, ...]); within a group a player needs ANY of them (A+ or A or A-)
//   type 'tags'  -- pick any number of tags; value[`${key}Mode`] = 'all' (default: he must carry every one) or 'any'
// n = how many players on the list carry that option tonight (shown on the pill; 0 = greyed out unless already picked).
// Across groups a player has to pass every group.
const OPEN_KEY = 'filterPanelOpen'
const readOpen = () => { try { return localStorage.getItem(OPEN_KEY) === '1' } catch { return false } }
const saveOpen = (v) => { try { localStorage.setItem(OPEN_KEY, v ? '1' : '0') } catch { /* private mode */ } }

export const isActive = (g, value) => (g.type === 'one' ? value[g.key] != null : (value[g.key] || []).length > 0)

export default function FilterPanel({ groups, value, onChange, onClear, shown, total, noun = 'players' }) {
  const [open, setOpenState] = useState(readOpen)
  const setOpen = (v) => { setOpenState(v); saveOpen(v) }
  const live = groups.filter((g) => g.options.length)
  const n = live.reduce((s, g) => s + (g.type === 'one' ? (value[g.key] != null ? 1 : 0) : (value[g.key] || []).length), 0)
  const toggle = (g, v) => {
    if (g.type === 'one') return onChange(g.key, value[g.key] === v ? null : v)
    const cur = value[g.key] || []
    onChange(g.key, cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v])
  }
  const labelOf = (g, v) => g.options.find((o) => o.v === v)?.short || g.options.find((o) => o.v === v)?.label || String(v)
  // what's on, as removable chips -- visible with the panel closed too
  const chips = live.flatMap((g) => (g.type === 'one'
    ? (value[g.key] != null ? [{ g, v: value[g.key] }] : [])
    : (value[g.key] || []).map((v) => ({ g, v }))))
  return (
    <div className={`fp card ${open ? 'open' : ''}`}>
      <div className="fp-head">
        <button type="button" className="fp-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span aria-hidden="true">⚙</span> Filters{n ? <b className="fp-count">{n}</b> : null}<span className="fp-caret" aria-hidden="true">{open ? '▴' : '▾'}</span>
        </button>
        {shown != null && <span className="fp-shown">{shown} of {total} {noun}</span>}
        {chips.length > 0 && (
          <div className="fp-chips">
            {chips.map(({ g, v }) => (
              <button type="button" key={`${g.key}:${v}`} className="fp-chip" onClick={() => toggle(g, v)} title={`Remove: ${g.label} ${labelOf(g, v)}`}>
                {(g.chip ?? g.label) && <span className="fp-chip-g">{g.chip ?? g.label}</span>} {labelOf(g, v)} <span aria-hidden="true">✕</span>
              </button>
            ))}
            <button type="button" className="fp-clear" onClick={onClear}>Clear all</button>
          </div>
        )}
      </div>
      {open && (
        <div className="fp-body">
          {live.map((g) => {
            const cur = value[g.key]
            const any = g.type === 'one' ? cur == null : !(cur || []).length
            return (
              <div className="fp-group" key={g.key}>
                <div className="fp-label" title={g.hint}>{g.label}</div>
                <div className="fp-pills">
                  <button type="button" className={`fp-pill ${any ? 'on' : ''}`} onClick={() => onChange(g.key, g.type === 'one' ? null : [])}>{g.anyLabel || 'Any'}</button>
                  {g.options.map((o) => {
                    const on = g.type === 'one' ? cur === o.v : (cur || []).includes(o.v)
                    const empty = o.n === 0 && !on
                    return (
                      <button type="button" key={String(o.v)} className={`fp-pill ${on ? 'on' : ''} ${empty ? 'empty' : ''}`} disabled={empty}
                        title={o.title} onClick={() => toggle(g, o.v)}>
                        {o.label}{o.n != null && <span className="fp-n">{o.n}</span>}
                      </button>
                    )
                  })}
                  {g.type === 'tags' && (cur || []).length > 1 && (
                    <span className="fp-mode" role="group" aria-label="Match">
                      {[['all', 'Match all'], ['any', 'Match any']].map(([k, l]) => (
                        <button type="button" key={k} className={(value[`${g.key}Mode`] || 'all') === k ? 'on' : ''} onClick={() => onChange(`${g.key}Mode`, k)}>{l}</button>
                      ))}
                    </span>
                  )}
                </div>
                {g.hint && <div className="fp-hint">{g.hint}</div>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Matching (the apps' own filter code calls these). Each group carries
//   get(p)          -> the player's value for a 'multi' group (a letter, a tier, or a list of them) or his tag keys for 'tags'
//   test(p, sel)    -> for a 'one' group: does he clear the chosen option (e.g. chance >= sel)
function optHit(g, p, v) {
  if (g.type === 'one') return g.test(p, v)
  const have = g.get(p)
  return Array.isArray(have) ? have.includes(v) : have === v
}
export function passes(g, value, p) {
  if (!isActive(g, value)) return true
  const sel = value[g.key]
  if (g.type === 'one') return g.test(p, sel)
  if (g.type === 'multi') return sel.some((v) => optHit(g, p, v))
  return (value[`${g.key}Mode`] || 'all') === 'any' ? sel.some((v) => optHit(g, p, v)) : sel.every((v) => optHit(g, p, v))
}
export const applyGroups = (list, groups, value) => (list ? list.filter((p) => groups.every((g) => passes(g, value, p))) : list)
// n on every pill: how many of `list` would match that option on its own. Options in `hideEmpty` groups with no player
// tonight are dropped (e.g. a Top Pick tier that isn't on this slate).
export function withCounts(groups, list) {
  return groups.map((g) => {
    const options = g.options.map((o) => ({ ...o, n: (list || []).filter((p) => optHit(g, p, o.v)).length }))
    return { ...g, options: g.hideEmpty ? options.filter((o) => o.n > 0) : options }
  })
}
