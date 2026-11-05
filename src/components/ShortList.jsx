import './ShortList.css'

// ⚡ Today's short list (2026-11-05, user: a 5-10 minute visit should find the player to target without digging). The top of each
// tested list on one card, one player each: PRISM Pick, mid-range, under the radar, the app's lined-up edge, a long shot. Same file in
// CourtIQ, Slap Shot and Six Points; each Cheat Sheets page builds its own items (its own lists, its own numbers).
// item = { key, tag, name, team, sub, line, big, bigSub, why, onOpen, action, result }, or a list of them (that list's top few, best
// first): the first one whose player isn't already on the card is shown, so every row is a different player.
export default function ShortList({ items, sub, past }) {
  const seen = new Set()
  const rows = []
  for (const x of items || []) {
    const c = (Array.isArray(x) ? x : [x]).find((y) => y && !seen.has(y.name))
    if (c && rows.length < 5) { seen.add(c.name); rows.push(c) }
  }
  return (
    <div className="card short-list">
      <div className="sl-head">
        <b>⚡ {past ? "That day's short list" : "Today's short list"}</b>
        <span className="muted small">{sub || 'The top look from each tested list below — one player each. Tap a name for his card.'}</span>
      </div>
      {rows.length === 0 && <div className="muted small">Nothing qualifies yet — the lists fill in once the slate is built.</div>}
      {rows.map((x) => (
        <div key={x.key} className="sl-row" onClick={x.onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && x.onOpen?.()}>
          <span className={`sl-tag ${x.tagCls || ''}`}>{x.tag}</span>
          <div className="sl-main">
            <div className="sl-name">{x.name} <span className="muted small">{x.team}</span> <span onClick={(e) => e.stopPropagation()}>{x.action}</span></div>
            <div className="sl-line">{x.line}{x.result && <span className={`sl-res ${x.result}`}> {x.result === 'hit' ? '✅' : x.result === 'miss' ? '✗' : x.result}</span>}</div>
            {x.why && <div className="muted small sl-why">{x.why}</div>}
          </div>
          <div className="sl-big"><b>{x.big}</b>{x.bigSub && <span className="muted small">{x.bigSub}</span>}</div>
        </div>
      ))}
    </div>
  )
}
