// Crease Lab — tonight's goalie projections: shots against, goals allowed, saves, and the chance
// of 20/25/30/35+ saves. Backtested on 2025-26 using only games before each one (2,133 starter
// games after the first ~200 of the season):
//   - Shots against = opponent's shots-for per game x this team's shots-against per game ÷ league
//     average (best of 7 versions tried: MAE 4.88 shots vs 5.18 for "league average"),
//     then pulled 20% back toward league average — the busiest projections ran about a save high.
//   - Save % = goalie's saves + 500 league-average shots, ÷ (shots faced + 500) — the best prior
//     size tested (0 / 250 / 500 / 1,000 / 2,000 / 4,000 / league-only).
//   - Saves vary around the projection with sd 6.07 (measured); the "N+ saves" odds use that
//     spread and lined up with outcomes (e.g. 25+ saves: said 50%, happened 49%).
//   - 2026-10-26: shots and save % are re-levelled to this season's league (meta.league.now, built by
//     build_player_pool.py: this season + a 100-game prior at last season's rate). Both fall season after season, and
//     the two-season pool lagged: live 9/29-10/24 starters ran 0.8 saves high (25+ saves said 51%, happened 45%);
//     re-levelled -0.43 (said 49%). Most of the rest is pulled starters (17 of 332).
const SV_PRIOR_SHOTS = 500;
const SHRINK_TO_LEAGUE = 0.8;
const SAVES_SD = 6.07;
export const SAVE_LINES = [20, 25, 30, 35];

function normCdf(x) {
  // Abramowitz-Stegun approximation of the standard normal CDF.
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

// goalie: pool goalie row (may be missing for a goalie with no NHL games); team / opp: abbrevs;
// meta: pool _meta (teams + league).
export function projectGoalie(goalie, team, opp, meta) {
  const league = meta?.league || { sogPerTeamGame: 27.5, savePct: 0.895 };
  const tm = meta?.teams?.[team];
  const op = meta?.teams?.[opp];
  const raw = tm && op ? (op.sogFor * tm.sogAgainst) / league.sogPerTeamGame : league.sogPerTeamGame;
  const now = league.now;
  const level = now?.sogPerTeamGame ? now.sogPerTeamGame / league.sogPerTeamGame : 1;
  const shots = (league.sogPerTeamGame + SHRINK_TO_LEAGUE * (raw - league.sogPerTeamGame)) * level;

  const faced = goalie?.sogFaced || 0;
  const saved = faced - (goalie?.goalsAllowed || 0);
  const savePct = (saved + SV_PRIOR_SHOTS * league.savePct) / (faced + SV_PRIOR_SHOTS) + (now?.savePct ? now.savePct - league.savePct : 0);

  const saves = shots * savePct;
  const lines = Object.fromEntries(
    SAVE_LINES.map((n) => [n, Math.round((1 - normCdf((n - 0.5 - saves) / SAVES_SD)) * 1000) / 10])
  );
  return {
    shots: Math.round(shots * 10) / 10,
    saves: Math.round(saves * 10) / 10,
    goalsAllowed: Math.round(shots * (1 - savePct) * 100) / 100,
    savePct,
    lines,
    oppShotsFor: op?.sogFor ?? null,
    teamShotsAgainst: tm?.sogAgainst ?? null,
    sample: faced,
  };
}
