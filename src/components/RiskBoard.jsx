import { Fragment, useMemo, useState } from 'react'
import './RiskBoard.css'

// 🎚️ Risk slider (2026-10-27, user: a slider in Scouting from safe to long shot -- the player list shows the props in that chance
// range, tap a player for his whole ladder of lines; plus L7 green / red hit strips). Same file in CourtIQ, Slap Shot and Six Points;
// each app's adapter hands it normalized rows (see the app's tab) and its own player cell. Chances come from the app's
// build_line_board.py / line board model (every line priced, held-out calibration incl. his own recent hit rate on the line).
//   players: [{ id, cell, n, lines: { STAT: [[line, chance, hitsInLastN]] }, recent: [{ d, o, label?, v: { STAT: value } }] oldest first,
//              proj: { STAT }, actual: { STAT } | null (did not play) | undefined (not graded) }]
//   stats:   [{ k, label, name }]   model: { bands: [{ lo, hi, n, hits, said }], selection }   live: { bands: [[lo, hi, n, hits, said]] }
const WINDOW = 0.08
const toTarget = (s) => 0.95 - (s / 100) * 0.9            // slider 0 = 95% (safe) .. 100 = 5% (long shot)
const toSlider = (t) => Math.round(((0.95 - t) / 0.9) * 100)
const pct = (v, d = 0) => (v == null || Number.isNaN(v) ? '—' : `${(v * 100).toFixed(d)}%`)
const level = (t) => (t >= 0.55 ? ['🛡️', 'Safe'] : t >= 0.3 ? ['⚖️', 'Mid-range'] : t >= 0.1 ? ['🌠', 'Long shot'] : ['🎲', 'Moonshot'])
const fmtDate = (d) => { const [, m, dd] = String(d || '').split('-'); return m ? `${+m}/${+dd}` : '' }

function load(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v ?? fallback } catch { return fallback }
}
function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* private window */ } }

// L7 strip: one square per game, oldest left -> newest right, green = cleared the line.
export function HitStrip({ recent, stat, line, n = 7, count = true }) {
  const games = (recent || []).filter((g) => g.v?.[stat] != null).slice(-n)
  if (!games.length || line == null) return <span className="rb-muted">—</span>
  const hits = games.filter((g) => g.v[stat] >= line).length
  return (
    <span className="hit-strip" title={`Last ${games.length} games vs ${line}+: ${hits} of ${games.length}`}>
      {games.map((g, i) => (
        <i key={i} className={g.v[stat] >= line ? 'y' : 'n'} title={`${g.label || `${fmtDate(g.d)}${g.o ? ` vs ${g.o}` : ''}`}: ${g.v[stat]}`} />
      ))}
      {count && <b>{hits}/{games.length}</b>}
    </span>
  )
}

function bandOf(bands, ch) {
  return (bands || []).find((b) => ch >= b.lo && ch < b.hi) || null
}
function liveBand(live, ch) {
  const b = (live?.bands || []).find(([lo, hi]) => ch >= lo && ch < hi)
  return b && b[2] >= 30 ? { n: b[2], rate: b[3] / b[2] } : null
}

