// Slap Score v2 (2026-10-05) — built on the calibrated grade model (lib/grades.js) instead of the
// ported Power BI formula. The old DAX stack (scoring.js) still supplies Ice Sig / Snipe / Breakaway
// as display stats, but no longer drives Slap Score, tiers, gGOAL or the goal / point %.
//
// Why (track record 9/29-10/4, 1,382 skater-games): the old tiers weren't ordered (Ignore 13.6% goal
// rate vs Core Target 13.2%), and the Lamp sim's goal % ran a third low (10.3% said vs 15.4% actual)
// because it read Breakaway (real range ~3-9) as a 0-100 score. The grade model's goal / point odds
// were calibrated over the same nights (goal 15.7% vs 14.7%, point 35.5% vs 33.9%).
//
//   goal %  = grade-model goal chance, adjusted for the opponent's expected goals allowed per game
//             (logit + 0.041 x slate z-score; fitted on 2025-26, see lib/top3.js)
//   point % = same for points (logit + 0.055 x z)
//   Slap Score = where tonight's slate ranks that goal %, 0-99
//   tiers: Elite Add-On top 10% (90+), Core Target next 20% (70-89), Value Upside next 20% (50-69),
//          Ignore the rest. On 10/2-10/4 that ordering held: goal 31% / 24% / 14% / 8%.

export const MATCHUP_COEF = { goal: 0.041, point: 0.055 };

export function tierFor(slapScore) {
  if (slapScore >= 90) return "Elite Add-On";
  if (slapScore >= 70) return "Core Target";
  if (slapScore >= 50) return "Value Upside";
  return "Ignore";
}

const logit = (p) => Math.log(p / (1 - p));
const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const pct1 = (p) => Math.round(p * 1000) / 10;

function pctRank(rows, get) {
  const sorted = [...rows].sort((a, b) => get(a) - get(b));
  const out = new Map();
  sorted.forEach((r, i) => out.set(r.playerId, sorted.length > 1 ? i / (sorted.length - 1) : 0.5));
  return out;
}

// players: graded slate skaters (modelProbs from gradeSlate). Returns copies with slapScore, tier,
// gGoal, anytimeGoalPct, anytimePointPct, pointPct (slate rank of point %) and oppSoftPct (slate
// rank of the opponent's xGA allowed; 1 = softest).
export function applySlateScores(players) {
  const scored = players.filter((p) => p.modelProbs?.goal != null);
  const xs = scored.map((p) => p.opponentTeamxGA60).filter((v) => v != null);
  const mean = xs.reduce((a, b) => a + b, 0) / Math.max(xs.length, 1);
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(xs.length, 1)) || 1;
  const adj = new Map(scored.map((p) => {
    const z = p.opponentTeamxGA60 != null ? (p.opponentTeamxGA60 - mean) / sd : 0;
    return [p.playerId, {
      goal: sigmoid(logit(p.modelProbs.goal) + MATCHUP_COEF.goal * z),
      point: sigmoid(logit(p.modelProbs.point) + MATCHUP_COEF.point * z),
    }];
  }));
  const goalRank = pctRank(scored, (p) => adj.get(p.playerId).goal);
  const pointRank = pctRank(scored, (p) => adj.get(p.playerId).point);
  const softRank = pctRank(scored, (p) => p.opponentTeamxGA60 ?? mean);
  return players.map((p) => {
    const a = adj.get(p.playerId);
    if (!a) return { ...p, slapScore: null, tier: null, gGoal: null, anytimeGoalPct: null, anytimePointPct: null };
    const slapScore = Math.round(goalRank.get(p.playerId) * 99);
    return {
      ...p,
      slapScore,
      tier: tierFor(slapScore),
      gGoal: pct1(a.goal),
      anytimeGoalPct: pct1(a.goal),
      anytimePointPct: pct1(a.point),
      pointPct: pointRank.get(p.playerId),
      oppSoftPct: softRank.get(p.playerId),
    };
  });
}
