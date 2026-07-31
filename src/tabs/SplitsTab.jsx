import { useEffect, useState } from "react";
import { fetchScoredPool } from "../lib/data.js";
import { useSort } from "../lib/useSort.js";
import { openSkaterSlide, openGoalieSlide } from "../slideouts.js";
import PlayerAvatar from "../components/PlayerAvatar.jsx";
import GradeBadge from "../components/GradeBadge.jsx";

const SKATER_COLS = [
  ["name", "Player"], ["team", "Team"], ["TotalGoals", "Goals"],
  ["ShotsOnGoalPerGame", "SOG/GP"], ["baseGrade", "Grade"], ["slapScore", "Slap Score"],
];
const GOALIE_COLS = [
  ["name", "Goalie"], ["team", "Team"], ["wins", "Wins"], ["shutouts", "Shutouts"],
  ["savePct", "Save %"], ["grade", "Grade"],
];

export default function SplitsTab() {
  const [role, setRole] = useState("skater");
  const [skaters, setSkaters] = useState(null);
  const [goalies, setGoalies] = useState(null);

  useEffect(() => {
    fetchScoredPool().then(({ players, goalies }) => { setSkaters(players); setGoalies(goalies); });
  }, []);

  const rows = role === "goalie" ? goalies : skaters;
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
                      {key === "baseGrade" || key === "grade"
                        ? <GradeBadge grade={p[key]} />
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
