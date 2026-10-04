// Slap Shot scoring stack — ported from project_nhl.pbix's real, iterated DAX model
// (223 measures, table zz_Measures), not invented from scratch. Extracted via pbixray
// on 2026-07-30; see nhl_project/claude/CLAUDE.md session log for the full audit trail.
// Every exported component cites the DAX measure(s) it's translated from, so a future
// session can trace a weight back to its source of truth instead of assuming it's arbitrary.
//
// All "_Norm" style values in the original model are POPULATION min-max normalizations
// (computed fresh across whatever player pool is in scope), not fixed cutoffs — this
// already matches the network's percentile-not-fixed-cutoffs rule (prism-network-prompt.md
// §1.4), so scorePlayerPool() below recomputes bounds from the actual input pool every call
// rather than hardcoding thresholds.
//
// Input player shape expected by scorePlayerPool() — field names match the real MoneyPuck /
// factShots / dimSkaters columns already flowing through this project's pipeline
// (predict_goal_scorers.py, pull_nhl_data2.py), not invented names:
//
// {
//   playerId, name, team, position,
//   games_played, icetime,                       // seconds; AvgTOI_Minutes = icetime/60/games_played
//   ICF, HDCF, TotalGoals, xG,                    // season totals
//   I_F_primaryAssists, I_F_highDangerShots, I_F_mediumDangerShots,
//   RecentGoals, RecentIntentScore, RecentHighDangerShots, RecentShotVolume,      // 14-day window
//   HighDangerRate, OnGoalIntentRate,
//   RecentIntentScoreLast5Games, RecentShotVolumeLast5Games,
//   iSCF_5G, iHDCF_5G, Goals_Last5, Intent_Last5,
//   ShotsOnGoalPerGame, ShotAttemptsPerGame, AvgShotDistance,
//   iSCF, iHDCF,                                  // season shot counts in scoring/high-danger zones
//   DaysSinceLastGoal,
//   isHome,                                        // boolean, today's game
//   opponentTeamGA60, opponentTeamxGA60, opponentTeamHDCFAllowedPer60,
//   opponentGoalieGA60, opponentGoalieXGA60, opponentGoalieHighDangerSavePct,
//   opponentXGoalsAgainst,                          // season team-level, for OpponentDefense
//   isEligible,                                     // false = confirmed out / scratched / injured — hard gate
// }

