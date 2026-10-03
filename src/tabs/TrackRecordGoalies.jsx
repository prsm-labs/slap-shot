import { useEffect, useMemo, useState } from "react";
import { useSort } from "../lib/useSort.js";
import { openGoalieSlide } from "../slideouts.js";
import PlayerAvatar from "../components/PlayerAvatar.jsx";
import MatchupFilter from "../components/MatchupFilter.jsx";
import { useMatchup } from "../lib/matchupFilter.js";
import { SAVE_LINES } from "../lib/crease.js";
import { RankCell } from "../components/CreaseLabLive.jsx";

// Track Record — Goalies: each night's Crease Lab projection (saved before puck drop by
// scripts/snapshot_projections.mjs) against the real starter's box line (build_track_record.py
// → track_record_2026.json "goalieRows").
const shortDate = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const fmt = (v, d = 1) => (v == null ? "—" : v.toFixed(d));
const sv = (v) => (v == null ? "—" : v.toFixed(3).replace(/^0/, ""));

function flatten(g) {
  const a = g.actual || {};
  const actSv = a.shotsAgainst ? a.saves / a.shotsAgainst : null;
  return {
    ...g,
    key: `${g.date}-${g.team}`,
    projGoalie: g.proj.goalie, projSaves: g.proj.saves, projShots: g.proj.shots, projGA: g.proj.goalsAllowed,
    projSv: g.proj.savePct, confirmed: g.proj.confirmed,
    actGoalie: a.goalie, actSaves: a.saves ?? null, actShots: a.shotsAgainst ?? null, actGA: a.goalsAgainst ?? null,
    actSv, pulled: Boolean(a.pulled), teamShots: a.teamShotsAgainst ?? null,
    savesDiff: a.saves != null ? a.saves - g.proj.saves : null,
    rank: a.rank ?? null, slateGoalies: a.slateGoalies ?? null,
  };
}

