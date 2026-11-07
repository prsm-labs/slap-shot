import './Trend.css'

// 📈 Trend lines on the slideout charts (2026-11-07, user). Same file in CourtIQ, Slap Shot, Six Points and Final Lap.
// Solid line = rolling average of his last 5 games (3+ needed), drawn through the bars; dashed line = tonight's projection where
// the app has one for that stat. Context only, and deliberately no forward "trend" extension: recent form vs season added
// nothing over our chances (11/03 test) and riding a slope is the hot-hand read. The gap between the two lines is what
// Bounce-back / Fade look for. Each piece renders inside a bar column (position: relative); y = bottom % of that column, on the
// same scale its bar uses. gap = the chart's flex gap in px, so segments meet at the next bar's center.

// trailing average over the last w values (skip[i] = leave that game out, e.g. tonight's live bar); null until min games
export function rolling(vals, skip = [], w = 5, min = 3) {
  return vals.map((_, i) => {
    if (skip[i]) return null
    const win = []
    for (let j = i; j >= 0 && win.length < w; j--) if (!skip[j] && vals[j] != null) win.push(vals[j])
    return win.length >= min ? win.reduce((a, b) => a + b, 0) / win.length : null
  })
}

const clamp = (v) => Math.max(0, Math.min(100, v))
export function TrendSeg({ y, next, gap = 3, title }) {
  if (y == null) return null
  const t = (v) => `${100 - clamp(v)}%`
  return (
    <svg className="trend-seg" style={{ width: `calc(100% + ${gap}px)` }} aria-hidden="true">
      {title && <title>{title}</title>}
      {next != null && <line x1="0" y1={t(y)} x2="100%" y2={t(next)} />}
      <circle cx="0" cy={t(y)} r="2.25" />
    </svg>
  )
}

// dashed projection, one piece per bar column (pieces meet across the gaps)
export function TrendProj({ y, gap = 3, title }) {
  if (y == null) return null
  return <span className="trend-proj" style={{ bottom: `${clamp(y)}%`, left: -gap / 2, right: -gap / 2 }} title={title} />
}

export function TrendKey({ avgLabel = 'his last-5-game average', projLabel = "tonight's projection", proj = true }) {
  return (
    <p className="trend-key">
      <span className="trend-key-solid" /> {avgLabel}
      {proj && <><span className="trend-key-dash" /> {projLabel}</>}
      <span className="trend-key-note"> · context only</span>
    </p>
  )
}
