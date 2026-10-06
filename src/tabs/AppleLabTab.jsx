import { useEffect, useMemo, useRef, useState } from "react";
import { useScoredPool } from "../lib/data.js";
import { useSort } from "../lib/useSort.js";
import { openSkaterSlide } from "../slideouts.js";
import PickButton from "../components/PickButton.jsx";
import PlayerAvatar from "../components/PlayerAvatar.jsx";
import OpponentGoalieCell from "../components/OpponentGoalieCell.jsx";
import MatchupFilter from "../components/MatchupFilter.jsx";
import ListFilters from "../components/ListFilters.jsx";
import { applyListFilters, useListFilters } from "../lib/listFilters.js";
import PositionFilter from "../components/PositionFilter.jsx";
import { filterPositions, positionLabel, usePosition } from "../lib/positionFilter.js";
import { fmtToi } from "../lib/toi.js";
import { filterPlayers, useMatchup } from "../lib/matchupFilter.js";
import { isPointSignal } from "../lib/signals.js";

// Structural port of Going Yard's real OnBaseTab (mlb_project/going-yard/src/App.jsx:
// 33607-34567) — parallel structure to Barrel Lab/Lamp Lab with its own score field and its own
// signal threshold (their real On Base swaps SimHR%>=12 for SimTB2%>=30, same shape); see
// LampLabTab.jsx for the shared reasoning on what's intentionally not ported (weather, live
// lineup confirmation, arsenal-fit columns — no data source for any of that yet).
function isRoleEligible(p) {
  return p.isEligible !== false && (p.games_played || 0) >= 10;
}

