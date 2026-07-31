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

function minMaxNorm(value, all, scale = 1) {
  const min = Math.min(...all);
  const max = Math.max(...all);
  if (max === min) return 0;
  return ((value - min) / (max - min)) * scale;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
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
  const all = pool.map(avgToiMinutes);
  const max = Math.max(...all, 0.0001);
  return avgToiMinutes(p) / max;
}

// Ice Sig — recent form/usage component (network doc §1.1 item 1 / Sig-equivalent).
// Blend of HotSkaterScore + LockedInScore + IntentScore + TOI usage, each population-normalized
// to 0-10 then weighted, final 0-100 scale.
export function computeIceSig(p, pool) {
  const hot = pool.map(hotSkaterScore);
  const locked = pool.map(lockedInScore);
  const intent = pool.map(intentScoreFromAggregate);
  const toi = pool.map((x) => toiScore(x, pool));

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
function finisherScore(p, pool) {
  const gpi = minMaxNorm(goalsPerICF(p), pool.map(goalsPerICF), 10);
  const gpx = minMaxNorm(goalsPerxG(p), pool.map(goalsPerxG), 10);
  const hds = minMaxNorm(hdcfShare(p), pool.map(hdcfShare), 10);
  return gpi * 0.4 + gpx * 0.35 + hds * 0.25;
}
function playmakerScore(p, pool) {
  const icfN = minMaxNorm(p.ICF || 0, pool.map((x) => x.ICF || 0), 10);
  const primaryAN = minMaxNorm(
    p.I_F_primaryAssists || 0,
    pool.map((x) => x.I_F_primaryAssists || 0),
    10
  );
  const hdcfN = minMaxNorm(p.HDCF || 0, pool.map((x) => x.HDCF || 0), 10);
  return icfN * 0.4 + primaryAN * 0.35 + hdcfN * 0.25;
}

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
  const fpIndex = (x) => finisherScore(x, pool) - playmakerScore(x, pool);
  const fpIndexN = minMaxNorm(fpIndex(p), pool.map(fpIndex), 10);
  const iscfGN = minMaxNorm(iscfPerGame(p), pool.map(iscfPerGame), 1);
  const ihdcfGN = minMaxNorm(ihdcfPerGame(p), pool.map(ihdcfPerGame), 1);
  const shotSelN = 1 - minMaxNorm(p.AvgShotDistance || 0, pool.map((x) => x.AvgShotDistance || 0), 1);

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

  const goalieN = minMaxNorm(goalieMatchupScore(p), pool.map(goalieMatchupScore), 10);
  const teamDefN = minMaxNorm(teamDefensiveMatchupScore(p), pool.map(teamDefensiveMatchupScore), 10);
  const oppDefN =
    p.opponentXGoalsAgainst != null
      ? 1 - minMaxNorm(p.opponentXGoalsAgainst, pool.map((x) => x.opponentXGoalsAgainst || 0), 1)
      : 0.5;

  const raw = (goalieN * 0.45 + teamDefN * 0.45 + oppDefN * 10 * 0.1) * homeIceAdjustment(p);
  return clamp(raw * restDaysMultiplier, 0, 100);
}

// zz_Measures::PressureScore (needs SOG/ShotAttempts per-game, population-normalized 0-1)
function pressureScore(p, pool) {
  const iscfGN = minMaxNorm(iscfPerGame(p), pool.map(iscfPerGame), 1);
  const sogGN = minMaxNorm(p.ShotsOnGoalPerGame || 0, pool.map((x) => x.ShotsOnGoalPerGame || 0), 1);
  const shotAttGN = minMaxNorm(p.ShotAttemptsPerGame || 0, pool.map((x) => x.ShotAttemptsPerGame || 0), 1);
  return iscfGN * 0.4 + sogGN * 0.35 + shotAttGN * 0.25;
}

// zz_Measures::FinalMatchupScore — real DAX reads SkaterVsDefenseTeamScore/SkaterVsGoalieScore_Selected,
// whose own expressions weren't recoverable from the report layout (context-dependent measures, not
// referenced directly by any visual). Approximated here as the opponent-weakness signals this module
// already computes (team defense + goalie matchup), same 50/50 blend, same HomeIceAdjustment gate —
// flagged as an approximation, not a verified 1:1 port, unlike everything else in this file.
function finalMatchupScoreApprox(p, pool) {
  const teamDefN = minMaxNorm(teamDefensiveMatchupScore(p), pool.map(teamDefensiveMatchupScore), 1);
  const goalieN = minMaxNorm(goalieMatchupScore(p), pool.map(goalieMatchupScore), 1);
  return (teamDefN * 0.5 + goalieN * 0.5) * 20 * homeIceAdjustment(p); // ×20 to sit in the model's ~0-20 real range (scored_v3.xlsx Matchup Score column)
}

