import { useEffect, useState } from "react";
import { fetchScoredPool } from "../lib/data.js";
import { useSort } from "../lib/useSort.js";
import { openSkaterSlide } from "../slideouts.js";

const TIER_CLASS = {
  "Elite Add-On": "tier-elite",
  "Core Target": "tier-core",
  "Value Upside": "tier-value",
  Ignore: "tier-ignore",
};

const COLUMNS = [
  ["name", "Player"],
  ["team", "Team"],
  ["slapScore", "Slap Score"],
  ["gGoal", "gGOAL"],
  ["iceSig", "Ice Sig"],
  ["snipeScore", "Snipe"],
  ["breakawayScore", "Breakaway"],
  ["tier", "Tier"],
];

export default function AllMatchupsTab() {
  const [players, setPlayers] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchScoredPool()
      .then(({ players, meta }) => { setPlayers(players); setMeta(meta); })
      .catch((e) => setError(String(e)));
  }, []);

  const { sorted, sortKey, sortDir, toggleSort } = useSort(players || [], "slapScore", "desc");

  return (
    <div>
      <div className="section-header">
        <div className="section-title">🏒 All Matchups</div>
        <div className="section-sub">Full pool, scored live by the Ice Sig / Snipe Score / Breakaway Score / gGOAL / Slap Score stack</div>
      </div>

      {meta && (
        <div className="note">
          ℹ️ {meta.note}
        </div>
      )}
      {error && <div className="note" style={{ borderColor: "var(--red)", color: "var(--red)" }}>Failed to load pool: {error}</div>}
      {!players && !error && <div className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>Loading and scoring pool…</div>}

      {players && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {COLUMNS.map(([key, label]) => (
                  <th key={key} className={sortKey === key ? "sorted" : ""} onClick={() => toggleSort(key)}>
                    {label}{sortKey === key ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr key={p.playerId} className="clickable" onClick={() => openSkaterSlide(p)}>
                  <td><span className="player-name-link">{p.name}</span></td>
                  <td>{p.team}</td>
                  <td>{p.slapScore}</td>
                  <td>{p.gGoal}</td>
                  <td>{p.iceSig}</td>
                  <td>{p.snipeScore}</td>
                  <td>{p.breakawayScore}</td>
                  <td><span className={`tier-pill ${TIER_CLASS[p.tier] || "tier-ignore"}`}>{p.tier}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
