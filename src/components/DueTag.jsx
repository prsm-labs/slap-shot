import { dueHeatText } from "../lib/dueHeat.js";
import { STREAK } from "../lib/edges.js";

// 🔥 DUE tag (lib/dueHeat.js): no goal in 2+ games, expected goals rising, soft defense tonight, not a top scorer.
export default function DueTag({ due }) {
  if (!due) return null;
  return (
    <span className="mono" title={dueHeatText(due)}
      style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, border: "1px solid var(--accent)", color: "var(--accent2)", marginLeft: 4, whiteSpace: "nowrap" }}>
      🔥 DUE
    </span>
  );
}

// 2026-11-03 🧊 Streak check (lib/edges.js): hot run into a defense that isn't soft -- caution only, his chance is unchanged
export function StreakTag({ p }) {
  const s = p?.streakCheck;
  if (!s) return null;
  return (
    <span className="mono" title={`${STREAK.title}. Last 5: ${s.l5} pts (usual ${(s.ppg * 5).toFixed(1)}); ${p.opponentTeam} D ${s.rank} of ${s.n} by expected goals allowed (1 = softest).`}
      style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, border: "1px solid var(--warn)", color: "var(--warn)", marginLeft: 4, whiteSpace: "nowrap" }}>
      🧊 STREAK?
    </span>
  );
}
