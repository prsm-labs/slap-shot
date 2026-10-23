// Icebreaker — who scores the FASTEST goal (by game clock) among a group of games that start together
// (default: the night's earliest start, usually the 7 PM ET games).
//
// Model ("competing clocks"): every skater scores at his own rate; whoever's clock rings first across all
// of those games breaks the ice, so P(skater) = his rate ÷ the sum of every skater's rate in the group.
//   skater rate (goals / 60 min) = K x team expected goals tonight (lib/gameModel.js, with tonight's starting
//   goalies) x his share of his team's First Goal weight (lib/projections.js firstGoalRate: goals/GP +
//   1st-period shot attempts).
//   K = 0.909: goals come a little slower early in games than the full-game average (fitted on 528 nights).
// Backtest (scratch icebreaker_bt.py, 2023-24 .. 2025-26, each night's earliest-start games, team expected goals
// from the game model fit on other seasons; pre-game stats only):
//   nights with 2+ early games (254): top pick broke the ice 3.9% (random skater ~0.55%), top 3 10.2%,
//   top 10 21.7%; all nights (528): top pick 4.7%, top 5 21.2%. Pooling plain First Goal weights did the
//   same — team pace adds consistency with the game model, not accuracy. Starters predicted from past games
//   didn't help; the OFFICIAL starting lineup does (2023-24, 2+ early games: top-10 21% -> 28%) — applied through
//   lib/projections.js openingShare once the NHL posts it.
//   Timing: median wait for the first goal, 1 early game 7.0 min (model 7.7), 2-3 games 4.0 (3.8),
//   4+ games 1.8 (1.6); P(goal by 5 min) 39 / 60 / 87% actual vs 36 / 63 / 89% model.
import { expectedGoals } from "./gameModel.js";
import { firstGoalRate, OPENING, openingShare } from "./projections.js";

export const EARLY_PACE = 0.909;

// Start-time groups on the slate: [{ start, games: [...] }], earliest first.
export function startGroups(slate) {
  const by = new Map();
  for (const g of slate || []) {
    if (!by.has(g.startTimeUTC)) by.set(g.startTimeUTC, []);
    by.get(g.startTimeUTC).push(g);
  }
  return [...by.entries()].sort((a, b) => Date.parse(a[0]) - Date.parse(b[0])).map(([start, games]) => ({ start, games }));
}

// players: tonight's pool skaters; games: one start group; ratings: team_ratings.json.
export function icebreakerBoard(players, games, ratings) {
  if (!ratings || !games?.length) return null;
  const teamOf = new Map();
  for (const g of games) {
    teamOf.set(g.away, { game: g, opp: g.home, isHome: false, oppGoalie: g.homeGoalieId });
    teamOf.set(g.home, { game: g, opp: g.away, isHome: true, oppGoalie: g.awayGoalieId });
  }
  const sk = (players || []).filter((p) => teamOf.has(p.team)).map((p) => ({ ...p, w: firstGoalRate(p) }));
  const teamW = new Map();
  for (const p of sk) {
    teamW.set(p.team, (teamW.get(p.team) || 0) + p.w);
  }
  // own-game First Goal %, same as the First Goal page (incl. the official-starters boost)
  const fg = new Map();
  for (const g of games) {
    for (const [id, v] of openingShare(sk.filter((p) => teamOf.get(p.team).game.gameId === g.gameId), (p) => p.w, 6.0 * OPENING.earlyPace)) fg.set(id, v);
  }
  const teamXg = new Map([...teamOf.entries()].map(([t, x]) => [t, expectedGoals(ratings, t, x.opp, x.isHome, x.oppGoalie)]));
  const rows = sk.map((p) => {
    const x = teamOf.get(p.team);
    const rate = (EARLY_PACE * teamXg.get(p.team) * p.w) / (teamW.get(p.team) || 1); // goals per 60 min
    return { ...p, game: x.game, rate, teamXg: teamXg.get(p.team), firstGoalP: fg.get(p.playerId) };
  });
  const total = rows.reduce((s, r) => s + r.rate, 0) || 1;
  // Official starting lineups (once posted): opening-shift skaters get the first ~45 seconds (lib/projections.js).
  const share = openingShare(rows, (r) => r.rate, total);
  for (const r of rows) {
    r.iceP = share.get(r.playerId);
    r.by10 = 1 - Math.exp((-r.rate * 10) / 60);   // chance he scores in the first 10 minutes of his game
  }
  rows.sort((a, b) => b.iceP - a.iceP);
  rows.forEach((r, i) => { r.iceRank = i + 1; });
  // group pace: whole group scores at total goals per 60 min (EARLY_PACE already applied)
  const perMin = total / 60;
  const byMin = (m) => 1 - Math.exp(-perMin * m);
  const teams = [...teamOf.keys()].map((t) => ({
    team: t, p: rows.filter((r) => r.team === t).reduce((s, r) => s + r.iceP, 0), xg: teamXg.get(t),
  })).sort((a, b) => b.p - a.p);
  const startersPosted = games.filter((g) => rows.some((r) => r.game.gameId === g.gameId && r.startingLineup != null)).length;
  return { rows, teams, startersPosted, windowSec: OPENING.windowSec, medianMin: Math.log(2) / perMin, by: { 2: byMin(2), 5: byMin(5), 10: byMin(10) } };
}

// Actual icebreaker from live goal rows (lib/liveGoals.js): earliest elapsedSeconds among these games.
export function actualIcebreaker(goals, games) {
  const ids = new Set((games || []).map((g) => g.gameId));
  const rows = (goals || []).filter((g) => ids.has(g.gameId) && g.elapsedSeconds != null);
  if (!rows.length) return null;
  return rows.reduce((a, b) => (b.elapsedSeconds < a.elapsedSeconds ? b : a));
}
