import { useEffect, useMemo, useState } from "react";
import { fetchGoalsLog } from "../lib/data.js";
import { useSort } from "../lib/useSort.js";
import { openSkaterSlide, openGoalieSlide } from "../slideouts.js";
import PlayerAvatar from "../components/PlayerAvatar.jsx";

// Ported from Going Yard's real HRTrackerTab (mlb_project/going-yard/src/App.jsx:11821-12176):
// a flat, sortable table of every real event for a selected date, native <input type="date">
// filter bounded to the real available date range, prev/next-day steppers, team-chip filter,
// search, mini stat cards, CSV export, row click -> player slideout. Adapted field-for-field per
// this session's research: batter/pitcher/inning -> scorer/goalie/period+time-in-period.
function distanceColor(d) {
  if (d == null) return "var(--text)";
  if (d <= 10) return "var(--green)";
  if (d <= 25) return "#e0b04a";
  return "var(--muted)";
}

function exportCsv(rows, date) {
  const header = ["date", "period", "timeInPeriod", "scorerName", "scorerTeam", "seasonGoalNum", "shotType", "shotDistance", "goalieName", "matchup"];
  const lines = [header.join(",")];
  for (const g of rows) {
    lines.push(header.map((h) => `"${g[h] ?? ""}"`).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `goal-tracker-${date}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function GoalTrackerTab() {
  const [all, setAll] = useState(null);
  const [meta, setMeta] = useState(null);
  const [date, setDate] = useState(null);
  const [team, setTeam] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchGoalsLog().then(({ goals, meta }) => {
      setAll(goals);
      setMeta(meta);
      setDate(meta.dateRange[1]);
    });
  }, []);

  const dayGoals = useMemo(() => (all && date ? all.filter((g) => g.date === date) : []), [all, date]);
  const teams = useMemo(() => [...new Set(dayGoals.map((g) => g.scorerTeam))].sort(), [dayGoals]);
  const filtered = useMemo(() => {
    let rows = dayGoals;
    if (team) rows = rows.filter((g) => g.scorerTeam === team || g.oppTeam === team);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((g) => g.scorerName.toLowerCase().includes(q) || g.goalieName.toLowerCase().includes(q));
    }
    return rows;
  }, [dayGoals, team, search]);

  const { sorted, sortKey, sortDir, toggleSort } = useSort(filtered, "elapsedSeconds", "desc");

  function stepDate(delta) {
    if (!meta) return;
    const idx = meta.availableDates.indexOf(date);
    const next = meta.availableDates[idx + delta];
    if (next) setDate(next);
  }

  const stats = useMemo(() => {
    if (!dayGoals.length) return null;
    const withDist = dayGoals.filter((g) => g.shotDistance != null);
    const avgDist = withDist.length ? withDist.reduce((s, g) => s + g.shotDistance, 0) / withDist.length : null;
    const longest = withDist.length ? withDist.reduce((a, b) => (b.shotDistance > a.shotDistance ? b : a)) : null;
    const scorerCounts = {};
    for (const g of dayGoals) scorerCounts[g.scorerName] = (scorerCounts[g.scorerName] || 0) + 1;
    const hatTricks = Object.values(scorerCounts).filter((c) => c >= 3).length;
    return { total: dayGoals.length, avgDist, longest, hatTricks };
  }, [dayGoals]);

  if (!all || !meta) {
    return <div className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>Loading goal log…</div>;
  }

  return (
    <div>
      <div className="section-header">
        <div className="section-title">🚨 Goal Tracker</div>
        <div className="section-sub">Every real goal from the 2025-26 season shot log — who scored, against who, when</div>
      </div>

      <div className="card" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button className="btn" onClick={() => stepDate(-1)} disabled={meta.availableDates.indexOf(date) <= 0}>◀</button>
        <input
          type="date"
          value={date || ""}
          min={meta.dateRange[0]}
          max={meta.dateRange[1]}
          onChange={(e) => {
            // snap to nearest real available date on or before the picked one
            const picked = e.target.value;
            const candidate = [...meta.availableDates].reverse().find((d) => d <= picked) || meta.availableDates[0];
            setDate(candidate);
          }}
          className="mono"
          style={{ background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 9px", fontSize: 12 }}
        />
        <button className="btn" onClick={() => stepDate(1)} disabled={meta.availableDates.indexOf(date) >= meta.availableDates.length - 1}>▶</button>
        <button className="btn" onClick={() => setDate(meta.dateRange[1])}>↩ Latest</button>
        <input
          className="mono"
          placeholder="Search scorer or goalie…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 9px", fontSize: 12, flex: 1, minWidth: 160 }}
        />
        <button className="btn" onClick={() => exportCsv(sorted, date)} disabled={!sorted.length}>⬇ Export CSV</button>
      </div>

      {teams.length > 0 && (
        <div className="pill-row" style={{ marginBottom: 14, marginTop: 10, display: "inline-flex", flexWrap: "wrap" }}>
          <button className={`pill-btn ${!team ? "active" : ""}`} onClick={() => setTeam(null)}>All</button>
          {teams.map((t) => (
            <button key={t} className={`pill-btn ${team === t ? "active" : ""}`} onClick={() => setTeam(t)}>{t}</button>
          ))}
        </div>
      )}

      {stats && (
        <div className="grid-cards" style={{ marginBottom: 14 }}>
          <div className="card"><div className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>GOALS THIS DATE</div><div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Oswald',sans-serif" }}>{stats.total}</div></div>
          <div className="card"><div className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>AVG DISTANCE</div><div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Oswald',sans-serif" }}>{stats.avgDist ? stats.avgDist.toFixed(1) : "—"} ft</div></div>
          <div className="card"><div className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>LONGEST GOAL</div><div style={{ fontSize: 14, fontWeight: 700 }}>{stats.longest ? `${stats.longest.scorerName} — ${stats.longest.shotDistance}ft` : "—"}</div></div>
          <div className="card"><div className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>HAT TRICKS</div><div style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Oswald',sans-serif" }}>{stats.hatTricks}</div></div>
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th className={sortKey === "elapsedSeconds" ? "sorted" : ""} onClick={() => toggleSort("elapsedSeconds")}>Time{sortKey === "elapsedSeconds" ? (sortDir === "desc" ? " ↓" : " ↑") : ""}</th>
              <th className={sortKey === "period" ? "sorted" : ""} onClick={() => toggleSort("period")}>Per</th>
              <th className={sortKey === "scorerName" ? "sorted" : ""} onClick={() => toggleSort("scorerName")}>Scorer</th>
              <th className={sortKey === "seasonGoalNum" ? "sorted" : ""} onClick={() => toggleSort("seasonGoalNum")}>G#</th>
              <th className={sortKey === "shotType" ? "sorted" : ""} onClick={() => toggleSort("shotType")}>Type</th>
              <th className={sortKey === "shotDistance" ? "sorted" : ""} onClick={() => toggleSort("shotDistance")}>Dist</th>
              <th>Goalie</th>
              <th>Game</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((g, i) => (
              <tr key={i}>
                <td>P{g.period} {g.timeInPeriod}</td>
                <td>{g.period}</td>
                <td className="clickable" onClick={() => openSkaterSlide({ playerId: g.scorerId, name: g.scorerName, team: g.scorerTeam })}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <PlayerAvatar playerId={g.scorerId} name={g.scorerName} team={g.scorerTeam} size={24} />
                    <span className="player-name-link">{g.scorerName}</span>
                    <span className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>{g.scorerTeam}</span>
                  </div>
                </td>
                <td>{g.seasonGoalNum}</td>
                <td>{g.shotType || "—"}</td>
                <td style={{ color: distanceColor(g.shotDistance) }}>{g.shotDistance != null ? `${g.shotDistance}ft` : "—"}</td>
                <td className="clickable" onClick={() => g.goalieId && openGoalieSlide({ playerId: g.goalieId, name: g.goalieName, team: g.oppTeam })}>
                  {g.goalieId ? <span className="player-name-link">{g.goalieName}</span> : g.goalieName}
                </td>
                <td>{g.matchup}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length === 0 && <div className="mono" style={{ color: "var(--muted)", fontSize: 12, padding: 12 }}>No goals match this filter.</div>}
    </div>
  );
}
