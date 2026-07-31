import { useEffect, useState } from "react";
import { registerSlide, closeAllSlides } from "../slideouts.js";
import L7Chart from "./L7Chart.jsx";

const TIER_CLASS = {
  "Elite Add-On": "tier-elite",
  "Core Target": "tier-core",
  "Value Upside": "tier-value",
  Ignore: "tier-ignore",
};

function StatRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
      <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{label}</span>
      <span className="mono" style={{ fontSize: 12, color: "var(--text)", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

// Season stat line branches by role — skater vs goalie — per slap-shot-build.md §6, the hockey
// equivalent of Six Points' QB/RB/WR branching (a goalie's stat line shares nothing with a
// skater's).
function SkaterStats({ p }) {
  return (
    <div className="card">
      <StatRow label="Team" value={p.team} />
      <StatRow label="Games Played" value={p.games_played} />
      <StatRow label="Goals" value={p.TotalGoals} />
      <StatRow label="Shots on Goal" value={p.ShotsOnGoalPerGame != null ? `${p.ShotsOnGoalPerGame}/gm` : "—"} />
      <StatRow label="ICF (Individual Corsi For)" value={p.ICF} />
      <StatRow label="HDCF (High-Danger)" value={p.HDCF} />
      <StatRow label="Avg Shot Distance" value={p.AvgShotDistance != null ? `${p.AvgShotDistance} ft` : "—"} />
      <StatRow label="Goals, Last 5 GP" value={p.Goals_Last5} />
    </div>
  );
}

// Goaltending is famously streaky — weight recency more heavily than a skater's shrinkage-
// toward-season stat line (per §6): last-7 save% shown alongside season, not smoothed into it.
function GoalieStats({ p }) {
  return (
    <div className="card">
      <StatRow label="Team" value={p.team} />
      <StatRow label="Games Played" value={p.games_played} />
      <StatRow label="Wins" value={p.wins} />
      <StatRow label="Shutouts" value={p.shutouts} />
      <StatRow label="Save %" value={p.savePct != null ? p.savePct.toFixed(3) : "—"} />
      <StatRow label="Shots Faced" value={p.shotsFaced} />
      <StatRow label="Goals Allowed" value={p.goalsAllowed} />
    </div>
  );
}

export default function PlayerSlideout() {
  const [skater, setSkater] = useState(null);
  const [goalie, setGoalie] = useState(null);

  useEffect(() => registerSlide("skater", setSkater), []);
  useEffect(() => registerSlide("goalie", setGoalie), []);

  const player = skater || goalie;
  const isOpen = !!player;
  const role = goalie ? "goalie" : "skater";

  return (
    <>
      <div className={`slide-backdrop ${isOpen ? "open" : ""}`} onClick={closeAllSlides} />
      <div className={`slide-panel ${isOpen ? "open" : ""}`}>
        <button className="slide-close" onClick={closeAllSlides}>✕ Close</button>
        {player && (
          <div style={{ marginTop: 28 }}>
            <div className="section-title" style={{ fontSize: 20 }}>{player.name}</div>
            <div className="section-sub" style={{ marginBottom: 12 }}>
              {player.team} · {role === "goalie" ? "Goaltender" : (player.position || "Skater")}
            </div>

            {role === "skater" && player.tier && (
              <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                <span className={`tier-pill ${TIER_CLASS[player.tier] || "tier-ignore"}`}>{player.tier}</span>
                <div className="score-box"><span className="num mono">{player.slapScore}</span><span className="lbl">Slap Score</span></div>
                <div className="score-box"><span className="num mono">{player.gGoal}</span><span className="lbl">gGOAL</span></div>
              </div>
            )}

            {role === "goalie" ? <GoalieStats p={player} /> : <SkaterStats p={player} />}

            <L7Chart games={player.last7} role={role} />
          </div>
        )}
      </div>
    </>
  );
}
