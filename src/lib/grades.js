// Letter-grade helpers — NOT a DAX port (unlike scoring.js), an original formula built this
// session in response to direct user feedback ("treat goalies like pitchers... provide true
// breakdowns, grades and scores per matchup, not per season"). Mirrors the SHAPE of Going Yard's
// real pattern (mlb_project/going-yard/src/App.jsx:5716-5733 computeEffectiveGrade(batterGrade,
// pitcherLabel)) — a standalone skill grade combined with opponent context into one effective
// badge — without pretending to be a verified port of specific Going Yard math, since MLB
// batter-grade inputs don't map 1:1 onto hockey stats.
const LEVELS = ["F", "D", "C", "B", "A", "A+"];

function levelFromScore(score) {
  if (score >= 80) return 5; // A+
  if (score >= 65) return 4; // A
  if (score >= 50) return 3; // B
  if (score >= 35) return 2; // C
  if (score >= 20) return 1; // D
  return 0; // F
}

export function letterFromScore(score) {
  return LEVELS[levelFromScore(score)];
}

export const GRADE_COLOR = {
  "A+": "#4a9fd4", A: "#4a9fd4", B: "#2f7dae", C: "#5a7080", D: "#5a7080", F: "#3a4d5c",
};

// Skater's own form/skill grade — Ice Sig (usage/recent form) + Snipe Score (shot quality),
// deliberately NOT including Breakaway Score, which is already opponent-adjusted. This is the
// "batter grade" side of the equation: how good is this player on a neutral matchup.
export function computeBaseGrade(p) {
  const score = (p.iceSig ?? 0) * 0.5 + (p.snipeScore ?? 0) * 0.5;
  return { score: Math.round(score), letter: letterFromScore(score) };
}

// Goalie quality grade — population-relative across the real goalie pool (min-max normalized,
// same convention scoring.js uses throughout), NOT a fixed cutoff on raw save%. Higher = tougher
// goalie = worse matchup for the shooter looking at them.
export function computeGoalieGrades(goalies) {
  const withStats = goalies.filter((g) => g.savePct != null && g.GA60_proxy != null && g.xGA60_proxy != null);
  const saves = withStats.map((g) => g.savePct);
  const gas = withStats.map((g) => g.GA60_proxy);
  const xgas = withStats.map((g) => g.xGA60_proxy);
  const norm = (v, all) => {
    const min = Math.min(...all), max = Math.max(...all);
    return max === min ? 0.5 : (v - min) / (max - min);
  };

  const grades = {};
  for (const g of withStats) {
    const saveN = norm(g.savePct, saves);
    const gaInvN = 1 - norm(g.GA60_proxy, gas);
    const xgaInvN = 1 - norm(g.xGA60_proxy, xgas);
    const score = Math.round((saveN * 0.5 + gaInvN * 0.3 + xgaInvN * 0.2) * 100);
    grades[g.playerId] = { score, letter: letterFromScore(score), name: g.name, team: g.team };
  }
  return grades;
}

// "Effective Grade" — the skater's own base grade adjusted by how tough their opponent goalie
// is. Facing an elite (A+/A) goalie pulls the effective grade down; facing a weak (D/F) goalie
// pulls it up. Own formula (see file header), not a literal DAX or Going Yard port.
export function computeEffectiveGrade(baseGrade, goalieGrade) {
  if (!goalieGrade) return baseGrade;
  const baseLevel = levelFromScore(baseGrade.score);
  const goalieLevel = levelFromScore(goalieGrade.score);
  const shift = (2.5 - goalieLevel) * 0.6; // tougher goalie (higher level) => negative shift
  const effLevel = Math.max(0, Math.min(5, Math.round(baseLevel + shift)));
  return {
    score: baseGrade.score,
    letter: LEVELS[effLevel],
    tooltip: `Effective Grade: ${LEVELS[effLevel]} (own form: ${baseGrade.letter} vs goalie: ${goalieGrade.letter})`,
  };
}