function exportCsv(rows, filename) {
  const header = ["name", "team", "opponentGoalie", "goalieGrade", "anytimePointPct", "plus3SogPct", "slapScore", "signal"];
  const lines = [header.join(",")];
  for (const p of rows) {
    lines.push([
      p.name, p.team, p.opponentGoalie || "", p.goalieGrade?.letter || "", p.anytimePointPct, p.plus3SogPct, p.slapScore, isPointSignal(p) ? "Y" : "N",
    ].map((v) => `"${v}"`).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AppleLabTab() {
  // Live slate pool (lib/data.js) — re-simulated whenever lineup news changes it.
  const live = useScoredPool();
  const pool = useMemo(() => (live ? live.players.filter(isRoleEligible) : null), [live]);
  const [results, setResults] = useState(null);
  const [resultsFor, setResultsFor] = useState(null); // the pool the shown results were simulated from
  const sentRef = useRef(null);
  const [team, setTeam] = useState(null);
  const selected = useMatchup();
  const position = usePosition();
  const listFilters = useListFilters();
  const workerRef = useRef(null);

  useEffect(() => {
    workerRef.current = new Worker("/appleWorker.js");
    workerRef.current.onmessage = (e) => {
      setResults(e.data.results);
      setResultsFor(sentRef.current);
    };
    return () => workerRef.current?.terminate();
  }, []);

  const running = Boolean(pool) && resultsFor !== pool;
  function runSim() {
    if (!pool || running) return;
    setResults(null);
    setResultsFor(null);
    sentRef.current = pool;
    workerRef.current.postMessage({ players: pool });
  }

  useEffect(() => {
    if (!pool || !workerRef.current) return;
    sentRef.current = pool;
    workerRef.current.postMessage({ players: pool });
  }, [pool]);

  const merged = useMemo(() => {
    if (!results || !pool) return null;
    // Results from the previous run can include skaters since scratched — keep only the current slate.
    const byId = new Map(pool.map((p) => [p.playerId, p]));
    return results.filter((r) => byId.has(r.playerId)).map((r) => ({ ...r, ...byId.get(r.playerId) }));
  }, [results, pool]);

  const teams = useMemo(() => (merged ? [...new Set(merged.map((p) => p.team))].sort() : []), [merged]);
  const filtered = useMemo(() => {
    const inGame = applyListFilters(filterPositions(filterPlayers(merged, selected), position), listFilters, { slate: live?.players, signal: "point" });
    return (inGame && team ? inGame.filter((p) => p.team === team) : inGame) || [];
  }, [merged, team, selected, position, listFilters, live]);

  const { sorted, sortKey, sortDir, toggleSort } = useSort(filtered, "anytimePointPct", "desc");
  const sortedWithSignalFirst = useMemo(
    () => [...sorted].sort((a, b) => (isPointSignal(b) ? 1 : 0) - (isPointSignal(a) ? 1 : 0)),
    [sorted]
  );

  const board = useMemo(() => {
    if (!filtered.length) return null;
    const signals = filtered.filter(isPointSignal);
    const expected = filtered.reduce((s, p) => s + (p.anytimePointPct || 0) / 100, 0);
    const topSlap = Math.max(...filtered.map((p) => p.slapScore));
    const topSim = Math.max(...filtered.map((p) => p.anytimePointPct || 0));
    const topSog = Math.max(...filtered.map((p) => p.plus3SogPct || 0));
    return { signals: signals.length, expected, topSlap, topSim, topSog };
  }, [filtered]);

  const topReads = useMemo(
    () => [...filtered].sort((a, b) => b.anytimePointPct - a.anytimePointPct).slice(0, 5),
    [filtered]
  );

  return (
    <div>
      <div className="section-header">
        <div className="section-title">🍎 Apple Lab</div>
        <div className="section-sub">Anytime-point chance from the calibrated grade model, plus a 3+ shots-on-goal sim</div>
      </div>

      <div className="note">
        ℹ️ "An apple" = an assist. Point % = the grade model's chance of a goal or assist (first week: 35.5% said vs 33.9% happened),
        nudged for tonight's opponent. +3 SOG % comes from a 10,000-run shot simulation (first week: 21.0% said vs 22.1% happened).
        ★ Point Signal = point % in tonight's top 15% AND +3 SOG ≥40% — 66% of those got a point over the first week (base 35%).
      </div>

      <PositionFilter />
      <ListFilters signalLabel="★ Point Signals only" shown={filtered.length} total={merged?.length ?? 0} />
      <MatchupFilter />
      <div className="card" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {teams.length > 0 && (
          <div className="pill-row" style={{ flexWrap: "wrap" }}>
            <button className={`pill-btn ${!team ? "active" : ""}`} onClick={() => setTeam(null)}>All</button>
            {teams.map((t) => (
              <button key={t} className={`pill-btn ${team === t ? "active" : ""}`} onClick={() => setTeam(t)}>{t}</button>
            ))}
          </div>
        )}
        <div style={{ flex: 1 }} />
        <button className="btn" onClick={runSim} disabled={!pool || running}>
          {running ? "Simulating…" : "⟳ Refresh"}
        </button>
        <button className="btn" onClick={() => exportCsv(sortedWithSignalFirst, "apple-lab.csv")} disabled={!sorted.length}>⬇ CSV</button>
      </div>

      {running && (
        <div className="note" style={{ textAlign: "center" }}>
          Running 10,000 Monte Carlo simulations… · {pool?.length ?? 0} skaters
        </div>
      )}

      {board && (
        <div className="signal-board">
          <div className="signal-tile"><div className="lbl">Top Slap Score</div><div className="val">{board.topSlap}</div></div>
          <div className="signal-tile"><div className="lbl">Point Signals</div><div className="val">{board.signals}</div></div>
          <div className="signal-tile"><div className="lbl">Top Point %</div><div className="val">{board.topSim}%</div></div>
          <div className="signal-tile"><div className="lbl">Pre-Game Exp. Points</div><div className="val">{board.expected.toFixed(1)}</div></div>
          <div className="signal-tile"><div className="lbl">Top +3 SOG %</div><div className="val">{board.topSog}%</div></div>
        </div>
      )}

      {topReads.length > 0 && (
        <div className="top-reads">
          {topReads.map((p) => (
            <div key={p.playerId} className={`read-card ${isPointSignal(p) ? "signal" : ""}`} onClick={() => openSkaterSlide(p)}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <PlayerAvatar playerId={p.playerId} name={p.name} team={p.team} size={36} />
                <div>
                  <div className="mono" style={{ fontSize: 12, fontWeight: 700 }}>{p.name}</div>
                  <div className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>{p.team} vs {p.opponentGoalie || "—"}</div>
                </div>
              </div>
              {isPointSignal(p) && <div className="mono" style={{ fontSize: 10, marginBottom: 6 }}><span className="signal-star">★</span> Point Signal</div>}
              <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 800, fontSize: 24 }}>{p.anytimePointPct}%</div>
              <div className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>+3 SOG {p.plus3SogPct}% · Slap {p.slapScore}</div>
            </div>
          ))}
        </div>
      )}

      {sortedWithSignalFirst.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className={sortKey === "name" ? "sorted" : ""} onClick={() => toggleSort("name")}>Skater{sortKey === "name" ? (sortDir === "desc" ? " ↓" : " ↑") : ""}</th>
                <th>Opp Goalie</th>
                <th className={sortKey === "anytimePointPct" ? "sorted" : ""} onClick={() => toggleSort("anytimePointPct")}>Anytime Point %{sortKey === "anytimePointPct" ? (sortDir === "desc" ? " ↓" : " ↑") : ""}</th>
                <th className={sortKey === "plus3SogPct" ? "sorted" : ""} onClick={() => toggleSort("plus3SogPct")}>+3 SOG %{sortKey === "plus3SogPct" ? (sortDir === "desc" ? " ↓" : " ↑") : ""}</th>
                <th className={sortKey === "slapScore" ? "sorted" : ""} onClick={() => toggleSort("slapScore")}>Slap Score{sortKey === "slapScore" ? (sortDir === "desc" ? " ↓" : " ↑") : ""}</th>
                <th className={sortKey === "estToi" ? "sorted" : ""} onClick={() => toggleSort("estToi")}>Est. TOI{sortKey === "estToi" ? (sortDir === "desc" ? " ↓" : " ↑") : ""}</th>
              </tr>
            </thead>
            <tbody>
              {sortedWithSignalFirst.slice(0, 50).map((p) => (
                <tr key={p.playerId} className={isPointSignal(p) ? "signal-row" : ""}>
                  <td className="clickable" onClick={() => openSkaterSlide(p)}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <PlayerAvatar playerId={p.playerId} name={p.name} team={p.team} size={28} />
                      <div>
                        {isPointSignal(p) && <span className="signal-star">★ </span>}
                        <span className="player-name-link">{p.name}</span> <PickButton player={p} />
                        <div className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>{p.team} · {positionLabel(p.position)} · {fmtToi(p.estToi)} TOI</div>
                      </div>
                    </div>
                  </td>
                  <td><OpponentGoalieCell player={p} /></td>
                  <td>{p.anytimePointPct}%</td>
                  <td>{p.plus3SogPct}%</td>
                  <td>{p.slapScore}</td>
                  <td className="mono">{fmtToi(p.estToi)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
