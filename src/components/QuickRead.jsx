import './QuickRead.css'

// 2026-11-11 (user: the slideout matchup write-up read like a run-on sentence of numbers -- shorter, data-backed, no AI / no
// credits). Shared file -- same in CourtIQ, Slap Shot, Six Points and Final Lap. Each app's quickRead builder hands over short
// lines (▲ helps / ▼ hurts / ⚠ a caution), built only from factors that are in the model or passed a held-out test; things tested
// as noise (H2H, defense vs position, home / road splits) never show here. Ranked by size, at most 4, tiny ones dropped.
// The full write-ups stay below, folded.
const MARK = { up: '▲', down: '▼', warn: '⚠' }

// candidates: [{ dir, text, w }] -- w = size (points of chance where known); keeps the biggest `max` with |w| >= min
export function pickLines(cands, max = 4, min = 1) {
  return cands.filter((c) => c && c.text && Math.abs(c.w || 0) >= min)
    .sort((a, b) => Math.abs(b.w) - Math.abs(a.w)).slice(0, max)
}

export default function QuickRead({ title, lines, chances, note, empty = 'Nothing unusual lined up: his chances sit near his norm.' }) {
  if (!lines) return null
  return (
    <div className="qr">
      <div className="qr-title">{title}</div>
      {lines.length ? (
        <ul className="qr-lines">
          {lines.map((l, i) => (
            <li key={i} className={`qr-${l.dir}`}><span className="qr-mark">{MARK[l.dir] || '•'}</span><span>{l.text}</span></li>
          ))}
        </ul>
      ) : <div className="qr-empty">{empty}</div>}
      {chances && <div className="qr-chances">{chances}</div>}
      {note && <div className="qr-note">{note}</div>}
    </div>
  )
}
