import { useEffect, useMemo, useState } from "react";
import { fetchScoredPool } from "../lib/data.js";
import { useSort } from "../lib/useSort.js";
import { openGoalieSlide } from "../slideouts.js";
import PlayerAvatar from "../components/PlayerAvatar.jsx";
import GradeBadge from "../components/GradeBadge.jsx";
import MatchupFilter from "../components/MatchupFilter.jsx";
import { matchupKey, useMatchup } from "../lib/matchupFilter.js";
import { lineupMaps, startingGoalie, useLineups } from "../lib/lineups.js";
import { projectGoalie, SAVE_LINES } from "../lib/crease.js";
import CreaseLabLive from "../components/CreaseLabLive.jsx";

// Crease Lab — tonight's starting goalies with projected shots against, saves and goals allowed
// (lib/crease.js, backtested on 2025-26), most projected saves first.
const fmtPct = (v) => (v == null ? "—" : `${v}%`);
const sv = (v) => (v == null ? "—" : v.toFixed(3).replace(/^0/, ""));

export default function CreaseLabTab() {
  const [pool, setPool] = useState(null);
  const [confirmedOnly, setConfirmedOnly] = useState(false);
  const [view, setView] = useState("projected");
  const selected = useMatchup();
  const lineups = useLineups(pool?.meta?.slateDate);

  useEffect(() => {
    fetchScoredPool().then(setPool);
  }, []);

  const rows = useMemo(() => {
    if (!pool) return [];
    const maps = lineupMaps(lineups);
    const byId = new Map(pool.goalies.map((g) => [g.playerId, g]));
    return (pool.meta.slate || []).flatMap((game) => [game.away, game.home].map((team) => {
      const opp = team === game.away ? game.home : game.away;
      const s = startingGoalie(team, game, maps);
      if (!s) return null;
      const stats = byId.get(s.playerId);
      const proj = projectGoalie(stats, team, opp, pool.meta);
      return {
        playerId: s.playerId, name: stats?.name || s.name, team, opp, isHome: team === game.home,
        matchup: matchupKey(game.away, game.home), startTimeUTC: game.startTimeUTC,
        confirmed: s.confirmed, status: s.status, source: s.source, grade: stats?.grade || null,
        seasonSv: stats?.savePct ?? null, ga60: stats?.GA60_proxy ?? null, games: stats?.games_played ?? 0,
        ...proj, projSv: proj.savePct,
        p20: proj.lines[20], p25: proj.lines[25], p30: proj.lines[30], p35: proj.lines[35],
        stats,
      };
    })).filter(Boolean);
  }, [pool, lineups]);

  const shown = useMemo(
    () => rows.filter((r) => (!selected || r.matchup === selected) && (!confirmedOnly || r.confirmed)),
    [rows, selected, confirmedOnly]
  );
  const { sorted, sortKey, sortDir, toggleSort } = useSort(shown, "saves", "desc");

  if (!pool) return <div className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>Loading…</div>;

  const th = (k, label) => (
    <th key={k} className={sortKey === k ? "sorted" : ""} onClick={() => toggleSort(k)}>
      {label}{sortKey === k ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
    </th>
  );
  const top = [...shown].sort((a, b) => b.saves - a.saves).slice(0, 3);

  return (
    <div>
      <div className="section-header">
        <div className="section-title">🥅 Crease Lab</div>
        <div className="section-sub">
          {view === "live"
            ? "Tonight's goalies live — ranked by saves, projection in parentheses"
            : "Tonight's starting goalies — projected shots against, saves and goals allowed, most saves first"}
        </div>
      </div>

      <div className="pill-row" style={{ display: "inline-flex", marginBottom: 12 }}>
        <button className={`pill-btn ${view === "projected" ? "active" : ""}`} onClick={() => setView("projected")}>📋 Projected</button>
        <button className={`pill-btn ${view === "live" ? "active" : ""}`} onClick={() => setView("live")}>🔴 Live (actual)</button>
      </div>

      {view === "live" ? <CreaseLabLive date={pool.meta.slateDate} fallback={rows} /> : <>

      <div className="note">
        ℹ️ Shots against = opponent's shots per game × this team's shots allowed per game ÷ league average,
        pulled 20% toward average. Save % is the goalie's own, blended with 500 shots of league average.
        Backtested on last season: projected saves were off by about 5 per game on average, and the 20+/25+/30+
        save odds matched what happened. ✅ = confirmed starter; otherwise expected.
      </div>

      <div className="pill-row" style={{ display: "inline-flex", marginBottom: 12, marginRight: 10 }}>
        <button className={`pill-btn ${!confirmedOnly ? "active" : ""}`} onClick={() => setConfirmedOnly(false)}>All starters</button>
        <button className={`pill-btn ${confirmedOnly ? "active" : ""}`} onClick={() => setConfirmedOnly(true)}>✅ Confirmed only</button>
      </div>
      <MatchupFilter />

      {top.length > 0 && (
        <div className="top-reads">
          {top.map((r) => (
            <div key={`${r.team}-${r.name}`} className="read-card" onClick={() => r.playerId && openGoalieSlide(r.stats || { playerId: r.playerId, name: r.name, team: r.team })}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <PlayerAvatar playerId={r.playerId} name={r.name} team={r.team} size={36} />
                <div>
                  <div className="mono" style={{ fontSize: 12, fontWeight: 700 }}>{r.name} {r.confirmed ? "✅" : ""}</div>
                  <div className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>{r.team} {r.isHome ? "vs" : "@"} {r.opp}</div>
                </div>
              </div>
              <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 800, fontSize: 24 }}>{r.saves} saves</div>
              <div className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>
                {r.shots} shots · {r.goalsAllowed} GA · 25+ saves {fmtPct(r.p25)}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Goalie</th>
              {th("saves", "Proj saves")}
              {th("shots", "Proj shots against")}
              {th("goalsAllowed", "Proj GA")}
              {th("projSv", "Proj SV%")}
              {SAVE_LINES.map((n) => th(`p${n}`, `${n}+ saves`))}
              {th("seasonSv", "Season SV%")}
              {th("ga60", "GA60")}
              <th>Grade</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={`${r.team}-${r.name}`}>
                <td className="clickable" onClick={() => r.playerId && openGoalieSlide(r.stats || { playerId: r.playerId, name: r.name, team: r.team })}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <PlayerAvatar playerId={r.playerId} name={r.name} team={r.team} size={28} />
                    <div>
                      <span className="player-name-link">{r.name}</span> {r.confirmed ? <span title={`Confirmed (${r.source})`}>✅</span> : null}
                      <div className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>
                        {r.team} {r.isHome ? "vs" : "@"} {r.opp} · {r.confirmed ? "confirmed" : r.status || "projected"}
                        {r.sample < 300 ? " · small NHL sample" : ""}
                      </div>
                    </div>
                  </div>
                </td>
                <td style={{ fontWeight: 800 }}>{r.saves}</td>
                <td>{r.shots}</td>
                <td>{r.goalsAllowed}</td>
                <td>{sv(r.projSv)}</td>
                {SAVE_LINES.map((n) => <td key={n}>{fmtPct(r[`p${n}`])}</td>)}
                <td>{sv(r.seasonSv)}</td>
                <td>{r.ga60 ?? "—"}</td>
                <td>{r.grade ? <GradeBadge grade={r.grade} /> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length === 0 && <div className="mono" style={{ color: "var(--muted)", fontSize: 12, padding: 12 }}>No starters match these filters yet.</div>}
      </>}
    </div>
  );
}
