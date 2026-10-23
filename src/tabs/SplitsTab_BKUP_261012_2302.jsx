import { useState } from "react";
import { useScoredPool } from "../lib/data.js";
import { useSort } from "../lib/useSort.js";
import { openSkaterSlide, openGoalieSlide } from "../slideouts.js";
import PickButton from "../components/PickButton.jsx";
import H2HCell, { H2HStatCell } from "../components/H2HCell.jsx";
import { GOALIE_H2H_COLS, SKATER_H2H_COLS, useH2HGrades, withH2H } from "../lib/h2h.js";
import PlayerAvatar from "../components/PlayerAvatar.jsx";
import GradeBadge from "../components/GradeBadge.jsx";
import MatchupFilter from "../components/MatchupFilter.jsx";
import PositionFilter from "../components/PositionFilter.jsx";
import { filterPositions, positionLabel, usePosition } from "../lib/positionFilter.js";
import { fmtToi } from "../lib/toi.js";
import { filterByTeam, filterPlayers, useMatchup } from "../lib/matchupFilter.js";

const SKATER_COLS = [
  ["name", "Player"], ["team", "Team"], ["position", "Pos"], ["estToi", "Est. TOI"], ["ppToi", "PP TOI/GP"], ["TotalGoals", "Goals"],
  ["ShotsOnGoalPerGame", "SOG/GP"], ["sog60", "SOG/60", "Shots on goal per 60 minutes of ice time"], ["ICF", "ICF"], ["HDCF", "HDCF"],
  ["gradeScore", "Grade"], ["slapScore", "Slap Score"], ["h2hScore", "H2H vs tonight"],
  // [key, label, tooltip, H2H stat] — goal-game rates (lib/h2h.js withH2H)
  ...SKATER_H2H_COLS.map(([k, stat, label, title]) => [k, label, title, stat]),
];
const GOALIE_COLS = [
  ["name", "Goalie"], ["team", "Team"], ["wins", "Wins"], ["shutouts", "Shutouts"],
  ["savePct", "Save %"], ["grade", "Grade"], ["h2hScore", "H2H vs tonight"],
  ...GOALIE_H2H_COLS.map(([k, stat, label, title]) => [k, label, title, stat]),
];

export default function SplitsTab() {
  const [role, setRole] = useState("skater");
  // Season numbers — every game on the slate stays listed (scratched / ruled-out skaters are dropped).
  const pool = useScoredPool({ includeStarted: true });
  const skaters = pool?.players ?? null;
  const goalies = pool?.goalies ?? null;
  const selected = useMatchup();
  const position = usePosition();

  const h2hGrades = useH2HGrades();
  const base = role === "goalie" ? filterByTeam(goalies, selected) : filterPositions(filterPlayers(skaters, selected), position);
  // H2H grade + H2H / venue / L5 / L10 rates for sorting (missing = sorts last).
  const rows = withH2H(base, h2hGrades, role === "goalie");
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
                {cols.slice(1).map(([key, label, title]) => (
                  <th key={key} title={title} className={sortKey === key ? "sorted" : ""} onClick={() => toggleSort(key)}>
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
                      {role !== "goalie" && <PickButton player={p} />}
                    </div>
                  </td>
                  {cols.slice(1).map(([key, , , stat]) => (
                    <td key={key}>
                      {stat ? <H2HStatCell playerId={p.playerId} stat={stat} goalie={role === "goalie"} />
                        : key === "h2hScore" ? <H2HCell playerId={p.playerId} goalie={role === "goalie"} />
                        : key === "gradeScore" ? <GradeBadge grade={p.effectiveGrade} />
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
