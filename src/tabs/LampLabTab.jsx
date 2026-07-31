import { useEffect, useRef, useState } from "react";
import { fetchScoredPool } from "../lib/data.js";
import { useSort } from "../lib/useSort.js";
import { openSkaterSlide } from "../slideouts.js";

// Eligibility pre-filter mirrors Paydirt Lab's role-gated eligibility (slap-shot-build.md §4.1):
// real ice time / role, not just any roster player. isEligible is scoring.js's hard gate
// (confirmed out/scratched/injured); games_played >= 10 is a role-floor proxy standing in for
// real PP-unit/deployment data, which isn't wired up yet.
function isRoleEligible(p) {
  return p.isEligible !== false && (p.games_played || 0) >= 10;
}

export default function LampLabTab() {
  const [pool, setPool] = useState(null);
  const [results, setResults] = useState(null);
  const [running, setRunning] = useState(false);
  const workerRef = useRef(null);

  useEffect(() => {
    fetchScoredPool().then(({ players }) => setPool(players.filter(isRoleEligible)));
  }, []);

  useEffect(() => {
    workerRef.current = new Worker("/lampWorker.js");
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
  const { sorted, sortKey, sortDir, toggleSort } = useSort(merged || [], "anytimeGoalPct", "desc");

  return (
    <div>
      <div className="section-header">
        <div className="section-title">💡 Lamp Lab</div>
        <div className="section-sub">Anytime-goal Monte Carlo — 10,000 iterations, real per-player shot rate + shooting% + matchup gate</div>
      </div>

      <div className="note">
        ℹ️ "Light the lamp" = score a goal. Each trial draws a Poisson shot count around the player's real
        season ShotAttemptsPerGame, then a Bernoulli goal draw per shot at their real shooting% — both scaled by
        Ice Sig (usage) and Breakaway Score (matchup). Same methodology as predict_goal_scorers.py's real
        Poisson-lambda approach, run client-side in a Web Worker (public/lampWorker.js), not server-computed.
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
                <th className={sortKey === "anytimeGoalPct" ? "sorted" : ""} onClick={() => toggleSort("anytimeGoalPct")}>Anytime Goal %{sortKey === "anytimeGoalPct" ? (sortDir === "desc" ? " ↓" : " ↑") : ""}</th>
                <th className={sortKey === "slapScore" ? "sorted" : ""} onClick={() => toggleSort("slapScore")}>Slap Score{sortKey === "slapScore" ? (sortDir === "desc" ? " ↓" : " ↑") : ""}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 40).map((p) => (
                <tr key={p.playerId} className="clickable" onClick={() => openSkaterSlide(p)}>
                  <td><span className="player-name-link">{p.name}</span></td>
                  <td>{p.team}</td>
                  <td>{p.anytimeGoalPct}%</td>
                  <td>{p.slapScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
