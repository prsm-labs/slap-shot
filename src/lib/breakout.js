// Breakout Watch — skaters the grade model doesn't already rank among tonight's top scorers, whose
// shot quality has jumped over their last 5 games, facing one of tonight's softer defenses.
//
// Backtested on 2025-26 (scratch, point-in-time; Nov-Jan / Feb-Apr), goals scored vs. the grade
// model's own expectation for the same players:
//   xG last 5 > 1.3x season rate AND opponent xGA allowed in the slate's top third, among skaters
//   outside the model's top 15%:  1.20x / 1.29x (points 1.11x / 1.11x); ~23 per full slate.
//   (HD shots + attempts rising with a soft matchup: 1.20x / 1.19x. Rising trends without the soft
//   matchup: only 1.02-1.13x.)
// Head-to-head history (vs the team, vs the goalie) did NOT hold up (0.99x / 1.12x and 1.03x / 1.11x,
// and nothing in a model test), so it's shown as context only, never used to qualify or rank.

const TREND = 1.3;
const NOT_TOP = 0.85;      // outside the model's top 15% tonight
const SOFT = 0.67;         // opponent xGA allowed in tonight's top third
const PRIOR_GAMES = 10;    // shrink a player's season rate toward the league with 10 games of average

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function pctRank(rows, get) {
  const sorted = [...rows].sort((a, b) => get(a) - get(b));
  const out = new Map();
  sorted.forEach((r, i) => out.set(r.playerId, sorted.length > 1 ? i / (sorted.length - 1) : 0.5));
  return out;
}

// players: tonight's eligible skaters from the live pool (modelProbs, last7 with xg / hd / shotAttempts).
export function breakoutBoard(players) {
  const rows = players.filter((p) => p.modelProbs?.goal != null && p.opponentTeamxGA60 != null && (p.games_played || 0) > 0);
  if (!rows.length) return { list: [], eligible: 0 };
  const per = (p, k) => (p[k] || 0) / p.games_played;
  const league = {
    xg: mean(rows.filter((p) => p.games_played >= 10).map((p) => per(p, "xG"))),
    hd: mean(rows.filter((p) => p.games_played >= 10).map((p) => per(p, "HDCF"))),
    att: mean(rows.filter((p) => p.games_played >= 10).map((p) => per(p, "ICF"))),
  };
  const seasonRate = (p, k, lg) => ((p[k] || 0) + PRIOR_GAMES * lg) / (p.games_played + PRIOR_GAMES);
  const q = pctRank(rows, (p) => p.modelProbs.goal);
  const m = pctRank(rows, (p) => p.opponentTeamxGA60);
  const teams = [...new Set(rows.map((p) => p.opponentTeam))];
  const xga = new Map(rows.map((p) => [p.opponentTeam, p.opponentTeamxGA60]));
  const softRank = new Map(teams.sort((a, b) => xga.get(b) - xga.get(a)).map((t, i) => [t, i + 1]));

  const list = [];
  for (const p of rows) {
    const recent = (p.last7 || []).slice(-5).filter((g) => g.xg != null);
    if (recent.length < 3) continue;
    const l5 = (k) => mean(recent.map((g) => g[k] || 0));
    const xgTrend = l5("xg") / seasonRate(p, "xG", league.xg);
    const r = {
      ...p,
      quality: q.get(p.playerId), softness: m.get(p.playerId), softRank: softRank.get(p.opponentTeam), softOf: teams.length,
      xgL5: l5("xg"), xgSeason: seasonRate(p, "xG", league.xg), xgTrend,
      hdTrend: l5("hd") / seasonRate(p, "HDCF", league.hd),
      attTrend: l5("shotAttempts") / seasonRate(p, "ICF", league.att),
      recentGames: recent.length,
    };
    if (r.quality < NOT_TOP && r.softness >= SOFT && xgTrend > TREND) list.push(r);
  }
  // Strongest underlying chance first; the trend and matchup are what got them on the list.
  list.sort((a, b) => b.modelProbs.goal - a.modelProbs.goal);
  return { list, eligible: rows.length };
}
