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
// 3+ SOG (added 2026-10-14 for Pairs, scratch sog_calib.py; same 68,826 games, matchup 0.126 z): before, by fifth
//   0.86 1.02 1.08 1.01 0.90 (every season's top fifth 0.88-0.92; chance 55%+ said 67.2% / happened 58.4%; this season
//   57-87% bucket said 69.3% / happened 59.4%). a L + b L^2 + c + own SOG/60 over the last ~120 min vs season (log
//   ratio): every fifth 0.93-1.04, log loss -220e-5 (the form term is -10e-5 of it).
export const CALIBRATION = {
  goal: { a: 0.593, b: -0.1102, c: -0.3032 },
  sog3: { a: 0.7352, b: -0.0891, c: -0.1391, sog: 0.148 },
  point: { a: 0.8291, b: -0.0348, c: -0.0489, xg: 0.048, oxg: 0.1355 },
  windowSec: 7200, minSec: 5400, priorSec: 36000,
};

const logit = (p) => Math.log(p / (1 - p));
const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const clipLog = (r) => (r > 0 && Number.isFinite(r) ? Math.log(Math.min(4, Math.max(0.25, r))) : 0);

// League rates per second of ice time for the slate (own xG and on-ice xG for), skaters with 10+ games.
export function slateRates(players) {
  let toi = 0, xg = 0, oxg = 0, sog = 0;
  for (const p of players) {
    if ((p.games_played || 0) < 10 || !p.icetime) continue;
    toi += p.icetime; xg += p.xG || 0; oxg += p.onIceXgf || 0; sog += (p.ShotsOnGoalPerGame || 0) * p.games_played;
  }
  return toi ? { xg: xg / toi, oxg: oxg / toi, sog: sog / toi } : null;
}

// Last ~120 minutes of ice time from the last7 log vs the season rate. { xg, oxg, sog } log ratios (0 = no data).
export function formRatios(p, lg) {
  const out = { xg: 0, oxg: 0, sog: 0, minutes: 0 };
  if (!lg || !p.icetime) return out;
  let sec = 0, xg = 0, oxg = 0, sog = 0, hasO = true;
  for (const g of [...(p.last7 || [])].reverse()) {
    if (sec >= CALIBRATION.windowSec) break;
    sec += g.icetime || 0; xg += g.xg || 0; sog += g.sog || 0;
    if (g.oxg == null) hasO = false; else oxg += g.oxg;
  }
  out.minutes = sec / 60;
  if (sec < CALIBRATION.minSec) return out;
  const K = CALIBRATION.priorSec;
  const seasonXg = ((p.xG || 0) + K * lg.xg) / (p.icetime + K);
  out.xg = clipLog(xg / sec / seasonXg);
  if (lg.sog) out.sog = clipLog(sog / sec / ((((p.ShotsOnGoalPerGame || 0) * (p.games_played || 0)) + K * lg.sog) / (p.icetime + K)));
  if (hasO && p.onIceXgf != null) out.oxg = clipLog(oxg / sec / (((p.onIceXgf || 0) + K * lg.oxg) / (p.icetime + K)));
  return out;
}

export function calibrateGoal(p) {
  const L = logit(Math.min(Math.max(p, 1e-4), 1 - 1e-4)), c = CALIBRATION.goal;
  return sigmoid(c.a * L + c.b * L * L + c.c);
}

export function calibrateSog3(p, form = { sog: 0 }) {
  const L = logit(Math.min(Math.max(p, 1e-4), 1 - 1e-4)), c = CALIBRATION.sog3;
  return sigmoid(c.a * L + c.b * L * L + c.c + c.sog * (form.sog || 0));
}

export function calibratePoint(p, form = { xg: 0, oxg: 0 }) {
  const L = logit(Math.min(Math.max(p, 1e-4), 1 - 1e-4)), c = CALIBRATION.point;
  return sigmoid(c.a * L + c.b * L * L + c.c + c.xg * form.xg + c.oxg * form.oxg);
}

// Role / ice-time trend (2026-10-21, user: a colleague's "moves up to LW2 / PP1" write-up; scratch learn/nhl_role2.py, nhl_role3.py).
// dTOI = log(his ice time per game over his last 3 games THIS season / his rate over last season + this season), clipped 0.5-2,
// added after calibration: logit p' = logit p + coef x dTOI. Same 68,826 Feb-Apr skater-games, held out by season (log loss,
// e-5, negative = better): goal -10 / +8 / -32 / -72, point -48 / -27 / +4 / -131, assist -49 / -44 / +32 / -74, 3+ SOG
// -99 / -74 / -111 / -116. Live check on the locked 2026 snapshots 9/29-10/20 (3,399 skater-games with 3 games this season):
// goal -116, point -221, assist -114, 3+ SOG -91 (ice time up 10%+: goal said 13.6% / happened 15.8%; down 10%+: 14.5% / 11.1%).
// Power-play time change on its own did not hold (worse in 2 of 4 seasons and live), so it's not used.
export const ROLE = { goal: 0.637, point: 0.663, assist: 0.608, sog3: 0.949, games: 3 };

export function roleTrend(p) {
  const log = (p.last7 || []).filter((g) => g.icetime > 0);
  if (!log.length || !p.games_played || !p.icetime) return 0;
  const lastDate = log[log.length - 1].date;
  const y = Number(lastDate.slice(0, 4)) - (Number(lastDate.slice(5, 7)) < 8 ? 1 : 0);
  const season = log.filter((g) => g.date >= `${y}-08-01`).slice(-ROLE.games);
  if (season.length < ROLE.games) return 0;
  const recent = season.reduce((s, g) => s + g.icetime, 0) / season.length;
  return Math.log(Math.min(2, Math.max(0.5, recent / (p.icetime / p.games_played))));
}

export function applyRole(prob, key, dTOI) {
  if (prob == null || !dTOI || !ROLE[key]) return prob;
  return sigmoid(logit(Math.min(Math.max(prob, 1e-4), 1 - 1e-4)) + ROLE[key] * dTOI);
}
