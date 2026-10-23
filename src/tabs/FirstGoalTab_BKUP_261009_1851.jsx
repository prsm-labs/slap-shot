import { useEffect, useMemo, useState } from "react";
import { useScoredPool } from "../lib/data.js";
import SlateStatus from "../components/SlateStatus.jsx";
import { openSkaterSlide } from "../slideouts.js";
import PickButton from "../components/PickButton.jsx";
import PlayerAvatar from "../components/PlayerAvatar.jsx";
import MatchupFilter from "../components/MatchupFilter.jsx";
import PositionFilter from "../components/PositionFilter.jsx";
import { filterPositions, positionLabel, usePosition } from "../lib/positionFilter.js";
import { fmtToi } from "../lib/toi.js";
import { matchupKey, playerMatchupKey, useMatchup } from "../lib/matchupFilter.js";
import { easternToday, fetchLiveGoals, LIVE_POLL_MS } from "../lib/liveGoals.js";
import { FIRST_GOAL, firstGoalsByGame } from "../lib/goalBadges.js";
import { firstGoalRate as rate } from "../lib/projections.js";
import { useH2H } from "../lib/h2h.js";
import { useSort } from "../lib/useSort.js";

// Candidate table columns: [field, header, tooltip]. Form rates are share of games (last 5 / 10 played,
// from h2h_today.json "form"); P1 SOG/GP from the pool (shots files).
const FORM_COLS = [
  ["firstGoalP", "First goal %", "Model chance to score this game's first goal"],
  ["goalsPg", "Goals / GP", "Goals per game, last season + this season"],
  ["p1SogPg", "P1 SOG/GP", "1st-period shots on goal per game, last season + this season"],
  ["fgL5", "1st goal L5", "Games he scored his game's first goal, last 5 played"],
  ["fgL10", "1st goal L10", "Games he scored his game's first goal, last 10 played"],
  ["p1gL5", "P1 goal L5", "Games with a 1st-period goal, last 5 played"],
  ["p1gL10", "P1 goal L10", "Games with a 1st-period goal, last 10 played"],
  ["slapScore", "Slap Score", "Tonight's anytime-goal rank (0-99)"],
];
const SHOW = 50;

// First goal projection. Every skater on tonight's rosters is a scoring "clock" running at their
// goals-per-game rate; whoever's clock rings first scores the game's first goal, so each player's
// chance is their rate divided by the sum of every skater's rate in that game. Rates are shrunk
// toward the league average (20 games' worth of a 0.17 goals/GP skater) so a 1-game sample can't
// dominate.
//
// Walk-forward backtest, 2025-26 regular season (1,131 games from Nov 1, each scored only with
// goals/GP known before that game, actual lineups): the top pick scored the first goal 6.1% of
// the time (model said 6.7% on average; picking at random would hit 2.8%), a top-3 pick 19.2%,
// a top-5 pick 30.2%. Tonight's pool uses full rosters, not confirmed lineups, so scratched
// players still take a share — expect slightly worse than the backtest.
// (rate formula lives in lib/projections.js so the Track Record snapshot uses the same one)

function fairOdds(prob) {
  if (!prob || prob <= 0) return "—";
  const american = prob >= 0.5 ? -Math.round((100 * prob) / (1 - prob)) : Math.round((100 * (1 - prob)) / prob);
  return american > 0 ? `+${american}` : String(american);
}

function pct(p) {
  return `${(p * 100).toFixed(1)}%`;
}

