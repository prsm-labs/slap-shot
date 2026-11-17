import { dueHeatText } from "../lib/dueHeat.js";
import { STREAK } from "../lib/edges.js";
import { assistShare } from "../lib/calibration.js";

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

// 2026-11-17 style badge (user): 🅰️ playmaker / 🎯 pure shooter -- assist share of his points (last + this season) in the top / bottom third
// of his position (lib/calibration.js assistShare). The playmaker side is in the assist chance (ASSIST_SPEC); the shooter side is a label.
export function StyleTag({ p }) {
  const s = p?.modelProbs?.aSpec ?? assistShare(p);
  if (!s?.kind) return null;
  const play = s.kind === "playmaker";
  const pct = Math.round((play ? s.share : 1 - s.share) * 100);
  return (
    <span className="mono" title={play ? `Playmaker: ${pct}% of his points are assists (top third of his position)` : `Pure shooter: ${pct}% of his points are goals (top third of his position)`}
      style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, border: "1px solid var(--line2)", color: "var(--muted)", marginLeft: 4, whiteSpace: "nowrap" }}>
      {play ? "🅰️" : "🎯"}
    </span>
  );
}
