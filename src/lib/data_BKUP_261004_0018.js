// Thin fetch wrappers for the real static data files under public/data/ (see
// slap-shot-build.md §4/§5/§13 — no live pipeline/API is wired up yet, this reads the
// real historical/aggregated JSON+CSV produced by the one-off scripts documented there).
import { scorePlayerPool } from "../scoring.js";
import { computeGoalieGrades, gradeSlate } from "./grades.js";
import { estimatedToi, ppToiPerGame } from "./toi.js";

let poolCache = null;
export async function fetchScoredPool() {
  if (poolCache) return poolCache;
  const res = await fetch("/data/todays_pool.json");
  const data = await res.json();
  const scored = scorePlayerPool(data.players);

  const goalieGrades = computeGoalieGrades(data.goalies);
  const grades = gradeSlate(scored);
  const players = scored.map((p) => {
    const goalieGrade = p.opponentGoalieId != null ? goalieGrades[p.opponentGoalieId] : null;
    // One grade per skater (lib/grades.js gradeSlate); baseGrade kept as an alias for older views.
    const grade = grades.get(p.playerId);
    return {
      ...p, goalieGrade, effectiveGrade: grade, baseGrade: grade, gradeScore: grade?.score ?? null,
      modelProbs: grade?.probs ?? null, estToi: estimatedToi(p), ppToi: ppToiPerGame(p),
    };
  });
  const goalies = data.goalies.map((g) => ({ ...g, grade: goalieGrades[g.playerId] || null }));

  poolCache = { meta: data._meta, players, goalies };
  return poolCache;
}

function parseCsv(text) {
  // Split on \r\n or \n and trim each cell — a bare split("\n") leaves a trailing "\r" on
  // the last column of every row when the file has Windows line endings, which silently broke
  // the "hit" column (always "1\r"/"0\r" !== "1", so every tier showed 0% — caught via a real
  // browser screenshot before shipping, see slap-shot-build.md task log).
  const lines = text.trim().split(/\r\n|\n/);
  const header = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim());
    const row = {};
    header.forEach((h, i) => { row[h] = cells[i]; });
    return row;
  });
}

let goalsLogCache = null;
export async function fetchGoalsLog() {
  if (goalsLogCache) return goalsLogCache;
  const res = await fetch("/data/goals_log.json");
  const data = await res.json();
  goalsLogCache = { meta: data._meta, goals: data.goals };
  return goalsLogCache;
}

let trackRecordCache = null;
export async function fetchTrackRecord() {
  if (trackRecordCache) return trackRecordCache;
  const res = await fetch("/data/track_record.csv");
  const text = await res.text();
  const rows = parseCsv(text).map((r) => ({
    date: r.date,
    player: r.player,
    team: r.team,
    label: r.label,
    primedScore: parseFloat(r.primed_score),
    scoreV3: parseFloat(r.score_v3),
    actualGoals: parseInt(r.actual_goals, 10),
    hit: r.hit === "1",
  }));
  trackRecordCache = rows;
  return rows;
}
