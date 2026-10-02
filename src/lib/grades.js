// Letter-grade helpers — NOT a DAX port (unlike scoring.js), an original formula built this
// session in response to direct user feedback ("treat goalies like pitchers... provide true
// breakdowns, grades and scores per matchup, not per season"). Mirrors the SHAPE of Going Yard's
// real pattern (mlb_project/going-yard/src/App.jsx:5716-5733 computeEffectiveGrade(batterGrade,
// pitcherLabel)) — a standalone skill grade combined with opponent context into one effective
// badge — without pretending to be a verified port of specific Going Yard math, since MLB
// batter-grade inputs don't map 1:1 onto hockey stats.
import gradeModel from "./gradeModel.json" with { type: "json" };

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

// ── Skater grade (since 2026-10-02) ───────────────────────────────────────────────────────────
// Replaces computeBaseGrade/computeEffectiveGrade above (kept for reference, no longer used).
// Four logistic models trained on 2025-26 (nhl_project/build_grade_model.py → gradeModel.json)
// estimate tonight's chance of a goal, an assist, a point and 3+ shots on goal from per-game
// rates: goals, points, assists, shots, attempts, ice time and power-play ice time (each shrunk
// toward the league average with a 10-game prior), last-5-game shots and points, and forward vs
// defense. The grade is the skater's average percentile across those four within tonight's slate:
// A+ top 5%, A next 10%, B next 20%, C next 30%, D next 20%, F bottom 15%. Out-of-sample on
// Feb-Apr 2026: goal rate A+ 35% / A 30% / B 22% / C 14% / D 8% / F 5%. The opponent goalie isn't
// in it — it showed no signal; tonight's goalie status is shown next to it instead.

const GRADE_BANDS = [[0.95, "A+"], [0.85, "A"], [0.65, "B"], [0.35, "C"], [0.15, "D"], [0, "F"]];

function modelFeatures(p) {
  const { league } = gradeModel;
  const P = gradeModel._meta.priorGames;
  const gp = p.games_played || 0;
  const shrink = (total, key) => ((total || 0) + P * league[key]) / (gp + P);
  const recent = (p.last7 || []).slice(-5);
  const n5 = Math.min(gp, 5);
  return {
    g_pg: shrink(p.TotalGoals, "g"),
    p_pg: shrink(p.I_F_points, "p"),
    a_pg: shrink((p.I_F_primaryAssists || 0) + (p.I_F_secondaryAssists || 0), "a"),
    sog_pg: shrink((p.ShotsOnGoalPerGame || 0) * gp, "sog"),
    att_pg: shrink(p.ICF, "att"),
    toi_pg: shrink(p.icetime, "toi"),
    ppt_pg: shrink(p.ppIcetime, "ppt"),
    fwd: p.position === "D" ? 0 : 1,
    sog_l5: recent.length ? recent.reduce((s, g) => s + (g.sog || 0), 0) / recent.length : null,
    p_l5: n5 ? (p.Points_Last5 || 0) / n5 : null,
  };
}

// Model chances for one skater: { goal, assist, point, sog3 } as 0-1 probabilities.
export function skaterModelProbs(p) {
  const x = modelFeatures(p);
  const out = {};
  for (const [name, m] of Object.entries(gradeModel.models)) {
    let z = m.intercept;
    for (const f of gradeModel.features) {
      const v = x[f] ?? gradeModel.fill[f];
      z += m.coef[f] * ((v - gradeModel.mean[f]) / gradeModel.sd[f]);
    }
    out[name] = 1 / (1 + Math.exp(-z));
  }
  return out;
}

// Grade every skater in a slate. Returns Map playerId -> { letter, score (0-100 slate
// percentile), probs, tooltip }.
export function gradeSlate(players) {
  const rows = players.map((p) => ({ id: p.playerId, probs: skaterModelProbs(p) }));
  const n = rows.length;
  const pctRank = (key) => {
    const sorted = [...rows].sort((a, b) => a.probs[key] - b.probs[key]);
    const rank = new Map();
    sorted.forEach((r, i) => rank.set(r.id, n > 1 ? i / (n - 1) : 0.5));
    return rank;
  };
  const ranks = Object.keys(gradeModel.models).map(pctRank);
  const scored = rows.map((r) => ({ ...r, score: ranks.reduce((s, m) => s + m.get(r.id), 0) / ranks.length }));
  const order = [...scored].sort((a, b) => a.score - b.score);
  const out = new Map();
  order.forEach((r, i) => {
    const pct = n > 1 ? i / (n - 1) : 0.5;
    const letter = GRADE_BANDS.find(([cut]) => pct >= cut)[1];
    const pr = (k) => `${Math.round(r.probs[k] * 100)}%`;
    out.set(r.id, {
      letter,
      score: Math.round(pct * 100),
      probs: r.probs,
      tooltip: `Grade ${letter} — top ${Math.max(1, 100 - Math.round(pct * 100))}% of tonight's slate. Model chances: goal ${pr("goal")}, assist ${pr("assist")}, point ${pr("point")}, 3+ SOG ${pr("sog3")}`,
    });
  });
  return out;
}
