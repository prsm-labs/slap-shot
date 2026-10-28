import { useState } from 'react'

// 2026-10-28 (user: paragraph details in the slideouts collapse into a simple "More 🔻"). One summary line + More / Less.
// Same file in CourtIQ, Slap Shot and Six Points (styles in HitRateCard.css).
export default function Fold({ summary, children, more = 'More 🔻', less = 'Less 🔺' }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="fold">
      <div className="fold-sum">
        <div>{summary}</div>
        <button type="button" className="fold-btn" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? less : more}</button>
      </div>
      {open && <div className="fold-body">{children}</div>}
    </div>
  )
}
