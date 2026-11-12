import { useState } from 'react'
import './ShortList.css'
import './Lenses.css'

// 🔭 Tonight's lenses (2026-11-12, user: put the tested data in the user's face without digging or sorting -- one tap, like 🔒 Locked in).
// A row of buttons; each opens a short ranked list with the reason on every row and the list's own record (or what it's tested on).
// Only tested lists get a button. Same file in CourtIQ, Slap Shot and Six Points; each app builds its own lenses (lib/lenses.js).
// lens = { key, label, title, record, rows: [{ key, name, team, line, big, bigSub, why, onOpen, action }] }
const KEY = 'lensOpen'
const read = () => { try { return localStorage.getItem(KEY) || null } catch { return null } }
const save = (v) => { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY) } catch { /* private mode */ } }

export default function Lenses({ lenses, max = 8, title = '🔭 Tonight’s lenses' }) {
  const [open, setOpenState] = useState(read)
  const setOpen = (v) => { setOpenState(v); save(v) }
  const live = (lenses || []).filter(Boolean)
  const cur = live.find((l) => l.key === open) || null
  const rows = (cur?.rows || []).slice(0, max)
  return (
    <div className="card lenses">
      <div className="ln-head">
        <b>{title}</b>
        <span className="muted small">One tap: a short list from a tested angle, with the reason on every row.</span>
      </div>
      <div className="ln-bar" role="tablist">
        {live.map((l) => (
          <button type="button" key={l.key} role="tab" aria-selected={open === l.key} title={l.title}
            className={`ln-btn ${open === l.key ? 'on' : ''}`} onClick={(e) => { setOpen(open === l.key ? null : l.key); e.currentTarget.scrollIntoView?.({ inline: 'nearest', block: 'nearest' }) }}>
            {l.label}{l.rows ? <span className="ln-n">{Math.min(l.rows.length, max)}</span> : null}
          </button>
        ))}
      </div>
      {cur && (
        <div className="ln-body">
          <div className="muted small ln-about">{cur.title}{cur.record ? <> <b className="ln-rec">{cur.record}</b></> : null}</div>
          {rows.length === 0 && <div className="muted small">Nobody fits tonight{cur.empty ? ` — ${cur.empty}` : ''}.</div>}
          {rows.map((x) => (
            <div key={x.key} className="sl-row ln-row" onClick={x.onOpen} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && x.onOpen?.()}>
              <div className="sl-main">
                <div className="sl-name">{x.name} <span className="muted small">{x.team}</span> <span onClick={(e) => e.stopPropagation()}>{x.action}</span></div>
                <div className="sl-line">{x.line}</div>
                {x.why && <div className="muted small sl-why">{x.why}</div>}
              </div>
              <div className="sl-big"><b>{x.big}</b>{x.bigSub && <span className="muted small">{x.bigSub}</span>}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
