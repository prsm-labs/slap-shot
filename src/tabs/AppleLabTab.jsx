import { useEffect, useRef, useState } from "react";
import { fetchScoredPool } from "../lib/data.js";
import { useSort } from "../lib/useSort.js";
import { openSkaterSlide } from "../slideouts.js";

function isRoleEligible(p) {
  return p.isEligible !== false && (p.games_played || 0) >= 10;
}

export default function AppleLabTab() {
  const [pool, setPool] = useState(null);
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const workerRef = useRef(null);

  useEffect(() => {
    fetchScoredPool().then(({ players }) => setPool(players.filter(isRoleEligible)));
  }, []);

  useEffect(() => {
    workerRef.current = new Worker("/appleWorker.js");
    workerRef.current.onmessage = (e) => {
      setResults(e.data.results);
      setRunning(false);
    };
    return () => workerRef.current?.terminate();
  }, []);

  function runSim() {
    if (!pool || running) return;
    setRunning(true);
    setResults(null);
    workerRef.current.postMessage({ players: pool });
  }

  const merged = results
    ? results.map((r) => ({ ...r, ...pool.find((p) => p.playerId === r.playerId) }))
    : null;
  const { sorted, sortKey, sortDir, toggleSort } = useSort(merged || [], "anytimePointPct", "desc");

  return (
    <div>
      <div className="section-header">
        <div className="section-title">🍎 Apple Lab</div>
        <div className="section-sub">Anytime-point Monte Carlo (goal — no assist data yet) + folded-in +3 SOG readout</div>
      </div>

      <div className="note">
        ℹ️ "An apple" = hockey slang for an assist — the lower-bar, doesn't-require-the-headline-event analogue of
        Lamp Lab, same shape as Going Yard's On Base. Point probability currently equals goal probability (no assist
        events in the current data source — flagged, not fabricated). The +3 SOG column is read off the SAME
        10,000 simulated trials, not a second simulation (slap-shot-build.md §4.2).
      </div>

      <button className="btn primary" onClick={runSim} disabled={!pool || running}>
        {running ? "Simulating…" : "▶ Run 10,000-Iteration Sim"}
      </button>

      {sorted.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 14 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th className={sortKey === "name" ? "sorted" : ""} onClick={() => toggleSort("name")}>Player{sortKey === "name" ? (sortDir === "desc" ? " ↓" : " ↑") : ""}</th>
                <th>Team</th>
                <th className={sortKey === "anytimePointPct" ? "sorted" : ""} onClick={() => toggleSort("anytimePointPct")}>Anytime Point %{sortKey === "anytimePointPct" ? (sortDir === "desc" ? " ↓" : " ↑") : ""}</th>
                <th className={sortKey === "plus3SogPct" ? "sorted" : ""} onClick={() => toggleSort("plus3SogPct")}>+3 SOG %{sortKey === "plus3SogPct" ? (sortDir === "desc" ? " ↓" : " ↑") : ""}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 40).map((p) => (
                <tr key={p.playerId} className="clickable" onClick={() => openSkaterSlide(p)}>
                  <td><span className="player-name-link">{p.name}</span></td>
                  <td>{p.team}</td>
                  <td>{p.anytimePointPct}%</td>
                  <td>{p.plus3SogPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