// zz_Measures::FinalBossScore_v3 — kept only as PrimedScore's minor (5%) input, per the real
// dependency graph, NOT exposed as a competing final score (user confirmed 2026-07-30: PrimedScore
// -> GoalProbabilityScore is the canonical Slap Score lineage, since it's the branch that actually
// drives TargetPoolRank's real historical labels in scored_v3.xlsx).
function finalBossScoreV3(p, pool) {
  const pressureN = minMaxNorm(pressureScore(p, pool), pool.map((x) => pressureScore(x, pool)), 1);
  const matchupN = minMaxNorm(
    finalMatchupScoreApprox(p, pool),
    pool.map((x) => finalMatchupScoreApprox(x, pool)),
    1
  );
  const fpIndex = (x) => finisherScore(x, pool) - playmakerScore(x, pool);
  const fpIndexN = minMaxNorm(fpIndex(p), pool.map(fpIndex), 1);
  const icfN = minMaxNorm(p.ICF || 0, pool.map((x) => x.ICF || 0), 1);
  const iscfGN = minMaxNorm(iscfPerGame(p), pool.map(iscfPerGame), 1);
  const ihdcfGN = minMaxNorm(ihdcfPerGame(p), pool.map(ihdcfPerGame), 1);
  const shotSelN = 1 - minMaxNorm(p.AvgShotDistance || 0, pool.map((x) => x.AvgShotDistance || 0), 1);
  const oppDefN =
    p.opponentXGoalsAgainst != null
      ? 1 - minMaxNorm(p.opponentXGoalsAgainst, pool.map((x) => x.opponentXGoalsAgainst || 0), 1)
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
}

// zz_Measures::PP_Impact / PrimedScore / PrimedScore_II / PrimedScore_III / TrendScore /
// FinishingEfficiency / GoalDroughtScore / GoalProbabilityScore — the confirmed "production"
// lineage. This IS gGOAL: the composite probability component (network doc §1.1 item 2).
export function computeGGoal(p, pool) {
  const matchupN = minMaxNorm(
    finalMatchupScoreApprox(p, pool),
    pool.map((x) => finalMatchupScoreApprox(x, pool)),
    1
  );
  const icfN10 = minMaxNorm(p.ICF || 0, pool.map((x) => x.ICF || 0), 10);
  const hdcfN10 = minMaxNorm(p.HDCF || 0, pool.map((x) => x.HDCF || 0), 10);
  const pressureN = minMaxNorm(pressureScore(p, pool), pool.map((x) => pressureScore(x, pool)), 1);
  const bossV3N = minMaxNorm(finalBossScoreV3(p, pool), pool.map((x) => finalBossScoreV3(x, pool)), 1);

  const ppImpact = 0.3 * bossV3N + 0.25 * (icfN10 / 10) + 0.2 * (hdcfN10 / 10) + 0.25 * matchupN;

  const primedScore =
    100 *
    (0.35 * matchupN + 0.2 * (icfN10 / 10) + 0.15 * (hdcfN10 / 10) + 0.15 * pressureN + 0.1 * ppImpact + 0.05 * bossV3N);

  const toi = toiScore(p, pool);
  const primedScoreII = primedScore * (1 + toi * 0.1);

  const intentLast5 = (p) => ((p.iSCF_5G || 0) + (p.iHDCF_5G || 0)) / 2;
  const intentLast5N = minMaxNorm(intentLast5(p), pool.map(intentLast5), 1);
  const goalsLast5N = minMaxNorm(p.Goals_Last5 || 0, pool.map((x) => x.Goals_Last5 || 0), 1);
  const trendScore = 0.7 * intentLast5N + 0.3 * goalsLast5N;

  const avgToi = avgToiMinutes(p);
  const iceTimeBetweenGoals = (p.TotalGoals || 0) > 0 ? (avgToi * (p.games_played || 0)) / p.TotalGoals : Infinity;
  const allIceTimeBetweenGoals = pool.map((x) => {
    const t = avgToiMinutes(x);
    return (x.TotalGoals || 0) > 0 ? (t * (x.games_played || 0)) / x.TotalGoals : Infinity;
  });
  const maxFiniteITBG = Math.max(...allIceTimeBetweenGoals.filter((v) => Number.isFinite(v)), 1);
  const finishingEfficiency = 1 - (Number.isFinite(iceTimeBetweenGoals) ? iceTimeBetweenGoals : maxFiniteITBG) / maxFiniteITBG;

  const toiSinceLastGoal = (p.DaysSinceLastGoal || 0) * avgToi;
  const maxToiSinceLastGoal = Math.max(...pool.map((x) => (x.DaysSinceLastGoal || 0) * avgToiMinutes(x)), 0.0001);
  const goalDroughtScore = toiSinceLastGoal / maxToiSinceLastGoal;

  const primedScoreIIN = minMaxNorm(
    primedScoreII,
    pool.map((x) => {
      // recompute primedScoreII inline for each pool member for population bounds
      const m = finalMatchupScoreApprox(x, pool);
      const mN = minMaxNorm(m, pool.map((y) => finalMatchupScoreApprox(y, pool)), 1);
      const i10 = minMaxNorm(x.ICF || 0, pool.map((y) => y.ICF || 0), 10);
      const h10 = minMaxNorm(x.HDCF || 0, pool.map((y) => y.HDCF || 0), 10);
      const pN = minMaxNorm(pressureScore(x, pool), pool.map((y) => pressureScore(y, pool)), 1);
      const bN = minMaxNorm(finalBossScoreV3(x, pool), pool.map((y) => finalBossScoreV3(y, pool)), 1);
      const ppI = 0.3 * bN + 0.25 * (i10 / 10) + 0.2 * (h10 / 10) + 0.25 * mN;
      const ps = 100 * (0.35 * mN + 0.2 * (i10 / 10) + 0.15 * (h10 / 10) + 0.15 * pN + 0.1 * ppI + 0.05 * bN);
      return ps * (1 + toiScore(x, pool) * 0.1);
    }),
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
    const { score: gGoal } = computeGGoal(p, players);
    const { slapScore, tier } = computeSlapScore(p, players);

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
