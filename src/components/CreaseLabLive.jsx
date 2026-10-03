import { useEffect, useMemo, useState } from "react";
import { useSort } from "../lib/useSort.js";
import { openGoalieSlide } from "../slideouts.js";
import PlayerAvatar from "./PlayerAvatar.jsx";
import MatchupFilter from "./MatchupFilter.jsx";
import { useMatchup } from "../lib/matchupFilter.js";
import { LIVE_POLL_MS } from "../lib/liveGoals.js";

// Crease Lab "Live" view — every goalie who has played on the slate, from the NHL boxscore
// (/api/live "goalies"), ranked by saves: 👑 for the leader, then 2, 3, 4 ... Each live stat has
// the pre-game projection beside it in small parentheses. The projection is the locked snapshot
// (public/data/projections/<date>.json, saved before puck drop) when one exists, otherwise the
// Crease Lab's current numbers. Track Record keeps each night's final ranking.
const DONE = new Set(["FINAL", "OFF"]);
const sv = (v) => (v == null ? "—" : v.toFixed(3).replace(/^0/, ""));
const toiSec = (t) => {
  const [m, s] = String(t || "0:0").split(":").map(Number);
  return m * 60 + s;
};

// Standard competition ranking (ties share a rank: 1, 1, 3 ...).
function rankBySaves(goalies) {
  const order = [...goalies].sort((a, b) => b.saves - a.saves);
  return new Map(order.map((g) => [g.playerId, 1 + order.filter((o) => o.saves > g.saves).length]));
}

export function RankCell({ rank, of }) {
  if (rank == null) return <td>—</td>;
  return (
    <td className="mono" style={{ fontWeight: 800, fontSize: rank === 1 ? 18 : 13 }} title={of ? `#${rank} of ${of} goalies in saves` : undefined}>
      {rank === 1 ? "👑" : rank}
    </td>
  );
}

function gameLabel(g) {
  if (!g) return "";
  if (DONE.has(g.state)) return g.periodType && g.periodType !== "REG" ? `FINAL/${g.periodType}` : "FINAL";
  const per = g.periodType === "OT" ? "OT" : g.periodType === "SO" ? "SO" : `P${g.period}`;
  return g.clock?.inIntermission ? `${per} INT` : `${per} ${g.clock?.timeRemaining ?? ""}`;
}

const Proj = ({ children }) => (
  <span className="mono" style={{ fontSize: 9, color: "var(--muted)", marginLeft: 4 }}>({children})</span>
);

