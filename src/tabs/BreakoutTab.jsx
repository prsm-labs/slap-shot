import { useMemo } from "react";
import { useScoredPool } from "../lib/data.js";
import { breakoutBoard } from "../lib/breakout.js";
import { useH2H } from "../lib/h2h.js";
import { openSkaterSlide } from "../slideouts.js";
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

function H2HNote({ entry, goalieId }) {
  if (!entry) return <span style={{ color: "var(--muted)" }}>—</span>;
  const t = entry.vsTeam;
  const g = goalieId != null ? entry.vsGoalie?.[String(goalieId)] : null;
  return (
    <span>
      {t ? `vs ${t.opp}: ${t.games.reduce((a, r) => a + r.goals, 0)} G, ${t.games.reduce((a, r) => a + r.points, 0)} P in last ${t.games.length}` : ""}
      {t && g ? " · " : ""}
      {g ? `vs ${g.goalie.split(" ").pop()}: ${g.totals.goalsOn}/${g.totals.sogOn} shots` : ""}
      {!t && !g ? "—" : ""}
    </span>
  );
}

export default function BreakoutTab() {
  const pool = useScoredPool();
  const h2h = useH2H();
  const selected = useMatchup();
  const position = usePosition();
  const board = useMemo(() => (pool ? breakoutBoard(pool.players) : null), [pool]);

  if (!board) return <div className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>Loading…</div>;
  const list = filterPositions(filterPlayers(board.list, selected), position) || [];

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
                <th>Skater</th>
                <th>Opp goalie</th>
                <th title="Grade-model chance to score tonight">Model goal %</th>
                <th title="Expected goals per game, last 5 vs season (shrunk to league)">xG trend</th>
                <th title="High-danger shot attempts per game, last 5 vs season">HD trend</th>
                <th title="Unblocked shot attempts per game, last 5 vs season">Attempts trend</th>
                <th title="Opponent's expected goals allowed per game, softest = #1">Opp D</th>
                <th>Grade</th>
                <th title="History only — not used to pick">H2H (context)</th>
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
                  <td style={{ fontWeight: 700, color: "var(--accent2)" }}>{x(p.xgTrend)}</td>
                  <td>{x(p.hdTrend)}</td>
                  <td>{x(p.attTrend)}</td>
                  <td className="mono">#{p.softRank} of {p.softOf}</td>
                  <td><GradeBadge grade={p.effectiveGrade} /></td>
                  <td className="mono" style={{ fontSize: 10 }}>
                    <H2HNote entry={h2h?.skaters?.[String(p.playerId)]} goalieId={p.opponentGoalieId} />
                  </td>
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
