import { useEffect, useState } from "react";
import { fetchScoredPool } from "../lib/data.js";

// Standalone lookup: any skater vs any goalie, not just today's slate — mirrors Going Yard's
// BvPTab any-pair-not-just-todays-matchups framing (slap-shot-build.md §8/§11).
export default function MatchupLookupTab() {
  const [players, setPlayers] = useState(null);
  const [goalies, setGoalies] = useState(null);
  const [skaterId, setSkaterId] = useState(null);
  const [goalieId, setGoalieId] = useState(null);

  useEffect(() => {
    fetchScoredPool().then(({ players }) => {
      setPlayers(players);
      setSkaterId(players[0]?.playerId);
    });
    fetch("/data/todays_pool.json").then((r) => r.json()).then((d) => {
      setGoalies(d.goalies);
      setGoalieId(d.goalies[0]?.playerId);
    });
  }, []);

  if (!players || !goalies) {
    return <div className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>Loading…</div>;
  }

  const skater = players.find((p) => p.playerId === skaterId);
  const goalie = goalies.find((g) => g.playerId === goalieId);

  const shootingPct = skater && skater.ICF > 0 ? skater.TotalGoals / skater.ICF : 0;
  // Goalie form: actual goals allowed vs expected (xGA) — under 1.0 means outperforming
  // expected, i.e. playing better than the shot quality they've faced would predict.
  const goalieForm = goalie && goalie.GA60_proxy && goalie.xGA60_proxy ? goalie.GA60_proxy / goalie.xGA60_proxy : null;

  return (
    <div>
      <div className="section-header">
        <div className="section-title">🔍 Goalie / Matchup Lookup</div>
        <div className="section-sub">Any skater vs any goalie, real season profiles — not limited to today's slate</div>
      </div>

      <div className="card" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <label className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
          Skater
          <br />
          <select value={skaterId || ""} onChange={(e) => setSkaterId(Number(e.target.value))} style={selectStyle}>
            {players.map((p) => (
              <option key={p.playerId} value={p.playerId}>{p.name} ({p.team})</option>
            ))}
          </select>
        </label>
        <label className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
          Goalie
          <br />
          <select value={goalieId || ""} onChange={(e) => setGoalieId(Number(e.target.value))} style={selectStyle}>
            {goalies.map((g) => (
              <option key={g.playerId} value={g.playerId}>{g.name} ({g.team})</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid-cards">
        {skater && (
          <div className="card">
            <div style={{ fontWeight: 700, marginBottom: 8 }}>{skater.name} <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{skater.team}</span></div>
            <Stat label="Season Goals" value={skater.TotalGoals} />
            <Stat label="Shooting %" value={`${(shootingPct * 100).toFixed(1)}%`} />
            <Stat label="Shots/GP" value={skater.ShotAttemptsPerGame} />
            <Stat label="Slap Score" value={skater.slapScore} />
          </div>
        )}
        {goalie && (
          <div className="card">
            <div style={{ fontWeight: 700, marginBottom: 8 }}>{goalie.name} <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{goalie.team}</span></div>
            <Stat label="Save %" value={goalie.savePct?.toFixed(3) ?? "—"} />
            <Stat label="GA60 (real)" value={goalie.GA60_proxy} />
            <Stat label="xGA60 (real)" value={goalie.xGA60_proxy} />
            <Stat label="Form (GA60/xGA60)" value={goalieForm != null ? `${goalieForm.toFixed(2)}${goalieForm < 1 ? " (hot)" : goalieForm > 1.1 ? " (cold)" : ""}` : "—"} />
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0" }}>
      <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{label}</span>
      <span className="mono" style={{ fontSize: 12, fontWeight: 700 }}>{value}</span>
    </div>
  );
}

const selectStyle = {
  background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--border)",
  borderRadius: 6, padding: "6px 8px", marginTop: 4, fontFamily: "'DM Mono',monospace", fontSize: 11,
};
