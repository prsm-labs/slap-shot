import { useMemo } from "react";
import { useScoredPool } from "../lib/data.js";
import { breakoutBoard } from "../lib/breakout.js";
import { openSkaterSlide } from "../slideouts.js";
import H2HCell, { H2HStatCell } from "../components/H2HCell.jsx";
import { SKATER_H2H_COLS, useH2HGrades, withH2H } from "../lib/h2h.js";
import { useSort } from "../lib/useSort.js";
import PlayerAvatar from "../components/PlayerAvatar.jsx";
import PickButton from "../components/PickButton.jsx";
import GradeBadge from "../components/GradeBadge.jsx";
import OpponentGoalieCell from "../components/OpponentGoalieCell.jsx";
import MatchupFilter from "../components/MatchupFilter.jsx";
import PositionFilter from "../components/PositionFilter.jsx";
import { filterPlayers, useMatchup } from "../lib/matchupFilter.js";
import { filterPositions, positionLabel, usePosition } from "../lib/positionFilter.js";

// Cheat Sheets -> Breakout Watch: not the usual top scorers, but skaters whose shot quality is
// rising into a soft matchup (lib/breakout.js has the backtest behind every rule).
const x = (v) => (v == null || !Number.isFinite(v) ? "—" : `${v.toFixed(1)}x`);
const pct = (v) => `${(v * 100).toFixed(0)}%`;

export default function BreakoutTab() {
  const pool = useScoredPool();
  const selected = useMatchup();
  const position = usePosition();
  const board = useMemo(() => (pool ? breakoutBoard(pool.players) : null), [pool]);
  const h2hGrades = useH2HGrades();
  // Sortable: model goal % (default), trends, opp D, grade, H2H + goal-game rates.
  const rows = withH2H(board ? filterPositions(filterPlayers(board.list, selected), position) : [], h2hGrades)
    .map((p) => ({ ...p, modelGoal: p.modelProbs?.goal ?? null, softRankSort: p.softRank != null ? -p.softRank : null }));
  const { sorted: list, sortKey, sortDir, toggleSort } = useSort(rows, "modelGoal", "desc");

  if (!board) return <div className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>Loading…</div>;
  const th = (k, label, title) => (
    <th key={k} title={title} className={sortKey === k ? "sorted" : ""} onClick={() => toggleSort(k)}>{label}{sortKey === k ? (sortDir === "desc" ? " ↓" : " ↑") : ""}</th>
  );

  return (
    <div>
      <div className="note">
        🚀 <b>Breakout Watch</b> — not tonight's usual top scorers. Every skater here is outside the model's top 15%, has produced
        at least 1.3x their usual expected goals over their last 5 games, and faces one of tonight's softest third of defenses.
        Backtested on 2025-26, that group scored 20-29% more often than the model expected (points 11% more), in both halves of
        the season. Head-to-head history is shown for context only — it didn't predict anything in the same test.
      </div>
      <PositionFilter />
      <MatchupFilter />

      {list.length === 0 ? (
        <div className="note">Nobody clears all three bars tonight{selected || position ? " with these filters" : ""}.</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {th("name", "Skater")}
                <th>Opp goalie</th>
                {th("modelGoal", "Model goal %", "Grade-model chance to score tonight")}
                {th("sogPg", "SOG/GP", "Shots on goal per game, last season + this season")}
                {th("sog60", "SOG/60", "Shots on goal per 60 minutes of ice time")}
                {th("xgTrend", "xG trend", "Expected goals per game, last 5 vs season (shrunk to league)")}
                {th("hdTrend", "HD trend", "High-danger shot attempts per game, last 5 vs season")}
                {th("attTrend", "Attempts trend", "Unblocked shot attempts per game, last 5 vs season")}
                {th("softRankSort", "Opp D", "Opponent's expected goals allowed per game, softest = #1")}
                {th("gradeScore", "Grade")}
                {th("h2hScore", "H2H", "H2H grade vs tonight's opponent — hover for the history (context only, not used to pick)")}
                {SKATER_H2H_COLS.map(([k, , label, title]) => th(k, label, title))}
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.playerId}>
                  <td className="clickable" onClick={() => openSkaterSlide(p)}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <PlayerAvatar playerId={p.playerId} name={p.name} team={p.team} size={28} />
                      <div>
                        <span className="player-name-link">{p.name}</span> <PickButton player={p} />
                        <div className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>
                          {p.team} · {positionLabel(p.position)} · xG {p.xgL5.toFixed(2)}/gm last {p.recentGames} vs {p.xgSeason.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td><OpponentGoalieCell player={p} /></td>
                  <td style={{ fontWeight: 700 }}>{pct(p.modelProbs.goal)}</td>
                  <td className="mono">{p.sogPg != null ? p.sogPg.toFixed(2) : "—"}</td>
                  <td className="mono">{p.sog60 != null ? p.sog60.toFixed(2) : "—"}</td>
                  <td style={{ fontWeight: 700, color: "var(--accent2)" }}>{x(p.xgTrend)}</td>
                  <td>{x(p.hdTrend)}</td>
                  <td>{x(p.attTrend)}</td>
                  <td className="mono">#{p.softRank} of {p.softOf}</td>
                  <td><GradeBadge grade={p.effectiveGrade} /></td>
                  <td className="mono" style={{ fontSize: 10 }}>
                    <H2HCell playerId={p.playerId} />
                  </td>
                  {SKATER_H2H_COLS.map(([k, stat]) => <td key={k}><H2HStatCell playerId={p.playerId} stat={stat} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mono" style={{ fontSize: 9, color: "var(--muted)", marginTop: 6 }}>
        {board.list.length} of {board.eligible} eligible skaters qualify tonight. Early in the season "last 5 games" can include
        last season's final games. Started games drop off while "upcoming games only" is on.
      </div>
    </div>
  );
}
