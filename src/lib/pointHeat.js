// 🍎 Points due — no point lately, but the team keeps generating chances with this skater on the ice.
//
// Backtest (2026-10-14, scratch point_heat.py / point_heat2.py): 69,577 Feb-Apr skater-games 2022-23 .. 2025-26, grade
// model fit Nov-Jan each season, lift = points vs what the app predicts (grade model + refit matchup adjustment):
//   own SOG / HD shots / attempts last 5 up (any position) .... 0.95-1.01  (defensemen with rising shots: 0.95 —
//                                                                 shooting more doesn't turn into points)
//   on-ice xG for last 5 > 1.2x season ...................... 1.03
//   no point in 2+ / 3+ games alone .......................... 1.02 / 1.04
//   no point 2+ & on-ice xGF > 1.2x, outside model top 25% ... 1.12  (1.13 / 1.08 / 1.13 / 1.14 by season, ±0.06)
//   no point 3+ & same ....................................... 1.14  (1.14 / 1.05 / 1.22 / 1.13, ±0.08)
//   same, model's top 25% ................................... 0.96-0.99 — already priced in, so excluded.
//   soft defense on top added little (the point % already carries the matchup).
// Why: the chances are coming with this skater out there; the points haven't yet. Boost set under the measured lift:
// x1.07 at 2 games without a point, x1.10 at 3+.
export const POINT_DUE = { minDrought: 2, trend: 1.2, notTop: 0.75, priorGames: 10, mult: { 2: 1.07, 3: 1.10 } };

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// Games in a row without a point, most recent first (from the last7 game log; 7 = at least 7).
export function pointDrought(p) {
  const games = p.last7 || [];
  let n = 0;
  for (let i = games.length - 1; i >= 0 && !(games[i].points > 0); i--) n++;
  return n;
}

function pctRank(rows, get) {
  const sorted = [...rows].sort((a, b) => get(a) - get(b));
  const out = new Map();
  sorted.forEach((r, i) => out.set(r.playerId, sorted.length > 1 ? i / (sorted.length - 1) : 0.5));
  return out;
}

// players: tonight's graded slate skaters (modelProbs.point; last7 with oxg; onIceXgf season total).
// Returns Map playerId -> { drought, oxgL5, oxgSeason, trend, mult } for those who qualify.
export function pointHeatMap(players) {
  const rows = players.filter((p) => p.modelProbs?.point != null && (p.games_played || 0) > 0 && p.onIceXgf != null);
  const out = new Map();
  if (!rows.length) return out;
  const lg = mean(rows.filter((p) => p.games_played >= 10).map((p) => p.onIceXgf / p.games_played));
  const top = pctRank(rows, (p) => p.modelProbs.point);
  for (const p of rows) {
    const recent = (p.last7 || []).slice(-5).filter((g) => g.oxg != null);
    if (recent.length < 3) continue;
    const drought = pointDrought(p);
    if (drought < POINT_DUE.minDrought || top.get(p.playerId) >= POINT_DUE.notTop) continue;
    const oxgL5 = mean(recent.map((g) => g.oxg));
    const oxgSeason = (p.onIceXgf + POINT_DUE.priorGames * lg) / (p.games_played + POINT_DUE.priorGames);
    const trend = oxgL5 / oxgSeason;
    if (trend <= POINT_DUE.trend) continue;
    out.set(p.playerId, { drought, oxgL5, oxgSeason, trend, mult: drought >= 3 ? POINT_DUE.mult[3] : POINT_DUE.mult[2] });
  }
  return out;
}

export function pointHeatText(d) {
  if (!d) return "";
  return `🍎 Points due: no point in ${d.drought >= 7 ? "7+" : d.drought} games, but the team's expected goals with this skater on the ice ran ${d.oxgL5.toFixed(2)}/game over the last 5 (${d.trend.toFixed(1)}x the season ${d.oxgSeason.toFixed(2)}) — point chance x${d.mult.toFixed(2)} (backtested 4 seasons: +12-14% more points than expected, outside the top 25%)`;
}