export default function FirstGoalTab() {
  // Live slate pool (lib/data.js), started games included — this tab grades tonight's first goals.
  // Scratched / ruled-out skaters are already removed, so each game's shares cover who is playing.
  const livePool = useScoredPool({ includeStarted: true });
  const pool = livePool?.players ?? null;
  const meta = livePool?.meta ?? null;
  const slateDate = meta?.slateDate;
  const [live, setLive] = useState(null);
  const selected = useMatchup();
  const position = usePosition();

  // Tonight's actual first goals, to grade the projection as games go.
  useEffect(() => {
    if (!slateDate || slateDate !== easternToday()) return undefined;
    let cancelled = false;
    let timer = null;
    async function load() {
      try {
        const result = await fetchLiveGoals(slateDate);
        if (cancelled) return;
        setLive(result);
        timer = setTimeout(load, result.unfinished ? LIVE_POLL_MS : 5 * 60_000);
      } catch {
        if (!cancelled) timer = setTimeout(load, LIVE_POLL_MS);
      }
    }
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [slateDate]);

  const games = useMemo(() => {
    if (!pool || !meta?.slate) return [];
    return meta.slate.map((g) => {
      const key = matchupKey(g.away, g.home);
      const skaters = pool.filter((p) => playerMatchupKey(p) === key).map((p) => ({ ...p, rate: rate(p) }));
      const total = skaters.reduce((s, p) => s + p.rate, 0) || 1;
      const ranked = skaters.map((p) => ({ ...p, firstGoalP: p.rate / total })).sort((a, b) => b.firstGoalP - a.firstGoalP);
      const teamP = (team) => ranked.filter((p) => p.team === team).reduce((s, p) => s + p.firstGoalP, 0);
      return { ...g, key, ranked, awayP: teamP(g.away), homeP: teamP(g.home) };
    });
  }, [pool, meta]);

  const actualFirst = useMemo(() => firstGoalsByGame(live?.goals), [live]);
  const shown = selected ? games.filter((g) => g.key === selected) : games;
  const h2h = useH2H();
  const [showAll, setShowAll] = useState(false);
  const candidates = useMemo(() => {
    // rate = share of games, ties toward the bigger sample; null when no games
    const r = (b, k) => (b?.games ? b[k] / b.games + b.games * 1e-6 : null);
    return filterPositions(shown.flatMap((g) => g.ranked.map((p) => {
      const f = h2h?.skaters?.[String(p.playerId)]?.form;
      return {
        ...p, game: g, form: f,
        goalsPg: p.games_played ? p.TotalGoals / p.games_played : null,
        p1SogPg: p.games_played && p.P1SOG != null ? p.P1SOG / p.games_played : null,
        fgL5: r(f?.l5, "firstGoalGames"), fgL10: r(f?.l10, "firstGoalGames"),
        p1gL5: r(f?.l5, "p1GoalGames"), p1gL10: r(f?.l10, "p1GoalGames"),
      };
    })), position);
  }, [shown, position, h2h]);
  const { sorted, sortKey, sortDir, toggleSort } = useSort(candidates, "firstGoalP", "desc");
  const slateTop = showAll ? sorted : sorted.slice(0, SHOW);

  if (!pool || !meta) return <div className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>Loading…</div>;

  return (
    <div>
      <div className="section-header">
        <div className="section-title">{FIRST_GOAL} First Goal</div>
        <div className="section-sub">Who scores the first goal of each game tonight — with fair odds to compare against the book</div>
      </div>

      <SlateStatus />

      <div className="note">
        ℹ️ Each skater's chance = their weight ÷ every skater's weight in that game. The weight is mostly their goals-per-game rate
        (shrunk toward league average), boosted for skaters who shoot a lot in 1st periods — the one extra input that held up over four
        seasons (top-3 picks scored first 20.6% vs 19.1% without it). Breakaway/rush chances and opponents' 1st-period defense were tested and add nothing.
        Backtested on 2025-26: the top pick scored first 6.1% of the time (2.8% random), a top-5 pick 30%.
        Uses full rosters — scratches aren't removed yet. {FIRST_GOAL} marks the actual first scorer once a game starts.
      </div>

      <PositionFilter />
      <MatchupFilter />

      <div className="grid-cards" style={{ marginBottom: 14 }}>
        {shown.map((g) => {
          const actual = actualFirst.get(g.gameId);
          const actualRank = actual ? g.ranked.findIndex((p) => p.playerId === actual.scorerId) + 1 : 0;
          return (
            <div className="card" key={g.gameId}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 700, fontSize: 17 }}>{g.away} @ {g.home}</span>
                <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
                  first goal: {g.away} {pct(g.awayP)} · {g.home} {pct(g.homeP)}
                </span>
              </div>
              {actual && (
                <div className="mono" style={{ fontSize: 11, marginBottom: 6, color: "var(--accent2)" }}>
                  {FIRST_GOAL} {actual.scorerName} ({actual.scorerTeam}) P{actual.period} {actual.timeInPeriod}
                  <span style={{ color: "var(--muted)" }}> — our #{actualRank || "—"} of {g.ranked.length}</span>
                </div>
              )}
              {filterPositions(g.ranked, position).slice(0, 5).map((p, i) => (
                <div
                  key={p.playerId}
                  className="clickable"
                  onClick={() => openSkaterSlide(p)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,.04)", cursor: "pointer" }}
                >
                  <span className="mono" style={{ fontSize: 10, color: "var(--muted)", width: 14 }}>{i + 1}.</span>
                  <PlayerAvatar playerId={p.playerId} name={p.name} team={p.team} size={24} />
                  <span className="mono" style={{ fontSize: 12, flex: 1, minWidth: 0 }}>
                    {p.name} <span style={{ color: "var(--muted)" }}>{p.team} · {positionLabel(p.position)} · {fmtToi(p.estToi)}</span>
                    {actual?.scorerId === p.playerId && <span> {FIRST_GOAL}</span>}
                  </span>
                  <span className="mono" style={{ fontSize: 12, fontWeight: 700 }}>{pct(p.firstGoalP)}</span>
                  <span className="mono" style={{ fontSize: 10, color: "var(--muted)", width: 48, textAlign: "right" }}>{fairOdds(p.firstGoalP)}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <div className="section-title" style={{ fontSize: 18, marginBottom: 8 }}>First-goal candidates{selected ? "" : " on the slate"}</div>
      <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginBottom: 8 }}>
        Click any column to sort. L5 / L10 = share of his last 5 / 10 games (count in brackets) — recent form shown as context;
        only goals per game and 1st-period shot attempts feed the First goal %.
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th className={sortKey === "name" ? "sorted" : ""} onClick={() => toggleSort("name")}>Skater{sortKey === "name" ? (sortDir === "desc" ? " ↓" : " ↑") : ""}</th>
              <th>Game</th>
              {FORM_COLS.map(([k, label, title]) => (
                <th key={k} title={title} className={sortKey === k ? "sorted" : ""} onClick={() => toggleSort(k)}>{label}{sortKey === k ? (sortDir === "desc" ? " ↓" : " ↑") : ""}</th>
              ))}
              <th>Fair odds</th>
            </tr>
          </thead>
          <tbody>
            {slateTop.map((p) => (
              <tr key={p.playerId}>
                <td className="clickable" onClick={() => openSkaterSlide(p)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <PlayerAvatar playerId={p.playerId} name={p.name} team={p.team} size={26} />
                    <span className="player-name-link">{p.name}</span>
                    <PickButton player={p} />
                    {actualFirst.get(p.game.gameId)?.scorerId === p.playerId && <span>{FIRST_GOAL}</span>}
                    <span className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>{p.team} · {positionLabel(p.position)}</span>
                  </div>
                </td>
                <td>{p.game.away} @ {p.game.home}</td>
                <td style={{ fontWeight: 700 }}>{pct(p.firstGoalP)}</td>
                <td>{p.goalsPg != null ? p.goalsPg.toFixed(2) : "—"} <span style={{ fontSize: 9, color: "var(--muted)" }}>({p.TotalGoals}/{p.games_played})</span></td>
                <td>{p.p1SogPg != null ? p.p1SogPg.toFixed(2) : "—"}</td>
                <FormCell b={p.form?.l5} k="firstGoalGames" />
                <FormCell b={p.form?.l10} k="firstGoalGames" />
                <FormCell b={p.form?.l5} k="p1GoalGames" />
                <FormCell b={p.form?.l10} k="p1GoalGames" />
                <td>{p.slapScore}</td>
                <td>{fairOdds(p.firstGoalP)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > SHOW && (
        <button className="btn" style={{ marginTop: 8 }} onClick={() => setShowAll((v) => !v)}>
          {showAll ? `Show top ${SHOW}` : `Show all ${sorted.length}`}
        </button>
      )}
    </div>
  );
}

function FormCell({ b, k }) {
  if (!b?.games) return <td style={{ color: "var(--muted)" }}>—</td>;
  return (
    <td>
      {Math.round((b[k] / b.games) * 100)}% <span style={{ fontSize: 9, color: "var(--muted)" }}>({b[k]}/{b.games})</span>
    </td>
  );
}
