// Calibration + last-120-minutes form (2026-10-14; scratch effort_build.py / effort_final3.py).
//
// 68,826 Feb-Apr skater-games 2022-23 .. 2025-26, grade model fit Nov-Jan each season, coefficients fit
// leave-one-season-out. The model (with matchup) was over-confident at the top and under at the middle:
//   actual / predicted by slate fifth, low..top   goal 0.93 1.01 1.06 1.06 0.94   point 1.05 1.04 1.02 1.01 0.94
//   (this season 10/2-10/12, 2,601 skater-games: top fifth goal said 32.6%, happened 27.0%)
// Fix: logit p' = a L + b L^2 + c (+ form terms), L = logit(model chance with matchup).
//   goal  -> every fifth 0.97-1.02, top 5% said 38.7% / happened 38.3% (was 43.9%); log loss -40e-5
//   point -> every fifth 0.98-1.01, top 5% said 69.2% / happened 68.7% (was 74.0%); log loss -68e-5
// Form = rates per 60 over the most recent ~120 minutes of ice time (needs 90+) vs the season rate per 60
// (shrunk with 600 minutes of league average), log ratio clipped to 1/4..4:
//   own expected goals (shots weighted by danger — SOG + high-danger volume in one number) and the team's
//   expected goals with this skater on the ice. For POINTS both add (coef .048 / .136, log loss -10e-5 beyond
//   calibration). For GOALS the own-xG term added almost nothing once calibrated (-1e-5), so it's left out:
//   the "secondary scorer firing more shots and HD chances" group (1.09x before) is 1.03x after calibration
//   alone — the model was under-rating those mid-tier players in general, not missing their effort.
export const CALIBRATION = {
  goal: { a: 0.593, b: -0.1102, c: -0.3032 },
  point: { a: 0.8291, b: -0.0348, c: -0.0489, xg: 0.048, oxg: 0.1355 },
  windowSec: 7200, minSec: 5400, priorSec: 36000,
};

const logit = (p) => Math.log(p / (1 - p));
const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const clipLog = (r) => (r > 0 && Number.isFinite(r) ? Math.log(Math.min(4, Math.max(0.25, r))) : 0);

// League rates per second of ice time for the slate (own xG and on-ice xG for), skaters with 10+ games.
export function slateRates(players) {
  let toi = 0, xg = 0, oxg = 0;
  for (const p of players) {
    if ((p.games_played || 0) < 10 || !p.icetime) continue;
    toi += p.icetime; xg += p.xG || 0; oxg += p.onIceXgf || 0;
  }
  return toi ? { xg: xg / toi, oxg: oxg / toi } : null;
}

// Last ~120 minutes of ice time from the last7 log vs the season rate. { xg, oxg } log ratios (0 = no data).
export function formRatios(p, lg) {
  const out = { xg: 0, oxg: 0, minutes: 0 };
  if (!lg || !p.icetime) return out;
  let sec = 0, xg = 0, oxg = 0, hasO = true;
  for (const g of [...(p.last7 || [])].reverse()) {
    if (sec >= CALIBRATION.windowSec) break;
    sec += g.icetime || 0; xg += g.xg || 0;
    if (g.oxg == null) hasO = false; else oxg += g.oxg;
  }
  out.minutes = sec / 60;
  if (sec < CALIBRATION.minSec) return out;
  const K = CALIBRATION.priorSec;
  const seasonXg = ((p.xG || 0) + K * lg.xg) / (p.icetime + K);
  out.xg = clipLog(xg / sec / seasonXg);
  if (hasO && p.onIceXgf != null) out.oxg = clipLog(oxg / sec / (((p.onIceXgf || 0) + K * lg.oxg) / (p.icetime + K)));
  return out;
}

export function calibrateGoal(p) {
  const L = logit(Math.min(Math.max(p, 1e-4), 1 - 1e-4)), c = CALIBRATION.goal;
  return sigmoid(c.a * L + c.b * L * L + c.c);
}

export function calibratePoint(p, form = { xg: 0, oxg: 0 }) {
  const L = logit(Math.min(Math.max(p, 1e-4), 1 - 1e-4)), c = CALIBRATION.point;
  return sigmoid(c.a * L + c.b * L * L + c.c + c.xg * form.xg + c.oxg * form.oxg);
}
