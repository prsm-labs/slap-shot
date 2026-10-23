// 🔥 Due + heating up — a skater whose chances are rising but the goals haven't come, into a soft defense.
//
// Backtest (2026-10-13, scratch drought_combo.py): 69,577 Feb-Apr skater-games 2022-23 .. 2025-26, grade model fit
// Nov-Jan each season, lift = goals vs what the app predicts (grade model + refit matchup adjustment):
//   no goal in last 1 / 3 / 8 games alone ............ 0.99 / 1.00 / 0.99   ("due" by itself is nothing)
//   no goal 1+ & xG last 5 > 1.3x season & soft D .... 1.06  (1.07 / 1.06 / 1.06 / 1.06 by season)
//   no goal 2+ & same ................................ 1.08  (1.15 / 1.05 / 1.07 / 1.05)
//   no goal 3+ & same ................................ 1.13  (1.21 / 1.10 / 1.16 / 1.03)
//   same, but the season's top-25% scorers ........... 0.89-0.94 — stars are already priced in, so excluded.
// Why: rising expected goals without goals = cold finishing, which tends to correct; a plain drought usually just
// means no chances. Each season agrees but any one season is about ±0.10, so the boost is set a bit under the
// measured lift: x1.06 at 2 games without a goal, x1.10 at 3+.
import { xgTrendMap } from "./breakout.js";

export const DUE = { minDrought: 2, trend: 1.3, soft: 0.67, notTop: 0.75, mult: { 2: 1.06, 3: 1.10 } };

// Games in a row without a goal, most recent first (from the last7 game log; 7 = at least 7).
export function goalDrought(p) {
  const games = p.last7 || [];
  let n = 0;
  for (let i = games.length - 1; i >= 0 && !(games[i].goals > 0); i--) n++;
  return n;
}

function pctRank(rows, get) {
  const sorted = [...rows].sort((a, b) => get(a) - get(b));
  const out = new Map();
  sorted.forEach((r, i) => out.set(r.playerId, sorted.length > 1 ? i / (sorted.length - 1) : 0.5));
  return out;
}

// players: tonight's slate skaters. Returns Map playerId -> { drought, xgTrend, mult } for those who qualify.
export function dueHeatMap(players) {
  const rows = players.filter((p) => p.opponentTeamxGA60 != null && (p.games_played || 0) > 0);
  const out = new Map();
  if (!rows.length) return out;
  const trends = xgTrendMap(rows);
  const soft = pctRank(rows, (p) => p.opponentTeamxGA60);
  const scorer = pctRank(rows, (p) => trends.get(p.playerId)?.xgSeason ?? 0);
  for (const p of rows) {
    const t = trends.get(p.playerId);
    const drought = goalDrought(p);
    if (!t || drought < DUE.minDrought || t.xgTrend <= DUE.trend) continue;
    if (soft.get(p.playerId) < DUE.soft || scorer.get(p.playerId) >= DUE.notTop) continue;
    out.set(p.playerId, { drought, xgTrend: t.xgTrend, mult: drought >= 3 ? DUE.mult[3] : DUE.mult[2] });
  }
  return out;
}

export function dueHeatText(d) {
  if (!d) return "";
  // past-night snapshots (date picker) keep only the multiplier, not the inputs
  if (typeof d !== "object" || d.xgTrend == null) return `🔥 Due + heating up${typeof d === "number" ? `: goal chance x${d.toFixed(2)}` : d?.mult != null ? `: goal chance x${Number(d.mult).toFixed(2)}` : ""} (backtested, non-stars only)`;
  return `🔥 Due + heating up: no goal in ${d.drought >= 7 ? "7+" : d.drought} games, expected goals last 5 at ${d.xgTrend.toFixed(1)}x the season rate, soft defense tonight — goal chance x${d.mult.toFixed(2)} (backtested, non-stars only)`;
}
