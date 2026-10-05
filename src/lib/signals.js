// "Signal" flags — real 3-way-AND pattern ported from Going Yard's real Barrel Lab / On Base
// (mlb_project/going-yard/src/App.jsx: isBarrelSignal / isTBSignal), confirmed via direct read
// this session: score >= threshold && matchup >= threshold && sim% >= threshold, NOT just a raw
// score cutoff. Threshold VALUES are our own (not a verified port — Going Yard's ≥75/≥60/≥12%
// are calibrated against their own real distributions, which we don't have season-long history
// for yet), chosen to land in a similarly-selective range against this session's real sim output.
// breakawayScore is NOT on a 0-100 scale like the other components despite scoring.js clamping
// it to [0,100] -- its formula (0.45*goalieN[0-10] + 0.45*teamDefN[0-10] + 0.1*oppDefN[0-1]) *
// homeIceAdjustment tops out around 9-11 in practice. Confirmed against the real 220-player pool:
// min 3, p25 4, median 5, p75 6, p90 8, max 9. Thresholds below are calibrated against that real
// distribution (checked via node against todays_pool.json), not assumed to be 0-100 like slapScore.
// The 30%-anytimeGoalPct leg was ALSO miscalibrated on first pass: checked the real joint
// intersection of slapScore>=70 & breakawayScore>=7 against the real 220-player pool -- only 6
// players clear both, and their real simulated goal% clusters 25.2%-28.7% (breakawayScore is
// itself one of the sim's own inputs, so tougher matchups that raise breakawayScore's population
// rank also suppress the simulated goal probability -- the three legs pull against each other).
// 30% left the signal permanently empty; 25% actually fires against real sim output.
// v2 (2026-10-05): the signals now run on Slap Score v2 (lib/slapScore.js — the grade model's
// matchup-adjusted odds). Breakaway is out (its scale was misread and it showed no predictive value);
// the comments above describe the retired v1 thresholds.
//   Goal Signal  = Slap Score >= 85 (top 15% tonight) AND opponent in the softer half by xGA allowed.
//                  2025-26 backtest of that pool: 32% scored (base ~15%); 10/2-10/4: top 15% scored 27%.
//   Point Signal = point % in tonight's top 15% AND simulated 3+ SOG >= 40%. 10/2-10/4: 66% got a point
//                  (59 of 89; base 35%).
export function isGoalSignal(p) {
  return (p.slapScore ?? 0) >= 85 && (p.oppSoftPct ?? 0) >= 0.5;
}

export function isPointSignal(p) {
  return (p.pointPct ?? 0) >= 0.85 && (p.plus3SogPct ?? 0) >= 40;
}
