// Apple Lab — anytime-point Monte Carlo (goal OR assist), with a folded-in +3 SOG readout
// from the SAME simulated trials rather than a third sim tab — see slap-shot-build.md §4.2's
// reasoning (each trial already produces a full simulated shot/goal line internally, so a SOG
// threshold check is a free additional readout, not a second simulation). Loaded by URL string,
// not bundled — same convention as lampWorker.js / Going Yard's public/onBaseWorker.js.
//
// "Point" == "goal" here: no assist events exist in this project's current shot-level data
// source (shots_2025.csv has no assist field — see slap-shot-build.md §3's flagged gap and
// build_player_pool.py's I_F_primaryAssists: 0 comment). This sim is honest about that; it is
// not fabricating assist probability.
const ITERATIONS = 10000;
const SOG_THRESHOLD = 3;

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
  const onGoalRate = shotsPerGame > 0 ? (p.ShotsOnGoalPerGame || 0) / shotsPerGame : 0.5;
  const shootingPct = p.ICF > 0 ? (p.TotalGoals || 0) / p.ICF : 0;
  const usageMult = 0.6 + ((p.iceSig ?? 50) / 100) * 0.8;
  const matchupMult = 0.6 + ((p.breakawayScore ?? 50) / 100) * 0.8;

  const lambdaShots = Math.max(shotsPerGame * usageMult, 0.1);
  const perShotGoalP = Math.min(Math.max(shootingPct * matchupMult, 0.01), 0.55);

  let pointHits = 0;
  let sogHits = 0;
  for (let i = 0; i < ITERATIONS; i++) {
    const shots = poissonSample(lambdaShots);
    let goals = 0;
    let sog = 0;
    for (let s = 0; s < shots; s++) {
      if (Math.random() < onGoalRate) sog++;
      if (Math.random() < perShotGoalP) goals++;
    }
    if (goals >= 1) pointHits++;
    if (sog >= SOG_THRESHOLD) sogHits++;
  }

  return {
    playerId: p.playerId,
    name: p.name,
    anytimePointPct: Math.round((pointHits / ITERATIONS) * 1000) / 10,
    plus3SogPct: Math.round((sogHits / ITERATIONS) * 1000) / 10,
  };
}

self.onmessage = (e) => {
  const { players } = e.data;
  const results = players.map(simulatePlayer);
  results.sort((a, b) => b.anytimePointPct - a.anytimePointPct);
  self.postMessage({ results });
};
