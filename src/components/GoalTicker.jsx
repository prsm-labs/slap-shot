import { useEffect, useState } from "react";
import { fetchScoredPool } from "../lib/data.js";

// Ported from Going Yard's real HRTicker (mlb_project/going-yard/src/App.jsx:11730-11779, CSS
// at 344-352): a CSS-only infinite-scroll marquee, mounted once between the header and the tab
// bar so it's visible on every tab, not scoped to one. Same tricks as the original — duplicate
// the item list so a -50% translateX loops seamlessly, scale animation duration off item count,
// pause on hover. Clicking jumps to the All Matchups tab, same "click ticker -> jump to the
// relevant tab" convention as the original's onHRClick.
export default function GoalTicker({ onClick }) {
  const [items, setItems] = useState(null);

  useEffect(() => {
    fetchScoredPool().then(({ players }) => {
      const top = [...players]
        .filter((p) => p.opponentGoalie)
        .sort((a, b) => b.slapScore - a.slapScore)
        .slice(0, 15);
      setItems(top);
    });
  }, []);

  if (items && items.length === 0) return null;

  const duration = items ? Math.max(items.length * 8, 40) : 40;
  const doubled = items ? [...items, ...items] : [];

  return (
    <div className="ticker-wrap" onClick={onClick}>
      <div className="ticker-label">🏒 TOP MATCHUPS</div>
      <div className="ticker-viewport">
        {!items ? (
          <div className="ticker-loading mono">Loading today's top matchups…</div>
        ) : (
          <div className="ticker-track" style={{ animationDuration: `${duration}s` }}>
            {doubled.map((p, i) => (
              <span className="ticker-item mono" key={i}>
                <b style={{ color: "var(--accent2)" }}>{p.name}</b> {p.slapScore} Slap Score
                <span className="ticker-sep"> · </span>
                vs {p.opponentGoalie}
                {p.goalieGrade && <span className="ticker-sep"> ({p.goalieGrade.letter})</span>}
                <span className="ticker-sep">   ⬥   </span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
