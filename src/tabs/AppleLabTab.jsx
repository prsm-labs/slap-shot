import { useEffect, useRef, useState } from "react";
import { fetchScoredPool } from "../lib/data.js";
import { useSort } from "../lib/useSort.js";
import { openSkaterSlide } from "../slideouts.js";
import PlayerAvatar from "../components/PlayerAvatar.jsx";
import OpponentGoalieCell from "../components/OpponentGoalieCell.jsx";

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
        <div className="section-sub">Anytime-point odds vs. the actual goalie faced, plus a +3 SOG readout from the same sim</div>
      </div>

      <div className="note">ℹ️ "An apple" = hockey slang for an assist — right now this reads goals only until assist data is wired up.</div>

      <button className="btn primary" onClick={runSim} disabled={!pool || running}>
        {running ? "Simulating…" : "▶ Run 10,000-Iteration Sim"}
      </button>

      {sorted.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 14 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th className={sortKey === "name" ? "sorted" : ""} onClick={() => toggleSort("name")}>Skater{sortKey === "name" ? (sortDir === "desc" ? " ↓" : " ↑") : ""}</th>
                <th>Opp Goalie</th>
                <th className={sortKey === "anytimePointPct" ? "sorted" : ""} onClick={() => toggleSort("anytimePointPct")}>Anytime Point %{sortKey === "anytimePointPct" ? (sortDir === "desc" ? " ↓" : " ↑") : ""}</th>
                <th className={sortKey === "plus3SogPct" ? "sorted" : ""} onClick={() => toggleSort("plus3SogPct")}>+3 SOG %{sortKey === "plus3SogPct" ? (sortDir === "desc" ? " ↓" : " ↑") : ""}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 40).map((p) => (
                <tr key={p.playerId}>
                  <td className="clickable" onClick={() => openSkaterSlide(p)}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <PlayerAvatar playerId={p.playerId} name={p.name} team={p.team} size={28} />
                      <div>
                        <span className="player-name-link">{p.name}</span>
                        <div className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>{p.team}</div>
                      </div>
                    </div>
                  </td>
                  <td><OpponentGoalieCell player={p} /></td>
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
