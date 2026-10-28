import { useEffect, useMemo, useState } from 'react'
import './HitRateCard.css'

// 2026-10-28 (user: props.cash-style hit rates + Outlier-style situational splits, but nothing bulky). Same file in
// CourtIQ, Slap Shot and Six Points; each app's adapter (lib/hitGames.js) turns its season game logs into one list:
//   games: [{ date, season: 'cur' | 'prev', opp, home, played (minutes / TOI / snap %), v: { STAT: value },
//             afterLoss: true | false | null, rest: days off before it (0 = back-to-back) | null,
//             tier: { STAT: 'soft' | 'avg' | 'tough' } (that season's defenses, per game allowed for that stat) }]
// Shows: a stat picker, a -/+ line, six small tiles (last 5 / 10 / 20, this season, last season, vs tonight's opponent) and,
// folded under "Splits", one compact table. Context only -- nothing here feeds a projection.
//   stats: [{ k, label, unit, step, min, def (default line; omit = his average rounded to the step) }]
//   rest: [{ label, test(rest) }]  played: { label, unit } (the minutes-style split, his own median as the cut)
const pctOf = (h, n) => (n ? Math.round((h / n) * 100) : null)
// green / red = clearly above / below HIS OWN rate at this line over every game shown (a 40% goal rate can be great, a 60%
// points rate can be cold), not a fixed cut
const toneOf = (base) => (r, n) => (r == null || base == null || n < 3 ? '' : r >= base + 12 ? 'good' : r <= base - 12 ? 'bad' : '')
const fmt = (v) => (v == null ? '—' : Math.abs(v) >= 100 || Number.isInteger(v) ? String(Math.round(v)) : v.toFixed(1))
const fmtAvg = (v) => (v == null ? '—' : Math.abs(v) >= 100 ? String(Math.round(v)) : v.toFixed(1))
const TIER_LABELS = ['🟢 Soft (10 softest)', 'Average', '🔴 Tough (10 toughest)']

export default function HitRateCard({ games, ready, stats, opp, rest, played, seasonLabels = ['This season', 'Last season'], note, tierLabels = TIER_LABELS }) {
  const [k, setK] = useState(stats[0].k)
  const stat = stats.find((s) => s.k === k) || stats[0]
  // default line: the stat's def, else his average this season (last season under 3 games) rounded to the step
  const autoDef = useMemo(() => {
    if (stat.def != null) return stat.def
    const gs = (games || []).filter((g) => g.v[stat.k] != null)
    const cur = gs.filter((g) => g.season === 'cur')
    const use = cur.length >= 3 ? cur : gs
    if (!use.length) return stat.min ?? 1
    const a = use.reduce((s, g) => s + g.v[stat.k], 0) / use.length
    return Math.max(stat.min ?? 1, Math.round(a / stat.step) * stat.step)
  }, [games, stat.k, stat.def, stat.step, stat.min])
  const [line, setLine] = useState(autoDef)
  const [open, setOpen] = useState(false)
  useEffect(() => { setLine(autoDef) }, [stat.k, autoDef])
  const list = useMemo(() => (games || []).filter((g) => g.v[k] != null).sort((a, b) => (a.date < b.date ? 1 : -1)), [games, k])
  const rate = (gs) => { const h = gs.filter((g) => g.v[k] >= line).length; return { h, n: gs.length, r: pctOf(h, gs.length) } }
  const avg = (gs) => (gs.length ? gs.reduce((s, g) => s + g.v[k], 0) / gs.length : null)
  const all = rate(list)
  const tone = toneOf(all.r)
  const cur = list.filter((g) => g.season === 'cur')
  const prev = list.filter((g) => g.season === 'prev')
  const vsOpp = list.filter((g) => g.opp === opp)
  const tiles = [
    ['L5', list.slice(0, 5)], ['L10', list.slice(0, 10)], ['L20', list.slice(0, 20)],
    [seasonLabels[0], cur], [seasonLabels[1], prev], [`vs ${opp}`, vsOpp],
  ]
  // splits: this season + last season together (small samples otherwise)
  const med = (() => { const xs = list.map((g) => g.played).filter((x) => x != null).sort((a, b) => a - b); return xs.length ? xs[Math.floor(xs.length / 2)] : null })()
  const medCut = med == null ? null : played?.round ? played.round(med) : Math.round(med)
  const groups = [
    ['Where', [['Home', (g) => g.home], ['Road', (g) => !g.home]]],
    ['Last game', [['After a win', (g) => g.afterLoss === false], ['After a loss', (g) => g.afterLoss === true]]],
    ['Rest', (rest || []).map((r) => [r.label, (g) => g.rest != null && r.test(g.rest)])],
    ...(played && medCut != null ? [[played.label, [[`${medCut}+ ${played.unit}`, (g) => g.played >= medCut], [`Under ${medCut}`, (g) => g.played < medCut]]]] : []),
    [`Defense vs ${stat.label.toLowerCase()}`, [[tierLabels[0], (g) => g.tier?.[k] === 'soft'], [tierLabels[1], (g) => g.tier?.[k] === 'avg'], [tierLabels[2], (g) => g.tier?.[k] === 'tough']]],
  ]
  return (
    <div className="hr-card">
      <div className="hr-top">
        <div className="hr-stats" role="tablist">
          {stats.map((s) => <button key={s.k} type="button" className={s.k === k ? 'on' : ''} onClick={() => setK(s.k)}>{s.label}</button>)}
        </div>
        <div className="hr-line">
          <button type="button" aria-label="Lower line" onClick={() => setLine((l) => Math.max(stat.min ?? 1, +(l - stat.step).toFixed(2)))}>−</button>
          <b>{fmt(line)}+ {stat.unit}</b>
          <button type="button" aria-label="Raise line" onClick={() => setLine((l) => +(l + stat.step).toFixed(2))}>+</button>
        </div>
      </div>
      {!ready ? <p className="muted small hr-wait">Loading his game logs…</p> : !list.length ? <p className="muted small hr-wait">No games yet.</p> : (
        <>
          <div className="hr-tiles">
            {tiles.map(([label, gs]) => { const x = rate(gs); return (
              <div key={label} className={`hr-tile ${tone(x.r, x.n)}`} title={x.n ? `${label}: ${x.h} of ${x.n} games at ${fmt(line)}+ · average ${fmtAvg(avg(gs))}` : `${label}: no games`}>
                <b>{x.r == null ? '—' : `${x.r}%`}</b><span>{label}</span><i>{x.n ? `${x.h}/${x.n}` : '0 g'}</i>
              </div>) })}
          </div>
          <button type="button" className="hr-more" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide splits 🔺' : 'Splits 🔻'}</button>
          {open && (
            <div className="hr-splits">
              <table className="mini">
                <thead><tr><th /><th>Games</th><th>Avg</th><th>{fmt(line)}+</th></tr></thead>
                <tbody>
                  {groups.filter(([, rows]) => rows.length).map(([title, rows]) => [
                    <tr key={title} className="hr-group"><td colSpan={4}>{title}</td></tr>,
                    ...rows.map(([label, test]) => { const gs = list.filter(test); const x = rate(gs); return (
                      <tr key={title + label}><td>{label}</td><td>{x.n || '—'}</td><td>{fmtAvg(avg(gs))}</td><td className={tone(x.r, x.n)}>{x.r == null ? '—' : `${x.r}%`}</td></tr>) }),
                  ])}
                </tbody>
              </table>
              <p className="muted small">{note || `This season + last season together. Green / red = well above / below his ${all.r}% at this line over all ${all.n} games. Context only — none of this changes a projection.`}</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
