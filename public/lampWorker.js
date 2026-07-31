// Lamp Lab — anytime-goal Monte Carlo. Loaded by URL string (new Worker('/lampWorker.js')),
// NOT bundled — same convention as Going Yard's real public/barrelWorker.js /
// public/onBaseWorker.js (mlb_project/going-yard/public/), which are also raw, unimported
// worker scripts. See slap-shot-build.md §4.1.
//
// Model: each simulated game draws a Poisson-distributed shot count around the player's real
// season ShotAttemptsPerGame (scaled by Ice Sig — recent usage/role trend), then each shot is
// an independent Bernoulli draw at the player's real season shooting% (TotalGoals/ICF, scaled
// by Breakaway Score — the opponent goalie/team-defense gate). This mirrors
// predict_goal_scorers.py's real methodology (14-day rate -> Poisson lambda ->
// 1-exp(-lambda) anytime-goal probability), not an arbitrary made-up simulation.
const ITERATIONS = 10000;

function poissonSample(lambda) {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L);
  return k - 1;
}

function simulatePlayer(p) {
  const shotsPerGame = p.ShotAttemptsPerGame || 0;
  const shootingPct = p.ICF > 0 ? (p.TotalGoals || 0) / p.ICF : 0;
  // Ice Sig / Breakaway Score are already population-normalized 0-100 (scoring.js) — center
  // the multiplier on 50 so an average player gets a ~1.0x adjustment, not a blanket boost.
  const usageMult = 0.6 + ((p.iceSig ?? 50) / 100) * 0.8; // 0.6x - 1.4x
  const matchupMult = 0.6 + ((p.breakawayScore ?? 50) / 100) * 0.8; // 0.6x - 1.4x

  const lambdaShots = Math.max(shotsPerGame * usageMult, 0.1);
  const perShotP = Math.min(Math.max(shootingPct * matchupMult, 0.01), 0.55);

  let goalHits = 0;
  for (let i = 0; i < ITERATIONS; i++) {
    const shots = poissonSample(lambdaShots);
    let goals = 0;
    for (let s = 0; s < shots; s++) {
      if (Math.random() < perShotP) goals++;
    }
    if (goals >= 1) goalHits++;
  }

  return {
    playerId: p.playerId,
    name: p.name,
    anytimeGoalPct: Math.round((goalHits / ITERATIONS) * 1000) / 10,
  };
}

self.onmessage = (e) => {
  const { players } = e.data;
  const results = players.map(simulatePlayer);
  results.sort((a, b) => b.anytimeGoalPct - a.anytimeGoalPct);
  self.postMessage({ results });
};