function Tile({ label, value, sub }) {
  return (
    <div className="signal-tile">
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

export default function TrackRecordGoalies() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [date, setDate] = useState(null);
  const [rightStarterOnly, setRightStarterOnly] = useState(false);
  const selected = useMatchup();

  useEffect(() => {
    fetch("/data/track_record_2026.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        setData(d);
        const ds = [...new Set((d.goalieRows || []).map((g) => g.date))].sort();
        setDate(ds[ds.length - 1] || null);
      })
      .catch((e) => setError(String(e.message || e)));
  }, []);

  const all = useMemo(() => {
    const rows = (data?.goalieRows || []).filter((g) => g.actual).map(flatten);
    // projRank = where the pre-game projection had this starter in saves that night.
    for (const r of rows) {
      r.projRank = 1 + rows.filter((o) => o.date === r.date && o.projSaves > r.projSaves).length;
    }
    return rows;
  }, [data]);
  const dates = useMemo(() => [...new Set(all.map((g) => g.date))].sort(), [all]);
  const dayRows = useMemo(() => (date ? all.filter((g) => g.date === date) : all), [all, date]);
  const dayGames = useMemo(
    () => (date ? [...new Set(dayRows.map((g) => g.matchup))].sort().map((m) => ({ away: m.split("@")[0], home: m.split("@")[1] })) : []),
    [date, dayRows]
  );
  const gameFilter = date && selected && dayGames.some((g) => `${g.away}@${g.home}` === selected) ? selected : null;
  const scope = useMemo(
    () => dayRows.filter((g) => (!gameFilter || g.matchup === gameFilter) && (!rightStarterOnly || g.sameGoalie)),
    [dayRows, gameFilter, rightStarterOnly]
  );
  const { sorted, sortKey, sortDir, toggleSort } = useSort(scope, "rank", "asc");

  const stats = useMemo(() => {
    const right = scope.filter((g) => g.sameGoalie);
    const lines = SAVE_LINES.map((n) => ({
      n,
      predicted: avg(right.map((g) => g.proj.lines[n])),
      actual: right.length ? (100 * right.filter((g) => g.actSaves >= n).length) / right.length : null,
      count: right.length,
    }));
    return {
      n: scope.length,
      starterRight: right.length,
      savesMae: avg(scope.map((g) => Math.abs(g.savesDiff))),
      savesBias: avg(scope.map((g) => -g.savesDiff)),
      shotsMae: avg(scope.map((g) => Math.abs(g.projShots - g.teamShots))),
      gaMae: avg(scope.map((g) => Math.abs(g.projGA - g.actGA))),
      projSavesAvg: avg(scope.map((g) => g.projSaves)),
      actSavesAvg: avg(scope.map((g) => g.actSaves)),
      lines,
    };
  }, [scope]);

  if (error) return <div className="note" style={{ borderColor: "var(--red)", color: "var(--red)" }}>Couldn't load the goalie track record: {error}</div>;
  if (!data) return <div className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>Loading…</div>;
  if (!dates.length) return <div className="note">No graded goalie nights yet — the first is graded the morning after its games.</div>;

  const idx = date ? dates.indexOf(date) : -1;
  const th = (k, label) => (
    <th key={k} className={sortKey === k ? "sorted" : ""} onClick={() => toggleSort(k)}>
      {label}{sortKey === k ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
    </th>
  );
  const leaders = scope.filter((g) => g.rank === 1);
  const backfilled = [...new Set(all.filter((g) => g.backfilled).map((g) => shortDate(g.date)))];

  return (
    <div>
      <div className="card" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button className="btn" onClick={() => setDate(dates[Math.max(idx - 1, 0)])} disabled={!date || idx <= 0}>◀</button>
        <span className="mono" style={{ fontSize: 12, minWidth: 120, textAlign: "center" }}>
          {date ? new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }) : `Season — ${dates.length} nights`}
        </span>
        <button className="btn" onClick={() => setDate(dates[Math.min(idx + 1, dates.length - 1)])} disabled={!date || idx >= dates.length - 1}>▶</button>
        <button className={`pill-btn ${!date ? "active" : ""}`} onClick={() => setDate(date ? null : dates[dates.length - 1])}>
          {date ? "Whole season" : "Back to one night"}
        </button>
        <button className={`pill-btn ${rightStarterOnly ? "active" : ""}`} onClick={() => setRightStarterOnly((v) => !v)}>
          Correct starter only
        </button>
      </div>

      <div className="note">
        ℹ️ Each team's Crease Lab projection, saved before puck drop, against the goalie who actually started.
        Saves, shots and goals against are the starter's own (if he was pulled, his partial line).
        Rank = place in saves among every goalie who played that night (👑 = most saves; the same ranking
        Crease Lab's Live view shows during the games). Proj rank = where the projection had him.
        {backfilled.length ? ` ${backfilled.join(", ")} were rebuilt the next morning from data known before those games (goalie tracking started 10/3), using the starter we projected at the time.` : ""}
      </div>

      {date && <MatchupFilter games={dayGames} />}

      <div className="signal-board" style={{ flexWrap: "wrap" }}>
        {date && leaders.map((g) => (
          <Tile key={g.key} label="👑 Saves leader" value={`${g.actGoalie} · ${g.actSaves}`}
            sub={`${g.team} ${g.isHome ? "vs" : "@"} ${g.opp} · projected #${g.projRank} (${fmt(g.projSaves)} saves)`} />
        ))}
        <Tile label="Starter picked right" value={stats.n ? `${Math.round((100 * stats.starterRight) / stats.n)}%` : "—"} sub={`${stats.starterRight}/${stats.n}`} />
        <Tile label="Saves: avg miss" value={fmt(stats.savesMae)} sub={`projected ${fmt(stats.projSavesAvg)} vs actual ${fmt(stats.actSavesAvg)} per game`} />
        <Tile label="Saves: bias" value={stats.savesBias == null ? "—" : `${stats.savesBias > 0 ? "+" : ""}${fmt(stats.savesBias)}`} sub="+ = projected too high" />
        <Tile label="Team shots: avg miss" value={fmt(stats.shotsMae)} sub="all goalies combined" />
        <Tile label="Goals allowed: avg miss" value={fmt(stats.gaMae, 2)} />
        {stats.lines.map((l) => (
          <Tile
            key={l.n}
            label={`${l.n}+ saves: said / happened`}
            value={l.count ? `${fmt(l.predicted, 0)}% / ${fmt(l.actual, 0)}%` : "—"}
            sub={`correct-starter games (${l.count})`}
          />
        ))}
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {!date && th("date", "Date")}
              {th("rank", "Rank")}
              {th("projRank", "Proj rank")}
              <th>Projected goalie</th>
              <th>Actual starter</th>
              {th("projSaves", "Proj saves")}
              {th("actSaves", "Saves")}
              {th("savesDiff", "Diff")}
              {th("projShots", "Proj shots")}
              {th("actShots", "Shots faced")}
              {th("projGA", "Proj GA")}
              {th("actGA", "GA")}
              {th("projSv", "Proj SV%")}
              {th("actSv", "SV%")}
              {SAVE_LINES.map((n) => <th key={n}>{n}+ saves</th>)}
            </tr>
          </thead>
          <tbody>
            {sorted.map((g) => (
              <tr key={g.key}>
                {!date && <td className="mono">{shortDate(g.date)}</td>}
                <RankCell rank={g.rank} of={g.slateGoalies} />
                <td className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{g.projRank}</td>
                <td className="clickable" onClick={() => g.proj.goalieId && openGoalieSlide({ playerId: g.proj.goalieId, name: g.projGoalie, team: g.team })}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <PlayerAvatar playerId={g.proj.goalieId} name={g.projGoalie} team={g.team} size={26} />
                    <div>
                      <span className="player-name-link">{g.projGoalie || "—"}</span> {g.confirmed ? "✅" : ""}
                      <div className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>{g.team} {g.isHome ? "vs" : "@"} {g.opp}</div>
                    </div>
                  </div>
                </td>
                <td className="mono" style={{ fontSize: 11, color: g.sameGoalie ? "var(--text)" : "var(--red)" }}>
                  {g.actGoalie || "—"}{g.sameGoalie ? "" : " (different)"}{g.pulled ? " · pulled/relieved" : ""}
                </td>
                <td>{fmt(g.projSaves)}</td>
                <td style={{ fontWeight: 800 }}>{g.actSaves}</td>
                <td style={{ color: g.savesDiff >= 0 ? "var(--green)" : "var(--red)" }}>{g.savesDiff > 0 ? "+" : ""}{fmt(g.savesDiff)}</td>
                <td>{fmt(g.projShots)}</td>
                <td>{g.actShots}</td>
                <td>{fmt(g.projGA, 2)}</td>
                <td>{g.actGA}</td>
                <td>{sv(g.projSv)}</td>
                <td>{sv(g.actSv)}</td>
                {SAVE_LINES.map((n) => (
                  <td key={n} className="mono" style={{ fontSize: 11 }}>
                    {g.proj.lines[n]}% {g.actSaves >= n ? "✅" : "✗"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