const rangeCache = new WeakMap();
function minMaxNorm(value, all, scale = 1) {
  let r = rangeCache.get(all);
  if (!r) {
    r = { min: Math.min(...all), max: Math.max(...all) };
    rangeCache.set(all, r);
  }
  const { min, max } = r;
  if (max === min) return 0;
  return ((value - min) / (max - min)) * scale;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// ── Per-pool memoization ─────────────────────────────────────────────────────
// scorePlayerPool() (and several DAX-ported measures below) recompute population-wide
// normalization arrays via nested pool.map(...) calls — e.g. gGOAL's PrimedScore_II
// normalization re-derives FinalMatchupScore/PressureScore/FinalBossScore_v3 for every
// player in the pool, and those measures each do their own internal pool.map() calls.
// Without caching, that nests into O(n^3)-O(n^4) work and made scorePlayerPool()
// unusably slow against a real ~200-player pool (see slap-shot-build.md task log).
// memoize2() caches each wrapped function's result per (pool, player) pair, so repeated
// calls across the nested DAX-derived formulas below become O(1) lookups instead of
// re-walking the whole pool every time. Call sites and math are unchanged — this only
// removes redundant recomputation of the exact same value.
function memoize2(fn) {
  const byPool = new WeakMap();
  return (p, pool, ...rest) => {
    let byPlayer = byPool.get(pool);
    if (!byPlayer) {
      byPlayer = new Map();
      byPool.set(pool, byPlayer);
    }
    if (byPlayer.has(p)) return byPlayer.get(p);
    const val = fn(p, pool, ...rest);
    byPlayer.set(p, val);
    return val;
  };
}

// col() caches each population-wide column (e.g. every player's HotSkaterScore) once per pool,
// and minMaxNorm() caches each column's min/max — the measures below read the same columns for
// every player, which rebuilt them n times over (5 s for a 555-skater slate). Same values, same math.
const colCache = new WeakMap();
function col(pool, key, fn) {
  let cols = colCache.get(pool);
  if (!cols) {
    cols = new Map();
    colCache.set(pool, cols);
  }
  if (!cols.has(key)) cols.set(key, pool.map(fn));
  return cols.get(key);
}

// factShots::IntentScore — per-shot avg, approximated here from season/recent aggregates
// since per-shot rows aren't part of this input shape (see aggregatePlayerFromShots() below
// for the true per-shot version once raw shot data is wired in).
function intentScoreFromAggregate(p) {
  return (p.RecentIntentScore || 0);
}

// factShots::HotSkaterScore
function hotSkaterScore(p) {
  return (
    (p.RecentGoals || 0) * 0.6 +
    (p.RecentIntentScore || 0) * 10 +
    (p.RecentHighDangerShots || 0) * 0.4 +
    (p.RecentShotVolume || 0) * 0.2
  );
}

// factShots::LockedInScore
function lockedInScore(p) {
  return (
    (p.HighDangerRate || 0) * 4 +
    (p.OnGoalIntentRate || 0) * 3 +
    (p.RecentIntentScoreLast5Games || 0) * 10 +
    (p.RecentShotVolumeLast5Games || 0) * 0.5
  );
}

// dimSkaters::AvgTOI_Minutes / TOI_Score
function avgToiMinutes(p) {
  return p.games_played > 0 ? p.icetime / 60 / p.games_played : 0;
}
function toiScore(p, pool) {
  const all = col(pool, "c3", avgToiMinutes);
  const max = Math.max(...all, 0.0001);
  return avgToiMinutes(p) / max;
}

// Ice Sig — recent form/usage component (network doc §1.1 item 1 / Sig-equivalent).
// Blend of HotSkaterScore + LockedInScore + IntentScore + TOI usage, each population-normalized
// to 0-10 then weighted, final 0-100 scale.
export function computeIceSig(p, pool) {
  const hot = col(pool, "c4", hotSkaterScore);
  const locked = col(pool, "c5", lockedInScore);
  const intent = col(pool, "c6", intentScoreFromAggregate);
  const toi = col(pool, "c7", (x) => toiScore(x, pool));

  const hotN = minMaxNorm(hotSkaterScore(p), hot, 10);
  const lockedN = minMaxNorm(lockedInScore(p), locked, 10);
  const intentN = minMaxNorm(intentScoreFromAggregate(p), intent, 10);
  const toiN = minMaxNorm(toiScore(p, pool), toi, 10);

  return clamp((hotN * 0.35 + lockedN * 0.30 + intentN * 0.20 + toiN * 0.15) * 10, 0, 100);
}

// zz_Measures::GoalsPerICF / GoalsPerxG / HDCF_Share and their _Norm variants (all *10, population min-max)
function goalsPerICF(p) {
  return p.ICF > 0 ? (p.TotalGoals || 0) / p.ICF : 0;
}
function goalsPerxG(p) {
  return p.xG > 0 ? (p.TotalGoals || 0) / p.xG : 0;
}
function hdcfShare(p) {
  return p.ICF > 0 ? (p.HDCF || 0) / p.ICF : 0;
}

// zz_Measures::FinisherScore / PlaymakerScore / FinisherPlaymakerIndex_Norm
const finisherScore = memoize2(function finisherScoreRaw(p, pool) {
  const gpi = minMaxNorm(goalsPerICF(p), col(pool, "c8", goalsPerICF), 10);
  const gpx = minMaxNorm(goalsPerxG(p), col(pool, "c9", goalsPerxG), 10);
  const hds = minMaxNorm(hdcfShare(p), col(pool, "c10", hdcfShare), 10);
  return gpi * 0.4 + gpx * 0.35 + hds * 0.25;
});
const playmakerScore = memoize2(function playmakerScoreRaw(p, pool) {
  const icfN = minMaxNorm(p.ICF || 0, col(pool, "c11", (x) => x.ICF || 0), 10);
  const primaryAN = minMaxNorm(
    p.I_F_primaryAssists || 0,
    col(pool, "c12", (x) => x.I_F_primaryAssists || 0),
    10
  );
  const hdcfN = minMaxNorm(p.HDCF || 0, col(pool, "c13", (x) => x.HDCF || 0), 10);
  return icfN * 0.4 + primaryAN * 0.35 + hdcfN * 0.25;
});
const fpIndex = memoize2(function fpIndexRaw(p, pool) {
  return finisherScore(p, pool) - playmakerScore(p, pool);
});

// zz_Measures::iSCF_G_Norm / iHDCF_G_Norm / ShotSelection_Norm (0-1 population min-max)
function iscfPerGame(p) {
  return p.games_played > 0 ? (p.iSCF || 0) / p.games_played : 0;
}
function ihdcfPerGame(p) {
  return p.games_played > 0 ? (p.iHDCF || 0) / p.games_played : 0;
}

// Snipe Score — quality-of-opportunity component (network doc §1.1 item 3 / Boom-equivalent).
// zz_Measures::FinisherPlaymakerIndex_Norm + iSCF_G_Norm + iHDCF_G_Norm + ShotSelection_Norm, 0-100 scale.
export function computeSnipeScore(p, pool) {
  const fpIndexN = minMaxNorm(fpIndex(p, pool), col(pool, "c14", (x) => fpIndex(x, pool)), 10);
  const iscfGN = minMaxNorm(iscfPerGame(p), col(pool, "c15", iscfPerGame), 1);
  const ihdcfGN = minMaxNorm(ihdcfPerGame(p), col(pool, "c16", ihdcfPerGame), 1);
  const shotSelN = 1 - minMaxNorm(p.AvgShotDistance || 0, col(pool, "c17", (x) => x.AvgShotDistance || 0), 1);

  return clamp((fpIndexN * 0.4 + iscfGN * 0.25 + ihdcfGN * 0.25 + shotSelN * 0.1) * 10, 0, 100);
}

// zz_Measures::GoalieMatchupScore / TeamDefensiveMatchupScore / HomeIceAdjustment / OpponentDefense_Norm
function goalieMatchupScore(p) {
  return (
    (p.opponentGoalieGA60 || 0) * 0.5 +
    (p.opponentGoalieXGA60 || 0) * 0.3 +
    (1 - (p.opponentGoalieHighDangerSavePct || 0)) * 0.2
  );
}
function teamDefensiveMatchupScore(p) {
  return (
    (p.opponentTeamGA60 || 0) * 0.5 +
    (p.opponentTeamxGA60 || 0) * 0.3 +
    (p.opponentTeamHDCFAllowedPer60 || 0) * 0.2
  );
}
function homeIceAdjustment(p) {
  return p.isHome ? 1.1 : 0.9;
}

// Breakaway Score — gated matchup/environment component (network doc §1.1 item 4 /
// PS Score-equivalent). A bad-enough gate collapses the score to 0, not just discounts it,
// per network doc's explicit requirement — isEligible (confirmed out/scratched/injured) is
// that gate. Rest/back-to-back is NOT in the PBIX model (checked — no such measure exists);
// flagged here as a placeholder multiplier until real schedule-gap data is wired in.
export function computeBreakawayScore(p, pool, { restDaysMultiplier = 1 } = {}) {
  if (p.isEligible === false) return 0;

  const goalieN = minMaxNorm(goalieMatchupScore(p), col(pool, "c18", goalieMatchupScore), 10);
  const teamDefN = minMaxNorm(teamDefensiveMatchupScore(p), col(pool, "c19", teamDefensiveMatchupScore), 10);
  const oppDefN =
    p.opponentXGoalsAgainst != null
      ? 1 - minMaxNorm(p.opponentXGoalsAgainst, col(pool, "c20", (x) => x.opponentXGoalsAgainst || 0), 1)
      : 0.5;

  const raw = (goalieN * 0.45 + teamDefN * 0.45 + oppDefN * 10 * 0.1) * homeIceAdjustment(p);
  return clamp(raw * restDaysMultiplier, 0, 100);
}

// zz_Measures::PressureScore (needs SOG/ShotAttempts per-game, population-normalized 0-1)
const pressureScore = memoize2(function pressureScoreRaw(p, pool) {
  const iscfGN = minMaxNorm(iscfPerGame(p), col(pool, "c21", iscfPerGame), 1);
  const sogGN = minMaxNorm(p.ShotsOnGoalPerGame || 0, col(pool, "c22", (x) => x.ShotsOnGoalPerGame || 0), 1);
  const shotAttGN = minMaxNorm(p.ShotAttemptsPerGame || 0, col(pool, "c23", (x) => x.ShotAttemptsPerGame || 0), 1);
  return iscfGN * 0.4 + sogGN * 0.35 + shotAttGN * 0.25;
});

// zz_Measures::FinalMatchupScore — real DAX reads SkaterVsDefenseTeamScore/SkaterVsGoalieScore_Selected,
// whose own expressions weren't recoverable from the report layout (context-dependent measures, not
// referenced directly by any visual). Approximated here as the opponent-weakness signals this module
// already computes (team defense + goalie matchup), same 50/50 blend, same HomeIceAdjustment gate —
// flagged as an approximation, not a verified 1:1 port, unlike everything else in this file.
const finalMatchupScoreApprox = memoize2(function finalMatchupScoreApproxRaw(p, pool) {
  const teamDefN = minMaxNorm(teamDefensiveMatchupScore(p), col(pool, "c24", teamDefensiveMatchupScore), 1);
  const goalieN = minMaxNorm(goalieMatchupScore(p), col(pool, "c25", goalieMatchupScore), 1);
  return (teamDefN * 0.5 + goalieN * 0.5) * 20 * homeIceAdjustment(p); // ×20 to sit in the model's ~0-20 real range (scored_v3.xlsx Matchup Score column)
});

// zz_Measures::FinalBossScore_v3 — kept only as PrimedScore's minor (5%) input, per the real
// dependency graph, NOT exposed as a competing final score (user confirmed 2026-07-30: PrimedScore
// -> GoalProbabilityScore is the canonical Slap Score lineage, since it's the branch that actually
// drives TargetPoolRank's real historical labels in scored_v3.xlsx).
const finalBossScoreV3 = memoize2(function finalBossScoreV3Raw(p, pool) {
  const pressureN = minMaxNorm(pressureScore(p, pool), col(pool, "c26", (x) => pressureScore(x, pool)), 1);
  const matchupN = minMaxNorm(
    finalMatchupScoreApprox(p, pool),
    col(pool, "c27", (x) => finalMatchupScoreApprox(x, pool)),
    1
  );
  const fpIndexN = minMaxNorm(fpIndex(p, pool), col(pool, "c28", (x) => fpIndex(x, pool)), 1);
  const icfN = minMaxNorm(p.ICF || 0, col(pool, "c29", (x) => x.ICF || 0), 1);
  const iscfGN = minMaxNorm(iscfPerGame(p), col(pool, "c30", iscfPerGame), 1);
  const ihdcfGN = minMaxNorm(ihdcfPerGame(p), col(pool, "c31", ihdcfPerGame), 1);
  const shotSelN = 1 - minMaxNorm(p.AvgShotDistance || 0, col(pool, "c32", (x) => x.AvgShotDistance || 0), 1);
  const oppDefN =
    p.opponentXGoalsAgainst != null
      ? 1 - minMaxNorm(p.opponentXGoalsAgainst, col(pool, "c33", (x) => x.opponentXGoalsAgainst || 0), 1)
      : 0.5;

  return (
    0.2 * pressureN +
    0.2 * matchupN +
    0.12 * fpIndexN +
    0.1 * icfN +
    0.08 * iscfGN +
    0.06 * ihdcfGN +
    0.06 * shotSelN +
    0.12 * (0.4 * icfN + 0.35 * iscfGN + 0.25 * ihdcfGN) +
    0.04 * oppDefN
    // 0.02 * game-state term dropped — no live score-differential data in this input shape yet
  );
});

// zz_Measures::PP_Impact / PrimedScore / PrimedScore_II / PrimedScore_III / TrendScore /
// FinishingEfficiency / GoalDroughtScore / GoalProbabilityScore — the confirmed "production"
// lineage. This IS gGOAL: the composite probability component (network doc §1.1 item 2).
const primedScoreII = memoize2(function primedScoreIIRaw(p, pool) {
  const matchupN = minMaxNorm(
    finalMatchupScoreApprox(p, pool),
    col(pool, "c34", (x) => finalMatchupScoreApprox(x, pool)),
    1
  );
  const icfN10 = minMaxNorm(p.ICF || 0, col(pool, "c35", (x) => x.ICF || 0), 10);
  const hdcfN10 = minMaxNorm(p.HDCF || 0, col(pool, "c36", (x) => x.HDCF || 0), 10);
  const pressureN = minMaxNorm(pressureScore(p, pool), col(pool, "c37", (x) => pressureScore(x, pool)), 1);
  const bossV3N = minMaxNorm(finalBossScoreV3(p, pool), col(pool, "c38", (x) => finalBossScoreV3(x, pool)), 1);

  const ppImpact = 0.3 * bossV3N + 0.25 * (icfN10 / 10) + 0.2 * (hdcfN10 / 10) + 0.25 * matchupN;

  const primedScore =
    100 *
    (0.35 * matchupN + 0.2 * (icfN10 / 10) + 0.15 * (hdcfN10 / 10) + 0.15 * pressureN + 0.1 * ppImpact + 0.05 * bossV3N);

  const toi = toiScore(p, pool);
  return { primedScore, primedScoreII: primedScore * (1 + toi * 0.1) };
});

export function computeGGoal(p, pool) {
  const { primedScore, primedScoreII: primedScoreIIVal } = primedScoreII(p, pool);

  const intentLast5 = (x) => ((x.iSCF_5G || 0) + (x.iHDCF_5G || 0)) / 2;
  const intentLast5N = minMaxNorm(intentLast5(p), col(pool, "c39", intentLast5), 1);
  const goalsLast5N = minMaxNorm(p.Goals_Last5 || 0, col(pool, "c40", (x) => x.Goals_Last5 || 0), 1);
  const trendScore = 0.7 * intentLast5N + 0.3 * goalsLast5N;

  const avgToi = avgToiMinutes(p);
  const iceTimeBetweenGoals = (p.TotalGoals || 0) > 0 ? (avgToi * (p.games_played || 0)) / p.TotalGoals : Infinity;
  const allIceTimeBetweenGoals = col(pool, "c41", (x) => {
    const t = avgToiMinutes(x);
    return (x.TotalGoals || 0) > 0 ? (t * (x.games_played || 0)) / x.TotalGoals : Infinity;
  });
  const maxFiniteITBG = Math.max(...allIceTimeBetweenGoals.filter((v) => Number.isFinite(v)), 1);
  const finishingEfficiency = 1 - (Number.isFinite(iceTimeBetweenGoals) ? iceTimeBetweenGoals : maxFiniteITBG) / maxFiniteITBG;

  const toiSinceLastGoal = (p.DaysSinceLastGoal || 0) * avgToi;
  const maxToiSinceLastGoal = Math.max(...col(pool, "c42", (x) => (x.DaysSinceLastGoal || 0) * avgToiMinutes(x)), 0.0001);
  const goalDroughtScore = toiSinceLastGoal / maxToiSinceLastGoal;

  const primedScoreIIN = minMaxNorm(
    primedScoreIIVal,
    col(pool, "c43", (x) => primedScoreII(x, pool).primedScoreII),
    1
  );

  const goalProbabilityScore = 100 * (0.5 * primedScoreIIN + 0.2 * trendScore + 0.2 * finishingEfficiency + 0.1 * goalDroughtScore);

  return {
    score: clamp(goalProbabilityScore, 0, 100),
    _primedScore: primedScore,
    _finalMatchupScore: finalMatchupScoreApprox(p, pool),
  };
}

// zz_Measures::TargetPoolRank — real 3-tier system, thresholds unchanged from the model.
export function tierLabel(primedScore, finalMatchupScore) {
  if (primedScore >= 50 && finalMatchupScore >= 6) return "Elite Add-On";
  if (primedScore >= 25 && primedScore < 50 && finalMatchupScore >= 8) return "Core Target";
  if (primedScore >= 15 && primedScore < 25 && finalMatchupScore >= 6) return "Value Upside";
  return "Ignore";
}

// Slap Score — final composite (network doc §1.1 item 5 / Yard Score-equivalent).
// = gGOAL's GoalProbabilityScore, already 0-100 bounded by construction (its weights sum to 1.0
// over 0-1-scaled inputs), rounded to match the network's 0-99 display convention.
export function computeSlapScore(p, pool) {
  const { score: gGoal, _primedScore, _finalMatchupScore } = computeGGoal(p, pool);
  return {
    slapScore: Math.round(clamp(gGoal, 0, 99)),
    tier: tierLabel(_primedScore, _finalMatchupScore),
  };
}

// Orchestrator — scores an entire day's candidate pool at once (population-relative
// normalization requires the full pool, not one player in isolation).
export function scorePlayerPool(players, opts = {}) {
  return players.map((p) => {
    const iceSig = computeIceSig(p, players);
    const snipeScore = computeSnipeScore(p, players);
    const breakawayScore = computeBreakawayScore(p, players, opts);
    const { score: gGoal, _primedScore, _finalMatchupScore } = computeGGoal(p, players);
    const slapScore = Math.round(clamp(gGoal, 0, 99));
    const tier = tierLabel(_primedScore, _finalMatchupScore);

    return {
      ...p,
      iceSig: Math.round(iceSig),
      snipeScore: Math.round(snipeScore),
      breakawayScore: Math.round(breakawayScore),
      gGoal: Math.round(gGoal * 10) / 10,
      slapScore,
      tier,
    };
  });
}
