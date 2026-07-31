import { useEffect, useState } from "react";
import { fetchGoalsLog } from "../lib/data.js";

// Ported from Going Yard's real HRTicker (mlb_project/going-yard/src/App.jsx:11730-11779, CSS
// at 344-352): a CSS-only infinite-scroll marquee, mounted once between the header and the tab
// bar so it's visible on every tab, not scoped to one. Same tricks as the original — duplicate
// the item list so a -50% translateX loops seamlessly, scale animation duration off item count,
// pause on hover.
//
// Shows REAL goals that were actually scored, not a Slap Score prediction leaderboard — per
// direct user feedback ("it should show goals scored in game vs who... not slap scores"), same
// as Going Yard's ticker showing real home runs, not projected ones. Clicking jumps to the new
// Goal Tracker tab (the real-goals table), same "click ticker -> jump to the matching tab"
// convention as the original's onHRClick -> "homeruns" tab.
export default function GoalTicker({ onClick }) {
  const [items, setItems] = useState(null);

  useEffect(() => {
    fetchGoalsLog().then(({ goals, meta }) => {
      const latestDate = meta.dateRange[1];
      const todays = goals.filter((g) => g.date === latestDate);
      setItems(todays);
    });
  }, []);

  if (items && items.length === 0) return null;

  const duration = items ? Math.max(items.length * 8, 40) : 40;
  const doubled = items ? [...items, ...items] : [];

  return (
    <div className="ticker-wrap" onClick={onClick}>
      <div className="ticker-label">🚨 GOALS</div>
      <div className="ticker-viewport">
        {!items ? (
          <div className="ticker-loading mono">Loading real goals…</div>
        ) : (
          <div className="ticker-track" style={{ animationDuration: `${duration}s` }}>
            {doubled.map((g, i) => (
              <span className="ticker-item mono" key={i}>
                <b style={{ color: "var(--accent2)" }}>{g.scorerName}</b> ({g.scorerTeam}) scored vs {g.goalieName}
                <span className="ticker-sep"> · </span>
                P{g.period} {g.timeInPeriod}
                <span className="ticker-sep">   ⬥   </span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
