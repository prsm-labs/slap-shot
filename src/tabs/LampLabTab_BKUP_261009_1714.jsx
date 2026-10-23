import { useMemo, useState } from "react";
import { useScoredPool } from "../lib/data.js";
import { useSort } from "../lib/useSort.js";
import { openSkaterSlide } from "../slideouts.js";
import PickButton from "../components/PickButton.jsx";
import H2HCell from "../components/H2HCell.jsx";
import { useH2HGrades } from "../lib/h2h.js";
import PlayerAvatar from "../components/PlayerAvatar.jsx";
import OpponentGoalieCell from "../components/OpponentGoalieCell.jsx";
import MatchupFilter from "../components/MatchupFilter.jsx";
import ListFilters from "../components/ListFilters.jsx";
import { applyListFilters, useListFilters } from "../lib/listFilters.js";
import PositionFilter from "../components/PositionFilter.jsx";
import { filterPositions, positionLabel, usePosition } from "../lib/positionFilter.js";
import { fmtToi } from "../lib/toi.js";
import { filterPlayers, useMatchup } from "../lib/matchupFilter.js";
import { isGoalSignal } from "../lib/signals.js";

// Structural port of Going Yard's real BarrelLabTab (mlb_project/going-yard/src/App.jsx:
// 32419-33537, researched in full this session): toolbar + aggregate card + Signal Board tiles
// + Top Reads card strip + opponent-grouped table with a real 3-way-AND signal badge, auto-run
// on load. What's intentionally NOT ported: the live lineup-confirmation gate, weather, and
// "Arsenal Fit" pitch-mix columns — none of that data exists in this project yet (flagged, not
// silently dropped).

// Eligibility mirrors isBarrelLabEligible()'s fallback branch (App.jsx:31787-31801) — recentPA
// >= 10 && seasonPA >= 30 in the original; games_played is our stand-in for both since we don't
// have a separate recent-games-played counter, and there's no live-lineup-confirmation source to
// check first (their preferred branch), so this IS the whole gate here, not just the fallback.
function isRoleEligible(p) {
  return p.isEligible !== false && (p.games_played || 0) >= 10;
}

