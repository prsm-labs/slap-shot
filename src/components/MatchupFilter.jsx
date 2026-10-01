import { useEffect, useState } from "react";
import { fetchScoredPool } from "../lib/data.js";
import { matchupKey, setMatchup, toggleMatchup, useMatchup } from "../lib/matchupFilter.js";

// Chip row for picking one matchup. Defaults to today's slate (from the pool's _meta.slate);
// pass `games` ([{ away, home }]) to use another list, e.g. the Goal Tracker's selected date.
export default function MatchupFilter({ games }) {
  const selected = useMatchup();
  const [slate, setSlate] = useState(null);

  useEffect(() => {
    if (games) return;
    fetchScoredPool().then(({ meta }) => setSlate(meta?.slate || [])).catch(() => setSlate([]));
  }, [games]);

  const list = games || slate || [];
  if (!list.length) return null;
  const keys = list.map((g) => matchupKey(g.away, g.home));
  const outside = selected && !keys.includes(selected);

  return (
    <div className="pill-row" style={{ display: "inline-flex", flexWrap: "wrap", marginBottom: 12 }}>
      <button className={`pill-btn ${!selected ? "active" : ""}`} onClick={() => setMatchup(null)}>All games</button>
      {keys.map((k) => (
        <button key={k} className={`pill-btn ${selected === k ? "active" : ""}`} onClick={() => toggleMatchup(k)}>
          {k.replace("@", " @ ")}
        </button>
      ))}
      {outside && (
        <button className="pill-btn active" onClick={() => setMatchup(null)} title="Not on this list — click to clear">
          {selected.replace("@", " @ ")} ✕
        </button>
      )}
    </div>
  );
}
