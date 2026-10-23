// Pre-game projections that are saved each day for the Track Record (scripts/snapshot_projections.mjs)
// and shown live on the First Goal tab.

// Exact probabilities behind the Lamp Lab / Apple Lab Monte Carlo (public/lampWorker.js,
// public/appleWorker.js). Those draw shots ~ Poisson(lambda) and score each shot with
// probability p, which makes goals ~ Poisson(lambda * p) and shots on goal
// ~ Poisson(lambda * onGoalRate) — so these closed forms are what the 10,000 draws estimate
// (the sims land within about half a point of them).
export function simOdds(p) {
  const shotsPerGame = p.ShotAttemptsPerGame || 0;
  const shootingPct = p.ICF > 0 ? (p.TotalGoals || 0) / p.ICF : 0;
  const onGoalRate = shotsPerGame > 0 ? (p.ShotsOnGoalPerGame || 0) / shotsPerGame : 0.5;
  const usageMult = 0.6 + ((p.iceSig ?? 50) / 100) * 0.8;
  const matchupMult = 0.6 + ((p.breakawayScore ?? 50) / 100) * 0.8;
  const lambdaShots = Math.max(shotsPerGame * usageMult, 0.1);
  const perShotP = Math.min(Math.max(shootingPct * matchupMult, 0.01), 0.55);

  const goalP = 1 - Math.exp(-lambdaShots * perShotP);
  const sogLambda = lambdaShots * onGoalRate;
  const sog3P = 1 - Math.exp(-sogLambda) * (1 + sogLambda + (sogLambda * sogLambda) / 2);
  const round1 = (x) => Math.round(x * 1000) / 10;
  return { anytimeGoalPct: round1(goalP), plus3SogPct: round1(sog3P) };
}

// First goal of the game: each skater's weight divided by the total for every skater in that game.
// v2 (2026-10-07): weight = goalsRate^0.897 x exp(0.182 x z(1st-period shot attempts per game)).
//   goalsRate = goals/GP shrunk toward 0.17 with a 20-game prior (v1 used this alone);
//   P1 rate   = 1st-period unblocked attempts/GP shrunk toward the league 0.772 with a 10-game prior,
//               standardized with mean 0.781 / sd 0.259.
// Fitted on 2022-23 .. 2025-26 (4,610 games, scratch firstgoal_4s.py). Leave-one-season-out: logloss
// -0.015 +/- 0.005 vs v1, top-3 19.1% -> 20.6%. Tested and NOT used (no gain beyond re-weighting):
// rush chances (breakaway proxy), opponent 1st-period xG allowed, home ice; lines-file top-line role and
// line xG/60 added only a little.
const PRIOR_GAMES = 20;
const PRIOR_RATE = 0.17;
const P1 = { priorGames: 10, league: 0.7716, mean: 0.7806, sd: 0.2591, coef: 0.1822, rateExp: 0.8972 };

export function firstGoalRate(p) {
  const goals = ((p.TotalGoals || 0) + PRIOR_GAMES * PRIOR_RATE) / ((p.games_played || 0) + PRIOR_GAMES);
  if (p.P1Attempts == null) return goals; // pools built before P1 attempts were added
  const p1 = (p.P1Attempts + P1.priorGames * P1.league) / ((p.games_played || 0) + P1.priorGames);
  return Math.pow(goals, P1.rateExp) * Math.exp(P1.coef * ((p1 - P1.mean) / P1.sd));
}

// Map of playerId -> P(scores the game's first goal), for players grouped by game key.
export function firstGoalProbs(players, gameKeyOf) {
  const totals = new Map();
  for (const p of players) {
    const k = gameKeyOf(p);
    totals.set(k, (totals.get(k) || 0) + firstGoalRate(p));
  }
  return new Map(players.map((p) => [p.playerId, firstGoalRate(p) / (totals.get(gameKeyOf(p)) || 1)]));
}
