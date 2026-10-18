// Freezes tonight's 🤝 Pairs (src/lib/pairs.js, every mode, no profit boost) into public/data/pairs/<slateDate>.json,
// the record the Pairs page shows once locked and that Track Record > Pairs grades. Never rewrites a locked date
// (--force for manual use only).
//
// When: once a night, just before the FIRST puck drop of the slate, after lineup news:
//   - from 45 min before the first game, as soon as both of that game's teams have an official dressed lineup;
//   - otherwise at 20 min before it.
// Run every 10-15 min in the evening by run_pairs_lock.bat (Task Scheduler) and also by the pipeline (a no-op outside
// the window). If the first game has already started, it locks what's left (games not started) and marks the file late.
//
//   node scripts/lock_pairs.mjs [pool.json] [--force]   (a pool path is for testing / backfill only)
//   node scripts/lock_pairs.mjs <pool from git> --backfill   past night: that evening's 5:30 PM pool, no lineup news
//     (official lineups for a past date would be hindsight), marked _meta.backfilled — today's Pairs logic, not what
//     the page showed then (Pairs didn't exist before 2026-10-14).
// Uses the same lineup rules as the browser (lib/slateOverlay.js) and the same scoring chain as lib/data.js.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scorePlayerPool } from "../src/scoring.js";
import { computeGoalieGrades, gradeSlate } from "../src/lib/grades.js";
import { applySlateScores } from "../src/lib/slapScore.js";
import { applyLineups, STARTED } from "../src/lib/slateOverlay.js";
import { buildPairs, MODE_KEYS, pairRecord } from "../src/lib/pairs.js";
import { buildLineups } from "../api/lineups.js";
import { h2hGrades } from "../src/lib/h2h.js";

const EARLY_MIN = 45; // may lock this early if the first game's lineups are official
const LATE_MIN = 20; // locks at this point regardless
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backfill = process.argv.includes("--backfill"); // past night from that evening's pool: no lineup overlay
const force = process.argv.includes("--force") || backfill;
const poolPath = process.argv.slice(2).find((a) => !a.startsWith("--")) || path.join(root, "public/data/todays_pool.json");
const pool = JSON.parse(fs.readFileSync(poolPath, "utf8"));
const date = pool._meta.slateDate;
const outDir = path.join(root, "public/data/pairs");
const outPath = path.join(outDir, `${date}.json`);
const hhmm = (d) => d.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });

if (fs.existsSync(outPath) && !force) {
  console.log(`Pairs for ${date} already locked — left unchanged.`);
  process.exit(0);
}
const slate = pool._meta.slate || [];
if (!slate.length) {
  console.log(`No games on ${date}.`);
  process.exit(0);
}
const now = new Date();
const first = slate.reduce((a, g) => (new Date(g.startTimeUTC) < new Date(a.startTimeUTC) ? g : a));
const firstAt = new Date(first.startTimeUTC);
const minsToFirst = (firstAt - now) / 60_000;
if (!force && minsToFirst > EARLY_MIN) {
  console.log(`Pairs for ${date} stay live — first puck ${hhmm(firstAt)} ET is ${Math.round(minsToFirst)} min away (locks from ${EARLY_MIN} min before).`);
  process.exit(0);
}

const lineups = backfill ? null : await buildLineups(date).catch((e) => {
  console.log(`Lineups unavailable (${e.message}).`);
  return null;
});
const { meta, players: active } = applyLineups(pool, lineups, now.toISOString());
const firstGame = meta.slate.find((g) => g.gameId === first.gameId) || first;
const official = (team) => active.some((p) => p.team === team && p.lineupStatus === "dressed");
const firstOfficial = official(first.away) && official(first.home);
if (!force && minsToFirst > LATE_MIN && !firstOfficial) {
  console.log(`Pairs for ${date}: waiting for ${first.away}@${first.home} official lineups (or ${LATE_MIN} min before ${hhmm(firstAt)} ET).`);
  process.exit(0);
}
const upcoming = meta.slate.filter((g) => !STARTED.has(g.state));
if (!upcoming.length) {
  console.log(`Pairs for ${date}: every game has started — nothing to lock (missed the window).`);
  process.exit(0);
}

