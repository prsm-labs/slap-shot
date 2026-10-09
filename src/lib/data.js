// Thin fetch wrappers for the real static data files under public/data/ (see
// slap-shot-build.md §4/§5/§13 — no live pipeline/API is wired up yet, this reads the
// real historical/aggregated JSON+CSV produced by the one-off scripts documented there).
import { useSyncExternalStore } from "react";
import { scorePlayerPool } from "../scoring.js";
import { computeGoalieGrades, gradeSlate } from "./grades.js";
import { applySlateScores } from "./slapScore.js";
import { estimatedToi, ppToiPerGame } from "./toi.js";
import { fetchLineups } from "./lineups.js";
import { applyLineups, STARTED } from "./slateOverlay.js";

// ── Live slate pool ──────────────────────────────────────────────────────────
// todays_pool.json is written by the pipeline (9 AM / 12 PM / 5:30 PM ET) with each skater's
// opposing goalie as known at that moment. Lineup news keeps coming after that, so the pool is
// re-applied in the browser whenever /api/lineups changes (checked every 3 minutes), and the
// file itself is re-checked every 10 minutes (a newer pipeline run replaces it):
//   - every skater faces the best-known opposing starter (lib/lineups.js startingGoalie: the
//     goalie actually in net once the game starts, then confirmed reports, then expected), with
//     that goalie's own stats swapped into the matchup inputs;
//   - skaters ruled out (RotoWire injury list, other than day-to-day) or missing from their
//     team's official dressed lineup once it's posted are taken out of the slate;
//   - the remaining slate is re-scored and re-graded, so the population-relative scores and the
//     slate-percentile grades reflect who is actually playing.
// Every skater also carries its game's state (gameState / gameStarted).
const POOL_CHECK_MS = 10 * 60_000;
const LINEUP_CHECK_MS = 3 * 60_000;

let raw = null;
let lineups = null;
let lineupsAt = null;
let current = null;
let currentSig = null;
let firstBuild = null;
let polling = false;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

function build() {
  if (!raw) return;
  const { meta, players: active, live } = applyLineups(raw, lineups, lineupsAt);
  // Re-score only when something that changes the numbers or labels changed.
  const sig = JSON.stringify([
    raw._meta.generated, live.removed.map((r) => r.playerId), live.swaps,
    meta.slate.map((g) => [g.state, g.awayGoalieId, g.awayGoalieStatus, g.homeGoalieId, g.homeGoalieStatus]),
    active.map((p) => p.lineupStatus),
  ]);
  if (sig === currentSig) {
    current = { ...current, live: { ...current.live, lineupsAt } };
    notify();
    return;
  }

  const scored = scorePlayerPool(active);
  const goalieGrades = computeGoalieGrades(raw.goalies);
  const grades = gradeSlate(scored);
  const graded = scored.map((p) => {
    const goalieGrade = p.opponentGoalieId != null ? goalieGrades[p.opponentGoalieId] : null;
    // One grade per skater (lib/grades.js gradeSlate); baseGrade kept as an alias for older views.
    const grade = grades.get(p.playerId);
    return {
      ...p, goalieGrade, effectiveGrade: grade, baseGrade: grade, gradeScore: grade?.score ?? null,
      modelProbs: grade?.probs ?? null, estToi: estimatedToi(p), ppToi: ppToiPerGame(p),
      // shots on goal per game and per 60 minutes of ice time (icetime = total seconds), last season + this season
      sogPg: p.ShotsOnGoalPerGame ?? null,
      sog60: p.icetime > 0 && p.ShotsOnGoalPerGame != null ? Math.round(((p.ShotsOnGoalPerGame * p.games_played * 3600) / p.icetime) * 100) / 100 : null,
    };
  });
  // Slap Score / tiers / goal % / point % from the grade model (lib/slapScore.js).
  const players = applySlateScores(graded);
  const goalies = raw.goalies.map((g) => ({ ...g, grade: goalieGrades[g.playerId] || null }));

  currentSig = sig;
  current = { meta, players, goalies, live };
  notify();
}

async function checkPool() {
  const res = await fetch("/data/todays_pool.json", { cache: "no-cache" });
  const data = await res.json();
  if (raw && data._meta.generated === raw._meta.generated) return;
  const newSlate = !raw || data._meta.slateDate !== raw._meta.slateDate;
  raw = data;
  if (newSlate) {
    lineups = null;
    lineupsAt = null;
  }
  build();
  if (newSlate && polling) checkLineups();
}

async function checkLineups() {
  if (!raw) return;
  const date = raw._meta.slateDate;
  try {
    const lu = await fetchLineups(date);
    if (raw._meta.slateDate !== date) return;
    lineups = lu;
    lineupsAt = new Date().toISOString();
    build();
  } catch {
    // keep the last good lineup data
  }
}

function startPolling() {
  if (polling) return;
  polling = true;
  setInterval(() => checkPool().catch(() => {}), POOL_CHECK_MS);
  setInterval(() => {
    // Nothing left to update once every game is final.
    if (lineups && current?.live.games && current.live.final === current.live.games) return;
    checkLineups();
  }, LINEUP_CHECK_MS);
  checkLineups();
}

// Re-check the pool file and lineup news now (the Top 3 page's refresh button). /api/lineups is
// cached for 3 minutes at the edge, so this never adds load on the sources behind it.
export async function refreshPool() {
  await checkPool().catch(() => {});
  await checkLineups();
}

// Latest scored pool. Resolves once the pool file is loaded; lineups are applied as they arrive.
export async function fetchScoredPool() {
  if (!firstBuild) firstBuild = checkPool().then(startPolling);
  await firstBuild;
  return current;
}

function subscribe(fn) {
  listeners.add(fn);
  fetchScoredPool().catch(() => {});
  return () => listeners.delete(fn);
}

// "Upcoming games only" (app-wide, on by default): pre-game projections for games already under
// way are hidden — unless every game has started, then everything stays visible, marked LIVE/FINAL.
let upcomingOnly = true;
const upcomingViews = new WeakMap();
export function setUpcomingOnly(v) {
  upcomingOnly = v;
  notify();
}
export function upcomingFilterActive(pool) {
  return Boolean(upcomingOnly && pool && pool.live.started > 0 && pool.live.started < pool.live.games);
}

// The pool with started games taken out — one cached copy per pool, so components get a stable object.
function upcomingView(pool) {
  if (!upcomingViews.has(pool)) {
    upcomingViews.set(pool, {
      ...pool,
      players: pool.players.filter((p) => !p.gameStarted),
      meta: { ...pool.meta, slate: pool.meta.slate.filter((g) => !STARTED.has(g.state)) },
    });
  }
  return upcomingViews.get(pool);
}

function snapshot(includeStarted) {
  if (!current || includeStarted || !upcomingFilterActive(current)) return current;
  return upcomingView(current);
}

// The live pool for React components; re-renders when lineups or the pool file change.
// { includeStarted: true } skips the "upcoming games only" filter.
export function useScoredPool({ includeStarted = false } = {}) {
  return useSyncExternalStore(subscribe, () => snapshot(includeStarted));
}

export function useUpcomingOnly() {
  return useSyncExternalStore(subscribe, () => upcomingOnly);
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
