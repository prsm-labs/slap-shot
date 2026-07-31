import { useEffect, useState } from "react";
import { fetchScoredPool } from "../lib/data.js";
import { openSkaterSlide, openGoalieSlide } from "../slideouts.js";

// Top-5 opinionated lists driven directly off the already-scored pool — no separate data
// model, per slap-shot-build.md §8.
function ListCard({ title, sub, items, renderRow, onClick }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{title}</div>
      <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginBottom: 10 }}>{sub}</div>
      {items.map((item, i) => (
        <div
          key={i}
          className="clickable"
          style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,.05)", cursor: "pointer" }}
          onClick={() => onClick(item)}
        >
          <span className="mono" style={{ fontSize: 12 }}><span style={{ color: "var(--muted)" }}>{i + 1}.</span> {item.name} <span style={{ color: "var(--muted)" }}>({item.team})</span></span>
          <span className="mono" style={{ fontWeight: 700, fontSize: 12 }}>{renderRow(item)}</span>
        </div>
      ))}
    </div>
  );
}

export default function CheatSheetsTab() {
  const [players, setPlayers] = useState(null);
  const [goalies, setGoalies] = useState(null);

  useEffect(() => {
    fetchScoredPool().then(({ players }) => setPlayers(players));
    fetch("/data/todays_pool.json").then((r) => r.json()).then((d) => setGoalies(d.goalies));
  }, []);

  if (!players || !goalies) {
    return <div className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>Loading…</div>;
  }

  const goalCandidates = [...players].sort((a, b) => b.gGoal - a.gGoal).slice(0, 5);
  // Point Candidates: blend of Ice Sig (usage/opportunity) + gGOAL — a broader "gets on the
  // scoresheet" list than the pure finishing-probability Goal Candidates list.
  const pointCandidates = [...players]
    .map((p) => ({ ...p, _pointBlend: p.iceSig * 0.5 + p.gGoal * 0.5 }))
    .sort((a, b) => b._pointBlend - a._pointBlend)
    .slice(0, 5);
  // Most Attackable Goalies: inverse-sort of the same goalieMatchupScore inputs scoring.js
  // already computes for Breakaway Score — worst real save% / highest GA60 = best matchup target.
  const attackableGoalies = [...goalies]
    .filter((g) => g.savePct != null)
    .sort((a, b) => a.savePct - b.savePct)
    .slice(0, 5);

  return (
    <div>
      <div className="section-header">
        <div className="section-title">📋 Cheat Sheets</div>
        <div className="section-sub">Top-5 opinionated lists, read directly off the scored pool — no separate model</div>
      </div>

      <div className="grid-cards">
        <ListCard
          title="🥅 Goal Candidates"
          sub="Top 5 by gGOAL"
          items={goalCandidates}
          renderRow={(p) => `${p.gGoal}`}
          onClick={openSkaterSlide}
        />
        <ListCard
          title="🎯 Point Candidates"
          sub="Top 5 by Ice Sig + gGOAL blend"
          items={pointCandidates}
          renderRow={(p) => `${Math.round(p._pointBlend)}`}
          onClick={openSkaterSlide}
        />
        <ListCard
          title="🔓 Most Attackable Goalies This Week"
          sub="Worst real save% among qualified starters"
          items={attackableGoalies}
          renderRow={(g) => g.savePct.toFixed(3)}
          onClick={openGoalieSlide}
        />
      </div>
    </div>
  );
}