export default function RiskBoard({ players, stats, model, live, liveLabel = 'this season', lastLabel = 'L20', lineLabel, past = false,
  storeKey, intro, unit = 'night', pillClass = 'pill', tableClass = '', stickyClass = 'sticky', wrapClass = 'table-wrap' }) {
  const [slider, setSliderRaw] = useState(() => load(`${storeKey}.slider`, toSlider(0.6)))
  const [stat, setStatRaw] = useState(() => load(`${storeKey}.stat`, 'all'))
  const [every, setEveryRaw] = useState(() => load(`${storeKey}.every`, false))
  const [open, setOpen] = useState(null)
  const [sortKey, setSortKey] = useState('chance')
  const [dir, setDir] = useState('desc')
  const setSlider = (v) => { setSliderRaw(v); save(`${storeKey}.slider`, v) }
  const setStat = (v) => { setStatRaw(v); save(`${storeKey}.stat`, v) }
  const setEvery = (v) => { setEveryRaw(v); save(`${storeKey}.every`, v) }
  const target = toTarget(slider)
  const lo = Math.max(0.02, target - WINDOW), hi = Math.min(0.98, target + WINDOW)
  const [emo, lvl] = level(target)
  const label = lineLabel || ((st, T) => `${T}+ ${stats.find((s) => s.k === st)?.label || st}`)

  const rows = useMemo(() => {
    const out = []
    for (const p of players) {
      const cands = []
      for (const s of stats) {
        if (stat !== 'all' && stat !== s.k) continue
        for (const [T, ch, hits] of p.lines?.[s.k] || []) {
          if (ch >= lo && ch < hi) cands.push({ key: `${p.id}|${s.k}|${T}`, p, stat: s.k, line: T, chance: ch, hits, dist: Math.abs(ch - target) })
        }
      }
      if (every) out.push(...cands)
      else if (cands.length) out.push(cands.reduce((a, b) => (b.dist < a.dist ? b : a)))
    }
    return out
  }, [players, stats, stat, every, lo, hi, target])

  const get = {
    chance: (r) => r.chance, name: (r) => r.p.name, prop: (r) => `${r.stat}${String(r.line).padStart(4, '0')}`,
    own: (r) => (r.p.n ? r.hits / r.p.n : null), proj: (r) => r.p.proj?.[r.stat],
    l7: (r) => { const g = (r.p.recent || []).filter((x) => x.v?.[r.stat] != null).slice(-7); return g.length ? g.filter((x) => x.v[r.stat] >= r.line).length / g.length : null },
    result: (r) => (r.p.actual ? (r.p.actual[r.stat] >= r.line ? 1 : 0) : null),
  }
  const sorted = useMemo(() => {
    const g = get[sortKey] || get.chance
    return [...rows].sort((a, b) => {
      const av = g(a), bv = g(b)
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'string') return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      return dir === 'asc' ? av - bv : bv - av
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sortKey, dir])
  const th = (k, l, title, cls = '') => (
    <th className={`sortable ${sortKey === k ? 'sorted' : ''} ${cls}`} title={title}
      onClick={() => { if (k === sortKey) setDir(dir === 'asc' ? 'desc' : 'asc'); else { setSortKey(k); setDir(k === 'name' || k === 'prop' ? 'asc' : 'desc') } }}>
      {l}{sortKey === k ? (dir === 'desc' ? ' ↓' : ' ↑') : ''}
    </th>
  )
  const graded = past && rows.some((r) => r.p.actual !== undefined)
  const done = graded ? rows.filter((r) => r.p.actual) : []
  const sel = (model?.selection || []).reduce((a, b) => (Math.abs(b.target - target) < Math.abs(a.target - target) ? b : a), (model?.selection || [])[0])
  const nCols = 5 + (graded ? 1 : 0)

  return (
    <div className="risk-board">
      {intro && <div className="note">{intro}</div>}
      <div className="rb-panel">
        <div className="rb-head">
          <span className="rb-level">{emo} {lvl}</span>
          <span className="rb-target">around <b>{pct(target)}</b> <span className="rb-muted">({pct(lo)}–{pct(hi)})</span></span>
        </div>
        <input className="rb-slider" type="range" min="0" max="100" step="1" value={slider} aria-label="Risk level: safe to long shot"
          onChange={(e) => setSlider(Number(e.target.value))} />
        <div className="rb-ends"><span>🛡️ Safe · higher chance</span><span>Long shot · bigger payoff 🌠</span></div>
        <div className="rb-presets">
          {[['🛡️ Safe', 0.75], ['⚖️ Mid-range', 0.42], ['🌠 Long shot', 0.17], ['🎲 Moonshot', 0.07]].map(([l, t]) => (
            <button key={l} className={`${pillClass} ${Math.abs(target - t) < 0.02 ? 'active' : ''}`} onClick={() => setSlider(toSlider(t))}>{l}</button>
          ))}
        </div>
        <div className="rb-controls">
          <div className="rb-group">
            <button className={`${pillClass} ${stat === 'all' ? 'active' : ''}`} onClick={() => setStat('all')}>All props</button>
            {stats.map((s) => <button key={s.k} className={`${pillClass} ${stat === s.k ? 'active' : ''}`} onClick={() => setStat(s.k)}>{s.label}</button>)}
          </div>
          <div className="rb-group">
            <button className={`${pillClass} ${!every ? 'active' : ''}`} onClick={() => setEvery(false)} title="Each player's line closest to the slider">One per player</button>
            <button className={`${pillClass} ${every ? 'active' : ''}`} onClick={() => setEvery(true)} title="Every line in the range">Every line</button>
          </div>
        </div>
        <div className="rb-meta rb-muted rb-small">
          {rows.length} {every ? 'lines' : 'players'} in range.
          {sel && <> Backtest of this slider spot (top 10 a {unit} by chance, one line each, held out by season): <b>{pct(sel.hits / sel.n)}</b> hit, said {pct(sel.said)} ({sel.n.toLocaleString()} picks).</>}
          {graded && done.length > 0 && <> {unit === 'week' ? "This week's" : "That night's"} list: <b>{done.filter((r) => r.p.actual[r.stat] >= r.line).length}/{done.length}</b> hit.</>}
        </div>
      </div>

      {rows.length === 0 ? <div className="note">No props in this range — move the slider or pick another stat.</div> : (
        <div className={wrapClass}>
          <table className={`rb-table ${tableClass}`}>
            <thead><tr>
              {th('name', 'Player', null, stickyClass)}
              {th('chance', 'Prop · chance · L7', 'The line, our calibrated chance, and his last 7 games against it (green = cleared it, oldest to newest)')}
              <th title="How often lines we gave this chance actually hit: the held-out backtest, then this season's graded lines">Past hit %</th>
              {th('own', lastLabel, `How often he cleared this line in his last ${lastLabel.slice(1)} games`)}
              {th('proj', 'Proj', 'Our projection for this stat')}
              {graded && th('result', 'Result')}
            </tr></thead>
            <tbody>
              {sorted.map((r) => {
                const b = bandOf(model?.bands, r.chance)
                const lv = liveBand(live, r.chance)
                const isOpen = open === r.p.id
                return (
                  <Fragment key={r.key}>
                    <tr className={isOpen ? 'rb-open' : ''}>
                      <td className={stickyClass}>{r.p.cell}</td>
                      <td className="rb-pick">
                        <div><button className="rb-prop" onClick={() => setOpen(isOpen ? null : r.p.id)} title="Show his whole ladder">{label(r.stat, r.line)} {isOpen ? '▴' : '▾'}</button>
                          <span className="rb-prob" style={{ '--w': `${Math.round(r.chance * 100)}%` }}>{pct(r.chance)}</span></div>
                        <HitStrip recent={r.p.recent} stat={r.stat} line={r.line} />
                      </td>
                      <td className="rb-num rb-small">{b ? pct(b.hits / b.n) : '—'}{lv && <div className="rb-muted">{liveLabel} {pct(lv.rate)}</div>}</td>
                      <td className="rb-num">{r.p.n ? `${r.hits}/${r.p.n}` : '—'}</td>
                      <td className="rb-num">{r.p.proj?.[r.stat] != null ? Number(r.p.proj[r.stat]).toFixed(1) : '—'}</td>
                      {graded && <td className="rb-num">{r.p.actual === undefined ? '—' : r.p.actual === null ? <span className="rb-muted">DNP</span>
                        : r.p.actual[r.stat] >= r.line ? <span className="rb-yes">✅ {r.p.actual[r.stat]}</span> : <span className="rb-no">❌ {r.p.actual[r.stat]}</span>}</td>}
                    </tr>
                    {isOpen && (
                      <tr className="rb-ladder-row"><td colSpan={nCols}>
                        <div className="rb-ladder">
                          {stats.filter((s) => (r.p.lines?.[s.k] || []).some(([, ch]) => ch >= 0.04 && ch <= 0.97)).sort((a, b) => (a.k === r.stat ? -1 : b.k === r.stat ? 1 : 0)).map((s) => (
                            <div key={s.k} className="rb-ladder-stat">
                              <span className="rb-ladder-label">{s.label}{r.p.proj?.[s.k] != null && <span className="rb-muted"> proj {Number(r.p.proj[s.k]).toFixed(1)}</span>}</span>
                              <div className="rb-chips">
                                {r.p.lines[s.k].filter(([, ch]) => ch >= 0.04 && ch <= 0.97).map(([T, ch, hits]) => {
                                  const g = (r.p.recent || []).filter((x) => x.v?.[s.k] != null).slice(-7)
                                  const h7 = g.filter((x) => x.v[s.k] >= T).length
                                  const inWin = ch >= lo && ch < hi
                                  const res = r.p.actual ? (r.p.actual[s.k] >= T ? 'y' : 'n') : ''
                                  return (
                                    <button key={T} className={`rb-chip ${inWin ? 'in' : ''} ${res}`} style={{ '--w': `${Math.round(ch * 100)}%` }}
                                      title={`${label(s.k, T)}: ${pct(ch)} · last 7: ${h7}/${g.length} · ${lastLabel}: ${hits}/${r.p.n} — tap to move the slider here`}
                                      onClick={() => setSlider(Math.max(0, Math.min(100, toSlider(ch))))}>
                                      <b>{T}+</b><span>{pct(ch)}</span><small>{g.length ? `${h7}/${g.length}` : ''}</small>
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          ))}
                          <div className="rb-muted rb-small">Each chip: line · our chance · last-7 hits. Highlighted = inside the slider range. Tap a chip to move the slider to it.</div>
                        </div>
                      </td></tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
