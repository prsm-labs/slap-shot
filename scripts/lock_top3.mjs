// Freezes tonight's Top 3 (src/lib/top3.js) into public/data/top3/<slateDate>.json — the one record
// the Top 3 page and the Track Record read for that date once it exists. Runs in the pipeline after
// snapshot_projections.mjs; only locks at/after 5 PM ET (the 5:30 PM run), and never touches a date
// that's already locked. Before the lock the page computes the same picks live.
//
//   node scripts/lock_top3.mjs            # public/data/todays_pool.json
//   node scripts/lock_top3.mjs --force    # lock now / re-lock (manual use only)
//
// Uses the same lineup rules as the browser (lib/slateOverlay.js): live starters, scratches and
// ruled-out skaters removed, games already started excluded.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scorePlayerPool } from "../src/scoring.js";
import { computeGoalieGrades, gradeSlate } from "../src/lib/grades.js";
import { applyLineups } from "../src/lib/slateOverlay.js";
import { eligibleForTop3, pickRecord, selectTop3 } from "../src/lib/top3.js";
import { buildLineups } from "../api/lineups.js";

const LOCK_HOUR_ET = 17;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const force = process.argv.includes("--force");
const pool = JSON.parse(fs.readFileSync(path.join(root, "public/data/todays_pool.json"), "utf8"));
const date = pool._meta.slateDate;
const outDir = path.join(root, "public/data/top3");
const outPath = path.join(outDir, `${date}.json`);

if (fs.existsSync(outPath) && !force) {
  console.log(`Top 3 for ${date} is already locked — left unchanged.`);
  process.exit(0);
}
const etNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
const etToday = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
if (!force && (date !== etToday || etNow.getHours() < LOCK_HOUR_ET)) {
  console.log(`Top 3 for ${date} stays live until the ${LOCK_HOUR_ET}:00 ET run (ET now ${etToday} ${etNow.toTimeString().slice(0, 5)}).`);
  process.exit(0);
}

const lineups = await buildLineups(date).catch((e) => {
  console.log(`Lineups unavailable (${e.message}) — locking on the pool's own starters.`);
  return null;
});
const { meta, players: active } = applyLineups(pool, lineups, new Date().toISOString());
const goalieGrades = computeGoalieGrades(pool.goalies);
const scored = scorePlayerPool(active);
const grades = gradeSlate(scored);
const graded = scored.map((p) => {
  const g = grades.get(p.playerId);
  return { ...p, effectiveGrade: g, modelProbs: g?.probs ?? null, goalieGrade: p.opponentGoalieId != null ? goalieGrades[p.opponentGoalieId] : null };
});
const eligible = eligibleForTop3(graded, meta.slate);
const { picks } = selectTop3(eligible);

const record = {
  _meta: {
    slateDate: date,
    lockedAt: new Date().toISOString(),
    poolGenerated: pool._meta.generated,
    eligible: eligible.length,
    confirmed: eligible.filter((p) => p.lineupStatus === "dressed").length,
    lineupsLoaded: Boolean(lineups),
    note: "Locked Top 3 (src/lib/top3.js). Never recomputed after this file is written.",
  },
  picks: picks.map(pickRecord),
};
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(record, null, 1));
console.log(`Locked Top 3 for ${date} (${eligible.length} eligible):`);
for (const p of record.picks) console.log(`  ${p.tier}: ${p.name ? `${p.name} (${p.team} vs ${p.opp}) ${p.adjGoalPct}%${p.fallback ? " [fallback]" : ""}` : "none"}`);