// Same chain as lib/data.js build(): score -> grade -> slate scores -> sportsbook prices.
const oddsPath = path.join(root, "public/data/odds", `${date}.json`);
const book = fs.existsSync(oddsPath) ? JSON.parse(fs.readFileSync(oddsPath, "utf8")).players || {} : {};
const goalieGrades = computeGoalieGrades(pool.goalies);
const scored = scorePlayerPool(active);
const grades = gradeSlate(scored);
const players = applySlateScores(scored.map((p) => {
  const g = grades.get(p.playerId);
  return { ...p, effectiveGrade: g, modelProbs: g?.probs ?? null, goalieGrade: p.opponentGoalieId != null ? goalieGrades[p.opponentGoalieId] : null };
})).map((p) => {
  const o = book[p.playerId];
  if (!o) return p;
  return { ...p, book: o, edge: p.anytimeGoalPct != null ? Math.round((p.anytimeGoalPct - o.bestImplied) * 10) / 10 : null };
});

// H2H grade per skater (same lib/h2h.js grading as the tables, vs tonight's live starters), stored on each leg so Track
// Record can follow soft D + H2H A/A+. Context only — not used to build the pairs. Needs that night's h2h_today.json.
const h2hPath = path.join(root, "public/data/h2h_today.json");
const h2hFile = fs.existsSync(h2hPath) ? JSON.parse(fs.readFileSync(h2hPath, "utf8").replace(/^﻿/, "")) : null;
if (h2hFile?._meta?.slateDate === date) {
  const hg = h2hGrades(h2hFile, players, pool.goalies, new Set(meta.slate.map((g) => g.home))).skaters;
  for (const p of players) p.h2hGrade = hg.get(p.playerId)?.letter ?? null;
}

const modes = {};
for (const m of MODE_KEYS) modes[m] = buildPairs(players, { mode: m, boost: 0 }).map(pairRecord);
// Balanced with one prop type (the page's 🚨 / 🍎 / 🏒 filters) — locked too so Track Record can grade each.
for (const prop of ["goal", "point", "sog3"]) modes[`balanced:${prop}`] = buildPairs(players, { mode: "balanced", boost: 0, prop }).map(pairRecord);

const teamsOfficial = [...new Set(active.filter((p) => p.lineupStatus === "dressed").map((p) => p.team))];
const record = {
  _meta: {
    slateDate: date,
    lockedAt: backfill ? null : now.toISOString(),
    firstPuck: first.startTimeUTC,
    firstGame: `${first.away}@${first.home}`,
    firstGameOfficial: firstOfficial,
    late: !backfill && (STARTED.has(firstGame.state) || minsToFirst < 0),
    backfilled: backfill,
    gamesLocked: upcoming.map((g) => `${g.away}@${g.home}`),
    teamsOfficial,
    lineupsLoaded: Boolean(lineups),
    poolGenerated: pool._meta.generated,
    oddsLoaded: Object.keys(book).length > 0,
    note: "Locked Pairs (src/lib/pairs.js, every mode, no boost). Never recomputed after this file is written.",
  },
  modes,
};
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(record, null, 1));
console.log(`LOCKED ${outPath}`);
console.log(`  ${hhmm(now)} ET, first puck ${hhmm(firstAt)} ET; official lineups: ${teamsOfficial.length} teams; ${upcoming.length} games`);
for (const [m, list] of Object.entries(modes)) console.log(`  ${m}: ${list.length} pairs — ${list.slice(0, 3).map((r) => r.legs.map((l) => `${l.name} ${l.prop}`).join(" + ")).join(" | ")}`);
