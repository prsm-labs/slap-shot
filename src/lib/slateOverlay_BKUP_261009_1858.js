// Applies tonight's lineup news to the pipeline's pool (todays_pool.json) — the same rules in the
// browser (lib/data.js live slate pool) and in the pipeline (scripts/lock_top3.mjs):
//   - every skater faces the best-known opposing starter (lib/lineups.js startingGoalie: the
//     goalie actually in net once the game starts, then confirmed reports, then expected), with
//     that goalie's own stats swapped into the matchup inputs;
//   - skaters ruled out (RotoWire injury list, other than day-to-day) or missing from their
//     team's official dressed lineup once it's posted are taken out of the slate;
//   - every skater carries its game's state (gameState / gameStarted).
// Returns { meta (slate with live starters), players (still unscored), live (summary) }.
import { lineupMaps, skaterStatus, startingGoalie } from "./lineups.js";

export const STARTED = new Set(["LIVE", "CRIT", "FINAL", "OFF"]);
export const DONE = new Set(["FINAL", "OFF"]);

const mean = (xs) => {
  const v = xs.filter((x) => x != null && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const goalieStatusLabel = (s) => (s.confirmed ? (s.status === "In net" ? "In net" : "Confirmed") : s.status || "Projected");

export function applyLineups(data, lu, lineupsAt = null) {
  const maps = lineupMaps(lu);
  const goaliesById = new Map(data.goalies.map((g) => [g.playerId, g]));
  // Stats for a starter with no NHL history: the average goalie in the pool.
  const avgGoalie = {
    GA60_proxy: mean(data.goalies.map((g) => g.GA60_proxy)),
    xGA60_proxy: mean(data.goalies.map((g) => g.xGA60_proxy)),
    highDangerSavePct: mean(data.goalies.map((g) => g.highDangerSavePct)),
  };

  const starters = new Map();
  const slate = (data._meta.slate || []).map((game) => {
    const g = { ...game, state: maps.gameState.get(game.away) || null };
    for (const side of ["away", "home"]) {
      const s = startingGoalie(game[side], game, maps);
      if (!s) continue;
      starters.set(game[side], s);
      g[`${side}GoalieId`] = s.playerId ?? null;
      g[`${side}Goalie`] = goaliesById.get(s.playerId)?.name || s.name;
      g[`${side}GoalieStatus`] = goalieStatusLabel(s);
      g[`${side}GoalieSource`] = s.source;
    }
    return g;
  });

  const players = [];
  const removed = [];
  const swaps = new Map();
  for (const p of data.players) {
    const st = skaterStatus(maps, p);
    const dayToDay = /DTD|day/i.test(st?.out || "");
    let lineupStatus = null;
    if (maps.officialTeams.has(p.team)) lineupStatus = st?.dressed ? "dressed" : "scratched";
    else if (st?.out && !dayToDay) lineupStatus = "out";
    if (lineupStatus === "scratched" || lineupStatus === "out") {
      removed.push({ playerId: p.playerId, name: p.name, team: p.team, reason: lineupStatus === "out" ? st.out : "not dressed" });
      continue;
    }

    const q = { ...p, lineupStatus };
    const s = starters.get(p.opponentTeam);
    if (s?.playerId != null && s.playerId !== p.opponentGoalieId) {
      const g = goaliesById.get(s.playerId);
      const stats = g || avgGoalie;
      q.opponentGoalieId = s.playerId;
      q.opponentGoalie = g?.name || s.name;
      q.opponentGoalieGA60 = stats.GA60_proxy;
      q.opponentGoalieXGA60 = stats.xGA60_proxy;
      q.opponentGoalieHighDangerSavePct = stats.highDangerSavePct;
      q.opponentGoalieWas = p.opponentGoalie;
      swaps.set(p.opponentTeam, { team: p.opponentTeam, from: p.opponentGoalie, to: q.opponentGoalie, status: goalieStatusLabel(s) });
    }
    q.opponentGoalieConfirmed = Boolean(s?.confirmed);
    q.opponentGoalieStatus = s ? goalieStatusLabel(s) : null;
    q.gameState = maps.gameState.get(p.team) || null;
    q.gameStarted = STARTED.has(q.gameState);
    players.push(q);
  }

  const states = slate.map((g) => g.state);
  const live = {
    lineupsAt,
    lineupsLoaded: Boolean(lu),
    games: slate.length,
    started: states.filter((s) => STARTED.has(s)).length,
    final: states.filter((s) => DONE.has(s)).length,
    officialTeams: maps.officialTeams.size,
    goaliesConfirmed: [...starters.values()].filter((s) => s.confirmed).length,
    goaliesTotal: starters.size,
    swaps: [...swaps.values()],
    removed,
    poolGenerated: data._meta.generated,
  };
  return { meta: { ...data._meta, slate }, players, live };
}
