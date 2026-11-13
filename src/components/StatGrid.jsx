import { PickLine, rolling, TrendKey, TrendSeg } from './Trend.jsx'
import './StatGrid.css'

// 2026-11-13 (user: CourtIQ's slideout charts -- one small chart per prop -- in the other apps too). Same file in Slap Shot and
// Six Points; mirrors CourtIQ's StatChart (PlayerSlideout.jsx): a grid of bar charts, one per stat, each with its average, its
// projection where the app has one (dashed), how often he reached the line, bars colored at the line, a last-5 trend line.
// The stat picked in the Hit rates card comes first, outlined, on the picked line ("your line", solid accent).
//   charts: [{ k, label, get(g) -> number, line (null = no line), proj (null = none), mine }]
//   games: the bars (oldest -> newest; g.today / g.live = tonight's outlined bar); all: the full list the trend averages over
//   labels(g) -> [top, bottom] under each bar; sub(k, g) -> optional third line
const SCALE = 80 // % of the chart height for the tallest bar; leaves room for the value label
const fx = (v) => (v == null ? '—' : Number.isInteger(v) ? String(v) : Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1))

function Chart({ c, games, all, labels, sub, trend }) {
  const vals = games.map((g) => c.get(g) ?? 0)
  const max = Math.max(1, ...vals, c.proj || 0, c.line || 0)
  const avg = vals.reduce((a, b) => a + b, 0) / (vals.length || 1)
  const hits = c.line == null ? null : vals.filter((v) => v >= c.line).length
  const src = all && all.length >= games.length ? all : games
  const tr = trend ? rolling(src.map((g) => c.get(g) ?? 0), src.map((g) => g.today)).slice(-games.length).map((v) => (v == null ? null : (v / max) * SCALE)) : []
  return (
    <div className={`sg-chart ${c.mine ? 'chart-mine' : ''}`}>
      <div className="sg-head">
        <b>{c.label}{c.mine && <span className="sg-mine"> · your line</span>}</b>
        <span>avg {fx(avg)}{c.proj != null ? ` · proj ${fx(c.proj)}` : ''}{hits != null ? ` · ${fx(c.line)}+ in ${hits}/${vals.length}` : ''}</span>
      </div>
      <div className="sg-bars">
        {c.mine && <PickLine y={(c.line / max) * SCALE} gap={0} title={`Your hit-rate line: ${fx(c.line)}+`} />}
        {c.proj != null && <span className="sg-proj" style={{ bottom: `${(c.proj / max) * SCALE}%` }} title={`Projection: ${fx(c.proj)}`} />}
        {games.map((g, i) => (
          <div key={i} className="sg-bar">
            <TrendSeg y={tr[i]} next={tr[i + 1]} gap={3} title={tr[i] != null ? `Last-5 average: ${fx((tr[i] / SCALE) * max)}` : undefined} />
            <span className={`sg-v ${g.today ? 'today' : ''}`}>{fx(vals[i])}</span>
            <span className={`sg-fill ${c.line != null && vals[i] >= c.line ? 'hit' : ''} ${g.today ? 'today' : ''} ${g.live ? 'live' : ''}`} style={{ height: `${(vals[i] / max) * SCALE}%` }} />
          </div>
        ))}
      </div>
      <div className="sg-labels">
        {games.map((g, i) => { const [a, b] = labels(g); const s = sub?.(c.k, g); return <span key={i} className={g.today ? 'today' : ''}>{a}<i>{b}</i>{s ? <i>{s}</i> : null}</span> })}
      </div>
    </div>
  )
}

export default function StatGrid({ charts, games, all, labels, sub, trend = false, projLabel = "tonight's projection" }) {
  const anyProj = charts.some((c) => c.proj != null)
  const anyMine = charts.some((c) => c.mine)
  return (
    <>
      <div className="sg-grid">
        {charts.map((c) => <Chart key={c.k} c={c} games={games} all={all} labels={labels} sub={sub} trend={trend} />)}
      </div>
      {(trend || anyProj || anyMine) && <TrendKey proj={anyProj} projLabel={projLabel} pick={anyMine ? 'your hit-rate line' : null}
        avgLabel={trend ? 'his last-5-game average' : 'bars colored at the line'} />}
    </>
  )
}
