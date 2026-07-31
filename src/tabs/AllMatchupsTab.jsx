import { useEffect, useState } from "react";
import { fetchScoredPool } from "../lib/data.js";
import { useSort } from "../lib/useSort.js";
import { openSkaterSlide } from "../slideouts.js";
import PlayerAvatar from "../components/PlayerAvatar.jsx";
import GradeBadge from "../components/GradeBadge.jsx";
import OpponentGoalieCell from "../components/OpponentGoalieCell.jsx";

const TIER_CLASS = {
  "Elite Add-On": "tier-elite",
  "Core Target": "tier-core",
  "Value Upside": "tier-value",
  Ignore: "tier-ignore",
};

// Matchup-first columns — deliberately NOT a season-stat dump (that's what Splits is for).
// Every row answers "who are they facing and how does that change things," per direct user
// feedback: goalies should read like a pitcher matchup, not a footnote.
const COLUMNS = [
  ["name", "Skater"],
  ["opponentGoalie", "Opp Goalie"],
  ["effectiveGrade", "Eff. Grade"],
  ["slapScore", "Slap Score"],
  ["tier", "Tier"],
];

export default function AllMatchupsTab() {
  const [players, setPlayers] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchScoredPool()
      .then(({ players }) => setPlayers(players))
      .catch((e) => setError(String(e)));
  }, []);

  const { sorted, sortKey, sortDir, toggleSort } = useSort(players || [], "slapScore", "desc");

  return (
    <div>
      <div className="section-header">
        <div className="section-title">🏒 All Matchups</div>
        <div className="section-sub">Today's slate, ranked by matchup — skater vs. the goalie they're actually facing</div>
      </div>

      <div className="note">
        ℹ️ Ranked by Slap Score, a single 0-99 score blending recent form, shot quality, and this specific goalie matchup.
      </div>
      {error && <div className="note" style={{ borderColor: "var(--red)", color: "var(--red)" }}>Failed to load pool: {error}</div>}
      {!players && !error && <div className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>Loading and scoring pool…</div>}

      {players && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {COLUMNS.map(([key, label]) => (
                  <th key={key} className={sortKey === key ? "sorted" : ""} onClick={() => key !== "opponentGoalie" && toggleSort(key)}>
                    {label}{sortKey === key ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr key={p.playerId}>
                  <td className="clickable" onClick={() => openSkaterSlide(p)}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <PlayerAvatar playerId={p.playerId} name={p.name} team={p.team} size={28} />
                      <div>
                        <span className="player-name-link">{p.name}</span>
                        <div className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>{p.team}</div>
                      </div>
                    </div>
                  </td>
                  <td><OpponentGoalieCell player={p} /></td>
                  <td><GradeBadge grade={p.effectiveGrade} /></td>
                  <td>{p.slapScore}</td>
                  <td><span className={`tier-pill ${TIER_CLASS[p.tier] || "tier-ignore"}`}>{p.tier}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
