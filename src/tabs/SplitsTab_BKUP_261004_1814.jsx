import { useState } from "react";
import { useScoredPool } from "../lib/data.js";
import { useSort } from "../lib/useSort.js";
import { openSkaterSlide, openGoalieSlide } from "../slideouts.js";
import PlayerAvatar from "../components/PlayerAvatar.jsx";
import GradeBadge from "../components/GradeBadge.jsx";
import MatchupFilter from "../components/MatchupFilter.jsx";
import PositionFilter from "../components/PositionFilter.jsx";
import { filterPositions, positionLabel, usePosition } from "../lib/positionFilter.js";
import { fmtToi } from "../lib/toi.js";
import { filterByTeam, filterPlayers, useMatchup } from "../lib/matchupFilter.js";

const SKATER_COLS = [
  ["name", "Player"], ["team", "Team"], ["position", "Pos"], ["estToi", "Est. TOI"], ["ppToi", "PP TOI/GP"], ["TotalGoals", "Goals"],
  ["ShotsOnGoalPerGame", "SOG/GP"], ["ICF", "ICF"], ["HDCF", "HDCF"],
  ["gradeScore", "Grade"], ["slapScore", "Slap Score"],
];
const GOALIE_COLS = [
  ["name", "Goalie"], ["team", "Team"], ["wins", "Wins"], ["shutouts", "Shutouts"],
  ["savePct", "Save %"], ["grade", "Grade"],
];

export default function SplitsTab() {
  const [role, setRole] = useState("skater");
  // Season numbers — every game on the slate stays listed (scratched / ruled-out skaters are dropped).
  const pool = useScoredPool({ includeStarted: true });
  const skaters = pool?.players ?? null;
  const goalies = pool?.goalies ?? null;
  const selected = useMatchup();
  const position = usePosition();

  const rows = role === "goalie" ? filterByTeam(goalies, selected) : filterPositions(filterPlayers(skaters, selected), position);
  const cols = role === "goalie" ? GOALIE_COLS : SKATER_COLS;
  const defaultKey = role === "goalie" ? "savePct" : "slapScore";
  const { sorted, sortKey, sortDir, toggleSort } = useSort(rows || [], defaultKey, "desc");

  return (
    <div>
      <div className="section-header">
        <div className="section-title">📊 Splits / Leaderboards</div>
        <div className="section-sub">Season leaderboard, skater and goalie as separate views — a goalie's stat line shares nothing with a skater's</div>
      </div>

      <div className="pill-row" style={{ marginBottom: 14, display: "inline-flex" }}>
        <button className={`pill-btn ${role === "skater" ? "active" : ""}`} onClick={() => setRole("skater")}>Skaters</button>
        <button className={`pill-btn ${role === "goalie" ? "active" : ""}`} onClick={() => setRole("goalie")}>Goalies</button>
      </div>

      <div className="note">
        ℹ️ ICF = individual unblocked shot attempts; HDCF = those from within 20 ft. Both are season totals
        (last season + this season) and feed Snipe Score and gGOAL.
      </div>
      {role === "skater" && <PositionFilter />}
      <MatchupFilter />

      {!rows && <div className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>Loading…</div>}

      {rows && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Player</th>
                {cols.slice(1).map(([key, label]) => (
                  <th key={key} className={sortKey === key ? "sorted" : ""} onClick={() => toggleSort(key)}>
                    {label}{sortKey === key ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr key={p.playerId} className="clickable" onClick={() => (role === "goalie" ? openGoalieSlide(p) : openSkaterSlide(p))}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <PlayerAvatar playerId={p.playerId} name={p.name} team={p.team} size={26} />
                      <span className="player-name-link">{p.name}</span>
                    </div>
                  </td>
                  {cols.slice(1).map(([key]) => (
                    <td key={key}>
                      {key === "gradeScore" ? <GradeBadge grade={p.effectiveGrade} />
                        : key === "grade"
                        ? <GradeBadge grade={p[key]} />
                        : key === "position" ? positionLabel(p.position)
                        : key === "estToi" || key === "ppToi" ? fmtToi(p[key])
                        : (p[key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
