import { useMemo } from "react";
import { useScoredPool } from "../lib/data.js";
import { LADDER_BANDS, ladderPrice, teamLadder } from "../lib/ladder.js";
import { projectGoalie } from "../lib/crease.js";
import { fmtAmerican, fmtEdge, edgeColor, booksText } from "../lib/bookOdds.js";
import { matchupKey, useMatchup, inScope } from "../lib/matchupFilter.js";
import { filterPositions, positionLabel, usePosition } from "../lib/positionFilter.js";
import { lineupMaps, skaterStatus, useLineups } from "../lib/lineups.js";
import { openSkaterSlide, openGoalieSlide } from "../slideouts.js";
import PlayerAvatar from "../components/PlayerAvatar.jsx";
import GradeBadge from "../components/GradeBadge.jsx";
import PickButton from "../components/PickButton.jsx";
import GamblyButton from "../components/GamblyButton.jsx";
import DueTag from "../components/DueTag.jsx";
import LineupBadge from "../components/LineupBadge.jsx";
import MatchupFilter from "../components/MatchupFilter.jsx";
import PositionFilter from "../components/PositionFilter.jsx";
import { BestPriceLink } from "../components/BetLink.jsx";
import { betLine } from "../lib/gambly.js";

// 🪜 Game Ladder — one card per game, each team's anytime-goal picks from favorite to super-deep longshot
// (lib/ladder.js). Goal % = the same calibrated grade model + matchup used everywhere else.
const muted = { color: "var(--muted)" };
const sv = (v) => (v == null ? "—" : v.toFixed(3).replace(/^0/, ""));
const timeEt = (utc) => (utc ? new Date(utc).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET" : "");

function PickLine({ p, statusOf, alt }) {
  const price = ladderPrice(p);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, opacity: alt ? 0.85 : 1 }}>
      <PlayerAvatar playerId={p.playerId} name={p.name} team={p.team} size={alt ? 20 : 26} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: alt ? 11 : 12, fontWeight: alt ? 400 : 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          <span className="clickable player-name-link" onClick={() => openSkaterSlide(p)}>{p.name}</span>
          <span className="mono" style={{ fontSize: 9, ...muted }}> {positionLabel(p.position)}</span>
          {statusOf && <LineupBadge status={statusOf(p)} />}<DueTag due={p.dueHeat} />
        </div>
        <div className="mono" style={{ fontSize: 10 }}>
          <b>{p.anytimeGoalPct}%</b>{" "}
          <span title={p.book ? booksText(p.book) : "No sportsbook price yet — band uses our fair price"}>
            {price?.priced ? <BestPriceLink book={p.book} /> : <span style={muted}>fair {fmtAmerican(price?.am)}</span>}
          </span>
          {p.edge != null && <span style={{ color: edgeColor(p.edge), fontWeight: 700 }}> {fmtEdge(p.edge)}</span>}
        </div>
      </div>
      {!alt && <GradeBadge grade={p.effectiveGrade} />}
      {!alt && <span style={{ whiteSpace: "nowrap" }}><PickButton player={p} /> <GamblyButton text={betLine(p, "goal")} compact /></span>}
    </div>
  );
}

