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

// First goal of the game: each skater's goals-per-game rate (shrunk toward a 0.17 average with a
// 20-game prior) divided by the total for every skater in that game. Backtest in FirstGoalTab.jsx.
const PRIOR_GAMES = 20;
const PRIOR_RATE = 0.17;

export function firstGoalRate(p) {
  return ((p.TotalGoals || 0) + PRIOR_GAMES * PRIOR_RATE) / ((p.games_played || 0) + PRIOR_GAMES);
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
