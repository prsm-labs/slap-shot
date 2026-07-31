import { useEffect, useState } from "react";
import { fetchScoredPool } from "../lib/data.js";
import { useSort } from "../lib/useSort.js";
import { openSkaterSlide, openGoalieSlide } from "../slideouts.js";

const SKATER_COLS = [
  ["name", "Player"], ["team", "Team"], ["TotalGoals", "Goals"],
  ["ShotsOnGoalPerGame", "SOG/GP"], ["ICF", "ICF"], ["HDCF", "HDCF"], ["slapScore", "Slap Score"],
];
const GOALIE_COLS = [
  ["name", "Goalie"], ["team", "Team"], ["wins", "Wins"], ["shutouts", "Shutouts"],
  ["savePct", "Save %"], ["GA60_proxy", "GA60"],
];

export default function SplitsTab() {
  const [role, setRole] = useState("skater");
  const [skaters, setSkaters] = useState(null);
  const [goalies, setGoalies] = useState(null);

  useEffect(() => {
    fetchScoredPool().then(({ players }) => setSkaters(players));
    fetch("/data/todays_pool.json").then((r) => r.json()).then((d) => setGoalies(d.goalies));
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
                {cols.map(([key, label]) => (
                  <th key={key} className={sortKey === key ? "sorted" : ""} onClick={() => toggleSort(key)}>
                    {label}{sortKey === key ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr key={p.playerId} className="clickable" onClick={() => (role === "goalie" ? openGoalieSlide(p) : openSkaterSlide(p))}>
                  {cols.map(([key]) => (
                    <td key={key}>{key === "name" ? <span className="player-name-link">{p[key]}</span> : (p[key] ?? "—")}</td>
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
