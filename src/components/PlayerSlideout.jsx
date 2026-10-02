import { fmtToi } from "../lib/toi.js";
import { positionLabel } from "../lib/positionFilter.js";
import { useEffect, useState } from "react";
import { registerSlide, closeAllSlides, openGoalieSlide } from "../slideouts.js";
import L7Chart from "./L7Chart.jsx";
import PlayerAvatar from "./PlayerAvatar.jsx";
import GradeBadge from "./GradeBadge.jsx";

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

// The matchup card — skater vs the specific goalie they're facing, per direct user feedback
// ("every page missing the actual opposing goalie and the goalie's grade"). Modeled on Going
// Yard's real MatchupCard placement (mlb_project/going-yard/src/App.jsx:1901+) inside the
// player slideout, adapted to actually pair the two photos side by side.
function MatchupCard({ p }) {
  if (!p.opponentGoalie) return null;
  return (
    <div className="card">
      <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>
        Today's Matchup
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <PlayerAvatar playerId={p.playerId} name={p.name} team={p.team} size={44} />
        <div style={{ flex: 1, textAlign: "center" }}>
          <div className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>vs</div>
          <GradeBadge grade={p.effectiveGrade} />
        </div>
        <div
          className="clickable"
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer" }}
          onClick={() => openGoalieSlide({ playerId: p.opponentGoalieId, name: p.opponentGoalie, team: p.opponentTeam })}
        >
          <PlayerAvatar playerId={p.opponentGoalieId} name={p.opponentGoalie} team={p.opponentTeam} size={44} />
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
        <span className="mono" style={{ fontSize: 11 }}>{p.name}</span>
        <span className="mono" style={{ fontSize: 11 }}>{p.opponentGoalie} <GradeBadge grade={p.goalieGrade} /></span>
      </div>
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
      <StatRow label="Position" value={positionLabel(p.position)} />
      <StatRow label="Est. TOI tonight" value={fmtToi(p.estToi)} />
      <StatRow label="PP TOI / game" value={fmtToi(p.ppToi)} />
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
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
              <PlayerAvatar playerId={player.playerId} name={player.name} team={player.team} size={56} />
              <div>
                <div className="section-title" style={{ fontSize: 20 }}>{player.name}</div>
                <div className="section-sub">
                  {player.team} · {role === "goalie" ? "Goaltender" : (player.position || "Skater")}
                </div>
              </div>
            </div>

            {role === "skater" && player.tier && (
              <div style={{ display: "flex", gap: 10, margin: "12px 0", flexWrap: "wrap" }}>
                <span className={`tier-pill ${TIER_CLASS[player.tier] || "tier-ignore"}`}>{player.tier}</span>
                <div className="score-box"><span className="num mono">{player.slapScore}</span><span className="lbl">Slap Score</span></div>
                <div className="score-box"><span className="num mono">{player.gGoal}</span><span className="lbl">gGOAL</span></div>
              </div>
            )}

            {role === "skater" && <MatchupCard p={player} />}

            {role === "goalie" ? <GoalieStats p={player} /> : <SkaterStats p={player} />}

            <L7Chart games={player.last7} role={role} />
          </div>
        )}
      </div>
    </>
  );
}