function TeamSide({ team, players, goalieInfo, statusOf }) {
  const ladder = useMemo(() => teamLadder(players), [players]);
  const m = players.find((p) => p.effectiveGrade?.matchup)?.effectiveGrade.matchup;
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10, background: "var(--surface2)", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <b style={{ fontSize: 14 }}>{team}</b>
        <span className="mono" style={{ fontSize: 10, ...muted }}>attacks</span>
        {goalieInfo && (
          <span className="clickable" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
            onClick={() => openGoalieSlide({ playerId: goalieInfo.id, name: goalieInfo.name, team: goalieInfo.team })}>
            <PlayerAvatar playerId={goalieInfo.id} name={goalieInfo.name} team={goalieInfo.team} size={22} />
            <span className="mono" style={{ fontSize: 11 }}>{goalieInfo.name}{goalieInfo.confirmed ? " ✅" : ""}</span>
            <GradeBadge grade={goalieInfo.grade} />
          </span>
        )}
      </div>
      <div className="mono" style={{ fontSize: 10, ...muted, marginBottom: 8, lineHeight: 1.5 }}>
        {goalieInfo?.proj && <>Crease Lab: {goalieInfo.proj.goalsAllowed.toFixed(2)} GA on {goalieInfo.proj.shots.toFixed(1)} shots (SV% {sv(goalieInfo.proj.savePct)}) · </>}
        {m && <span style={{ color: m.tier === "soft" ? "var(--accent2)" : undefined }} title="Opponent's expected goals allowed per game among tonight's defenses — the matchup factor in every goal %">
          {m.opp} defense #{m.rank} softest of {m.of}{m.tier === "soft" ? " ▲" : m.tier === "tough" ? " ▼" : ""}
        </span>}
      </div>
      {ladder.bands.map((b) => (
        <div key={b.key} style={{ display: "grid", gridTemplateColumns: "54px 1fr", gap: 6, padding: "5px 0", borderTop: "1px solid var(--border)" }}>
          <div className="mono" title={b.title} style={{ fontSize: 9, fontWeight: 700, color: b.key === "fav" ? "var(--accent2)" : "var(--muted)", paddingTop: 6 }}>{b.short}</div>
          <div style={{ minWidth: 0 }}>
            {b.pick ? <PickLine p={b.pick} statusOf={statusOf} /> : <span className="mono" style={{ fontSize: 10, ...muted }}>Nobody in this band</span>}
            {b.alts.length > 0 && (
              <div style={{ marginTop: 4, paddingLeft: 10, display: "grid", gap: 3 }}>
                {b.alts.map((a) => <PickLine key={a.playerId} p={a} statusOf={statusOf} alt />)}
              </div>
            )}
          </div>
        </div>
      ))}
      <div style={{ display: "grid", gridTemplateColumns: "54px 1fr", gap: 6, padding: "5px 0", borderTop: "1px solid var(--border)" }}>
        <div className="mono" title="Best value on the team not already shown above" style={{ fontSize: 9, fontWeight: 700, ...muted, paddingTop: 6 }}>HM</div>
        <div>{ladder.honorable ? <PickLine p={ladder.honorable} statusOf={statusOf} /> : <span className="mono" style={{ fontSize: 10, ...muted }}>—</span>}</div>
      </div>
    </div>
  );
}

export default function LadderTab() {
  const pool = useScoredPool();
  const selected = useMatchup();
  const position = usePosition();
  const lineups = useLineups(pool?.meta?.slateDate);
  const maps = useMemo(() => lineupMaps(lineups), [lineups]);
  const statusOf = (p) => skaterStatus(maps, p);

  const games = useMemo(() => {
    if (!pool) return [];
    const goalies = new Map(pool.goalies.map((g) => [g.playerId, g]));
    const players = filterPositions(pool.players, position);
    return (pool.meta.slate || [])
      .map((g) => ({ ...g, key: matchupKey(g.away, g.home) }))
      .filter((g) => inScope(g.key, selected))
      .map((g) => {
        const side = (team) => {
          const list = players.filter((p) => p.team === team && (p.opponentTeam === g.home || p.opponentTeam === g.away));
          const any = pool.players.find((p) => p.team === team && p.opponentGoalie);
          const opp = team === g.away ? g.home : g.away;
          const gStats = any ? goalies.get(any.opponentGoalieId) : null;
          const goalieInfo = any ? {
            id: any.opponentGoalieId, name: any.opponentGoalie, team: opp, confirmed: any.opponentGoalieConfirmed,
            grade: any.goalieGrade, proj: projectGoalie(gStats, opp, team, pool.meta),
          } : null;
          return { team, list, goalieInfo };
        };
        return { ...g, sides: [side(g.away), side(g.home)] };
      })
      .filter((g) => g.sides.some((s) => s.list.length));
  }, [pool, selected, position]);

  if (!pool) return <div className="mono" style={{ ...muted, fontSize: 12 }}>Loading…</div>;

  return (
    <div>
      <div className="note">
        🪜 <b>Game Ladder</b> — each team's anytime-goal picks from favorite to super-deep longshot, banded by the best sportsbook
        price ({LADDER_BANDS.map((b) => `${b.short} ${b.title.replace("Best price ", "")}`).join(" · ")}). Inside a band the pick is the
        best value — our goal % minus the book's implied % — with the next two below it. HM = best value left on the team. No price
        yet = banded by our fair price. Goalie and defense lines are context: tonight's goal % already includes the opponent's
        defense; goalie save % / GSAx and defense-vs-position added nothing in our backtests.
      </div>
      <PositionFilter />
      <MatchupFilter />
      {games.length === 0 ? (
        <div className="note">No upcoming games{selected || position ? " with these filters" : ""}.</div>
      ) : games.map((g) => (
        <div key={g.key} style={{ marginBottom: 16 }}>
          <div className="mono" style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
            {g.away} @ {g.home} <span style={{ ...muted, fontWeight: 400 }}>{timeEt(g.startTimeUTC)}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))", gap: 10 }}>
            {g.sides.map((s) => <TeamSide key={s.team} team={s.team} players={s.list} goalieInfo={s.goalieInfo} statusOf={statusOf} />)}
          </div>
        </div>
      ))}
    </div>
  );
}