function exportCsv(rows, filename) {
  const header = ["name", "team", "opponentGoalie", "goalieGrade", "anytimeGoalPct", "slapScore", "tier", "signal"];
  const lines = [header.join(",")];
  for (const p of rows) {
    lines.push([
      p.name, p.team, p.opponentGoalie || "", p.goalieGrade?.letter || "", p.anytimeGoalPct, p.slapScore, p.tier, isGoalSignal(p) ? "Y" : "N",
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

export default function LampLabTab() {
  // Live slate pool (lib/data.js). Goal % = Slap Score v2's calibrated, matchup-adjusted goal chance
  // (lib/slapScore.js). The old 10,000-run sim (public/lampWorker.js, left on disk) ran a third low.
  const live = useScoredPool();
  const merged = useMemo(() => (live ? live.players.filter(isRoleEligible) : null), [live]);
  const [team, setTeam] = useState(null);
  const selected = useMatchup();
  const position = usePosition();
  const listFilters = useListFilters();
  const h2hGrades = useH2HGrades();

  const teams = useMemo(() => (merged ? [...new Set(merged.map((p) => p.team))].sort() : []), [merged]);
  const filtered = useMemo(() => {
    const inGame = applyListFilters(filterPositions(filterPlayers(merged, selected), position), listFilters, { slate: live?.players, signal: "goal", h2h: h2hGrades.skaters });
    return (inGame && team ? inGame.filter((p) => p.team === team) : inGame) || [];
  }, [merged, team, selected, position, listFilters, live, h2hGrades]);

  const { sorted, sortKey, sortDir, toggleSort } = useSort(filtered, "anytimeGoalPct", "desc");
  const sortedWithSignalFirst = useMemo(
    () => [...sorted].sort((a, b) => (isGoalSignal(b) ? 1 : 0) - (isGoalSignal(a) ? 1 : 0)),
    [sorted]
  );

  const board = useMemo(() => {
    if (!filtered.length) return null;
    const signals = filtered.filter(isGoalSignal);
    const expected = filtered.reduce((s, p) => s + (p.anytimeGoalPct || 0) / 100, 0);
    const softMatchups = filtered.filter((p) => (p.oppSoftPct ?? 0) >= 0.67).length;
    const toughGoalies = filtered.filter((p) => ["A+", "A"].includes(p.goalieGrade?.letter)).length;
    const topSlap = Math.max(...filtered.map((p) => p.slapScore));
    const topSim = Math.max(...filtered.map((p) => p.anytimeGoalPct || 0));
    return { signals: signals.length, expected, softMatchups, toughGoalies, topSlap, topSim };
  }, [filtered]);

  const topReads = useMemo(
    () => [...filtered].sort((a, b) => b.anytimeGoalPct - a.anytimeGoalPct).slice(0, 5),
    [filtered]
  );

  return (
    <div>
      <div className="section-header">
        <div className="section-title">💡 Lamp Lab</div>
        <div className="section-sub">Anytime-goal chance — the calibrated grade model, adjusted for tonight's opponent</div>
      </div>

      <div className="note">
        ℹ️ "Light the lamp" = score a goal. Goal % is the grade model's chance to score (its odds matched reality over the first week:
        15.7% said vs 14.7% happened), nudged for how many expected goals tonight's opponent allows. ★ Goal Signal = Slap Score ≥85
        (top 15% tonight) AND an opponent in the softer half — that group scored 32% of the time in last season's backtest.
      </div>

      <PositionFilter />
      <ListFilters signalLabel="★ Goal Signals only" shown={filtered.length} total={merged?.length ?? 0} />
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
        <button className="btn" onClick={() => exportCsv(sortedWithSignalFirst, "lamp-lab.csv")} disabled={!sorted.length}>⬇ CSV</button>
      </div>

      {board && (
        <div className="signal-board">
          <div className="signal-tile"><div className="lbl">Top Slap Score</div><div className="val">{board.topSlap}</div></div>
          <div className="signal-tile"><div className="lbl">Goal Signals</div><div className="val">{board.signals}</div></div>
          <div className="signal-tile"><div className="lbl">Top Goal %</div><div className="val">{board.topSim}%</div></div>
          <div className="signal-tile"><div className="lbl">Pre-Game Exp. Goals</div><div className="val">{board.expected.toFixed(1)}</div></div>
          <div className="signal-tile"><div className="lbl">Soft Matchups</div><div className="val">{board.softMatchups}</div></div>
          <div className="signal-tile"><div className="lbl">Tough Goalies Faced</div><div className="val">{board.toughGoalies}</div></div>
        </div>
      )}

      {topReads.length > 0 && (
        <div className="top-reads">
          {topReads.map((p) => (
            <div key={p.playerId} className={`read-card ${isGoalSignal(p) ? "signal" : ""}`} onClick={() => openSkaterSlide(p)}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <PlayerAvatar playerId={p.playerId} name={p.name} team={p.team} size={36} />
                <div>
                  <div className="mono" style={{ fontSize: 12, fontWeight: 700 }}>{p.name}</div>
                  <div className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>{p.team} vs {p.opponentGoalie || "—"}</div>
                </div>
              </div>
              {isGoalSignal(p) && <div className="mono" style={{ fontSize: 10, marginBottom: 6 }}><span className="signal-star">★</span> Goal Signal</div>}
              <div style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 800, fontSize: 24 }}>{p.anytimeGoalPct}%</div>
              <div className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>Slap {p.slapScore} · {p.tier}</div>
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
                <th className={sortKey === "anytimeGoalPct" ? "sorted" : ""} onClick={() => toggleSort("anytimeGoalPct")}>Anytime Goal %{sortKey === "anytimeGoalPct" ? (sortDir === "desc" ? " ↓" : " ↑") : ""}</th>
                <th className={sortKey === "slapScore" ? "sorted" : ""} onClick={() => toggleSort("slapScore")}>Slap Score{sortKey === "slapScore" ? (sortDir === "desc" ? " ↓" : " ↑") : ""}</th>
                <th className={sortKey === "tier" ? "sorted" : ""} onClick={() => toggleSort("tier")}>Tier{sortKey === "tier" ? (sortDir === "desc" ? " ↓" : " ↑") : ""}</th>
                <th className={sortKey === "estToi" ? "sorted" : ""} onClick={() => toggleSort("estToi")}>Est. TOI{sortKey === "estToi" ? (sortDir === "desc" ? " ↓" : " ↑") : ""}</th>
                <th title="History vs tonight's opponent — context, not a prediction">H2H</th>
              </tr>
            </thead>
            <tbody>
              {sortedWithSignalFirst.slice(0, 50).map((p) => (
                <tr key={p.playerId} className={isGoalSignal(p) ? "signal-row" : ""}>
                  <td className="clickable" onClick={() => openSkaterSlide(p)}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <PlayerAvatar playerId={p.playerId} name={p.name} team={p.team} size={28} />
                      <div>
                        {isGoalSignal(p) && <span className="signal-star">★ </span>}
                        <span className="player-name-link">{p.name}</span> <PickButton player={p} />
                        <div className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>{p.team} · {positionLabel(p.position)} · {fmtToi(p.estToi)} TOI</div>
                      </div>
                    </div>
                  </td>
                  <td><OpponentGoalieCell player={p} /></td>
                  <td>{p.anytimeGoalPct}%</td>
                  <td>{p.slapScore}</td>
                  <td>{p.tier}</td>
                  <td className="mono">{fmtToi(p.estToi)}</td>
                  <td><H2HCell playerId={p.playerId} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