export default function CreaseLabLive({ date, fallback }) {
  const [live, setLive] = useState(null);
  const [error, setError] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const selected = useMatchup();

  useEffect(() => {
    let alive = true;
    fetch(`/data/projections/${date}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && setSnapshot(d?.goalies ? d : null))
      .catch(() => alive && setSnapshot(null));
    return () => { alive = false; };
  }, [date]);

  useEffect(() => {
    let alive = true;
    let timer;
    const load = async () => {
      try {
        const res = await fetch(`/api/live?date=${date}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || res.status);
        if (!alive) return;
        setLive(body);
        setError(null);
        if (body.games.some((g) => !DONE.has(g.state))) timer = setTimeout(load, LIVE_POLL_MS);
      } catch (e) {
        if (!alive) return;
        setError(String(e.message || e));
        timer = setTimeout(load, LIVE_POLL_MS);
      }
    };
    load();
    return () => { alive = false; clearTimeout(timer); };
  }, [date]);

  // Pre-game projection per team: locked snapshot first, then the tab's current numbers.
  const projByTeam = useMemo(() => {
    const m = new Map();
    for (const r of fallback || []) {
      m.set(r.team, { goalieId: r.playerId, goalie: r.name, shots: r.shots, saves: r.saves, goalsAllowed: r.goalsAllowed, savePct: r.projSv, confirmed: r.confirmed, locked: false });
    }
    for (const g of snapshot?.goalies || []) m.set(g.team, { ...g, locked: true });
    return m;
  }, [snapshot, fallback]);

  const rows = useMemo(() => {
    if (!live) return [];
    const games = new Map(live.games.map((g) => [g.gameId, g]));
    const ranks = rankBySaves(live.goalies || []);
    return (live.goalies || []).map((g) => {
      const game = games.get(g.gameId);
      const p = projByTeam.get(g.team);
      const isProjected = Boolean(p && p.goalieId === g.playerId);
      return {
        ...g,
        key: `${g.gameId}-${g.playerId}`,
        matchup: game ? `${game.away.abbrev}@${game.home.abbrev}` : "",
        game,
        rank: ranks.get(g.playerId),
        svPct: g.shotsAgainst ? g.saves / g.shotsAgainst : null,
        toiSec: toiSec(g.toi),
        proj: isProjected ? p : null,
        projOther: !isProjected && g.starter && p ? p.goalie : null,
        savesDiff: isProjected ? g.saves - p.saves : null,
      };
    });
  }, [live, projByTeam]);

  const shown = useMemo(() => rows.filter((r) => !selected || r.matchup === selected), [rows, selected]);
  const { sorted, sortKey, sortDir, toggleSort } = useSort(shown, "rank", "asc");

  if (error && !live) return <div className="note" style={{ borderColor: "var(--red)", color: "var(--red)" }}>Couldn't load live goalie stats: {error}</div>;
  if (!live) return <div className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>Loading live box scores…</div>;

  const unfinished = live.games.some((g) => !DONE.has(g.state));
  const leader = rows.filter((r) => r.rank === 1);
  const th = (k, label) => (
    <th key={k} className={sortKey === k ? "sorted" : ""} onClick={() => toggleSort(k)}>
      {label}{sortKey === k ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
    </th>
  );
  const games = live.games.map((g) => ({ away: g.away.abbrev, home: g.home.abbrev }));

  return (
    <div>
      <div className="note">
        ℹ️ Every goalie who has played tonight, ranked by saves — 👑 is the slate's saves leader right now and can change until
        every game is final. Small numbers in (parentheses) are the pre-game projection
        {snapshot ? " (locked before puck drop)" : " (current Crease Lab numbers — no locked snapshot for this date)"}.
        {unfinished ? " Updates every 30 seconds." : " All games final."} The final ranking is kept in Track Record → Goalies.
      </div>
      <MatchupFilter games={games} />

      {leader.length > 0 && (
        <div className="signal-board">
          {leader.map((r) => (
            <div key={r.key} className="signal-tile clickable" onClick={() => openGoalieSlide({ playerId: r.playerId, name: r.name, team: r.team })}>
              <div className="lbl">👑 Saves leader {unfinished ? "(so far)" : ""}</div>
              <div className="val">{r.name} · {r.saves}</div>
              <div className="sub">{r.team} {r.isHome ? "vs" : "@"} {r.opp} · {gameLabel(r.game)}</div>
            </div>
          ))}
          <div className="signal-tile">
            <div className="lbl">Goalies played</div>
            <div className="val">{rows.length}</div>
            <div className="sub">{live.games.filter((g) => DONE.has(g.state)).length}/{live.games.length} games final</div>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {th("rank", "Rank")}
              <th>Goalie</th>
              <th>Game</th>
              {th("saves", "Saves (proj)")}
              {th("shotsAgainst", "Shots against (proj)")}
              {th("goalsAgainst", "GA (proj)")}
              {th("svPct", "SV% (proj)")}
              {th("toiSec", "TOI (proj)")}
              {th("savesDiff", "Saves vs proj")}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.key} className={r.rank === 1 ? "signal-row" : ""}>
                <RankCell rank={r.rank} of={rows.length} />
                <td className="clickable" onClick={() => openGoalieSlide({ playerId: r.playerId, name: r.name, team: r.team })}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <PlayerAvatar playerId={r.playerId} name={r.name} team={r.team} size={28} />
                    <div>
                      <span className="player-name-link">{r.name}</span>
                      <div className="mono" style={{ fontSize: 9, color: r.projOther ? "var(--red)" : "var(--muted)" }}>
                        {r.team} {r.isHome ? "vs" : "@"} {r.opp}
                        {r.starter ? "" : " · relief"}
                        {r.projOther ? ` · projected ${r.projOther}` : ""}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="mono" style={{ fontSize: 11 }}>
                  {r.game ? `${r.game.away.abbrev} ${r.game.away.score ?? 0}-${r.game.home.score ?? 0} ${r.game.home.abbrev}` : ""}
                  <div style={{ fontSize: 9, color: DONE.has(r.state) ? "var(--muted)" : "var(--green)" }}>{gameLabel(r.game)}</div>
                </td>
                <td style={{ fontWeight: 800 }}>{r.saves}{r.proj && <Proj>{r.proj.saves}</Proj>}</td>
                <td>{r.shotsAgainst}{r.proj && <Proj>{r.proj.shots}</Proj>}</td>
                <td>{r.goalsAgainst}{r.proj && <Proj>{r.proj.goalsAllowed}</Proj>}</td>
                <td>{sv(r.svPct)}{r.proj && <Proj>{sv(r.proj.savePct)}</Proj>}</td>
                <td className="mono">{r.toi}{r.proj && <Proj>60:00</Proj>}</td>
                <td style={{ color: r.savesDiff == null ? "var(--muted)" : r.savesDiff >= 0 ? "var(--green)" : "var(--red)" }}>
                  {r.savesDiff == null ? "—" : `${r.savesDiff > 0 ? "+" : ""}${r.savesDiff.toFixed(1)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <div className="mono" style={{ color: "var(--muted)", fontSize: 12, padding: 12 }}>
          {live.games.length ? "No games have started yet — the ranking fills in once the puck drops." : "No games on this date."}
        </div>
      )}
    </div>
  );
}
