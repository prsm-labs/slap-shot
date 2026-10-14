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
//             (since 2026-10-13 the adjustment lives in lib/grades.js gradeSlate: logit + 0.114 x slate
//             z-score, refit on 4 seasons; it was 0.041 here before)
//   point % = same for points (logit + 0.138 x z)
//   Slap Score = where tonight's slate ranks that goal %, 0-99
//   tiers: Elite Add-On top 10% (90+), Core Target next 20% (70-89), Value Upside next 20% (50-69),
//          Ignore the rest. On 10/2-10/4 that ordering held: goal 31% / 24% / 14% / 8%.

import { dueHeatMap } from "./dueHeat.js";
import { pointHeatMap } from "./pointHeat.js";
export { MATCHUP_COEF } from "./grades.js"; // applied in gradeSlate; modelProbs arrive matchup-adjusted

// 2+ goals tonight (2026-10-12; scratch multigoal_fit2.py): logistic on L = logit(grade-model goal chance)
// and the slate z-score of the opponent's xGA allowed, fit on 69,577 Feb-Apr skater-games, 2022-23 .. 2025-26
// (1,222 with 2+ goals). The L^2 term bends the top down: a star who has scored gets a second goal less often
// than Poisson says (50%+ goal chance: 24% vs 35%). Leave-one-season-out log loss beat Poisson every season and
// the opp-defense term helped all 4; calibrated by goal-chance bucket (top 5% said 7.8%, happened 7.2%).
// Opponent defense matters more for a 2nd goal than a 1st (worst-fifth vs best-fifth defense: 2+ x1.6, 1+ x1.3).
export const MULTI_GOAL = { intercept: -2.2936, l: 0.6864, l2: -0.2662, z: 0.1252, lMax: 1.29 };
export function multiGoalChance(goalP, z = 0) {
  if (goalP == null) return null;
  const l = Math.min(logit(Math.min(Math.max(goalP, 1e-4), 1 - 1e-4)), MULTI_GOAL.lMax); // keep it increasing
  return sigmoid(MULTI_GOAL.intercept + MULTI_GOAL.l * l + MULTI_GOAL.l2 * l * l + MULTI_GOAL.z * z);
}

// 2+ / 3+ points tonight (2026-10-14; scratch multipoint.py): logistic on L = logit(point chance, matchup-adjusted),
// fit on the same 69,577 Feb-Apr skater-games (6,413 with 2+, 1,431 with 3+). Poisson off the point chance over-states
// multi-point nights (3+ said 1,652 vs 1,431 happened; top 5%: 16.2% said vs 11.3%). This fit beat Poisson leave-one-
// season-out and lands within ~5% every season; top 5%: 2+ said 32.1% / happened 32.2%, 3+ 11.4% / 11.3%.
// The opp-defense term added nothing here (the point chance already carries it).
export const MULTI_POINT = { lMax: 1.518, two: [-1.7473, 1.1113, -0.1477], three: [-3.4388, 1.5115, -0.1902] };
export function multiPointChance(pointP, n = 2) {
  if (pointP == null) return null;
  const l = Math.min(logit(Math.min(Math.max(pointP, 1e-4), 1 - 1e-4)), MULTI_POINT.lMax);
  const [a, b, c] = n >= 3 ? MULTI_POINT.three : MULTI_POINT.two;
  return sigmoid(a + b * l + c * l * l);
}

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
  // 🔥 Due + heating up (lib/dueHeat.js): x1.06 / x1.10 on the goal chance, backtested, non-stars only
  const due = dueHeatMap(scored);
  // 🍎 Points due (lib/pointHeat.js): x1.07 / x1.10 on the point chance, backtested, outside the top 25%
  const ptDue = pointHeatMap(scored);
  const xs = scored.map((p) => p.opponentTeamxGA60).filter((v) => v != null);
  const mean = xs.reduce((a, b) => a + b, 0) / Math.max(xs.length, 1);
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(xs.length, 1)) || 1;
  const adj = new Map(scored.map((p) => {
    const z = p.opponentTeamxGA60 != null ? (p.opponentTeamxGA60 - mean) / sd : 0;
    return [p.playerId, {
      goal: Math.min(0.95, p.modelProbs.goal * (due.get(p.playerId)?.mult ?? 1)),
      point: Math.min(0.95, p.modelProbs.point * (ptDue.get(p.playerId)?.mult ?? 1)),
      // fit on the pre-matchup chance + its own defense term
      multi: multiGoalChance(p.modelProbs.base?.goal ?? p.modelProbs.goal, z),
    }];
  }));
  const goalRank = pctRank(scored, (p) => adj.get(p.playerId).goal);
  const pointRank = pctRank(scored, (p) => adj.get(p.playerId).point);
  const softRank = pctRank(scored, (p) => p.opponentTeamxGA60 ?? mean);
  return players.map((p) => {
    const a = adj.get(p.playerId);
    if (!a) return { ...p, slapScore: null, tier: null, gGoal: null, anytimeGoalPct: null, anytimePointPct: null, multiGoalPct: null, multiPoint2Pct: null, multiPoint3Pct: null, dueHeat: null, pointHeat: null };
    const slapScore = Math.round(goalRank.get(p.playerId) * 99);
    return {
      ...p,
      slapScore,
      tier: tierFor(slapScore),
      gGoal: pct1(a.goal),
      anytimeGoalPct: pct1(a.goal),
      anytimePointPct: pct1(a.point),
      multiGoalPct: pct1(a.multi),
      multiPoint2Pct: pct1(multiPointChance(a.point, 2)),
      multiPoint3Pct: pct1(multiPointChance(a.point, 3)),
      pointPct: pointRank.get(p.playerId),
      oppSoftPct: softRank.get(p.playerId),
      dueHeat: due.get(p.playerId) || null,
      pointHeat: ptDue.get(p.playerId) || null,
    };
  });
}
