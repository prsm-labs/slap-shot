// Saves the day's pre-game projections — the grades, scores and sim odds the app shows for that
// slate — to public/data/projections/<slateDate>.json, so the Track Record can grade them against
// what actually happened. Runs in the pipeline right after build_player_pool.py.
//
//   node scripts/snapshot_projections.mjs                       # public/data/todays_pool.json
//   node scripts/snapshot_projections.mjs path/to/pool.json     # a backfilled pool
//   ... --force                                                  # overwrite after puck drop
//
// A snapshot is locked once the slate's first game has started: later runs leave it alone, so
// the record always reflects what was shown before the games, never a re-run after the fact.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scorePlayerPool } from "../src/scoring.js";
import { computeBaseGrade, computeGoalieGrades, computeEffectiveGrade } from "../src/lib/grades.js";
import { isGoalSignal, isPointSignal } from "../src/lib/signals.js";
import { simOdds, firstGoalProbs } from "../src/lib/projections.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const force = args.includes("--force");
const poolPath = args.find((a) => !a.startsWith("--")) || path.join(root, "public/data/todays_pool.json");
const outDir = path.join(root, "public/data/projections");

const pool = JSON.parse(fs.readFileSync(poolPath, "utf8"));
const meta = pool._meta;
const outPath = path.join(outDir, `${meta.slateDate}.json`);

const firstPuck = Math.min(...meta.slate.map((g) => Date.parse(g.startTimeUTC)));
if (fs.existsSync(outPath) && Date.now() >= firstPuck && !force) {
  console.log(`Locked: ${meta.slateDate} snapshot already exists and the first game has started — left unchanged.`);
  process.exit(0);
}

const gameOf = new Map();
for (const g of meta.slate) {
  gameOf.set(g.away, { ...g, key: `${g.away}@${g.home}` });
  gameOf.set(g.home, { ...g, key: `${g.away}@${g.home}` });
}

const goalieGrades = computeGoalieGrades(pool.goalies);
const scored = scorePlayerPool(pool.players).map((p) => {
  const baseGrade = computeBaseGrade(p);
  const goalieGrade = p.opponentGoalieId != null ? goalieGrades[p.opponentGoalieId] : null;
  return { ...p, ...simOdds(p), baseGrade, goalieGrade, effectiveGrade: computeEffectiveGrade(baseGrade, goalieGrade) };
});
const firstGoal = firstGoalProbs(scored, (p) => gameOf.get(p.team)?.key);
const bySlap = [...scored].sort((a, b) => b.slapScore - a.slapScore);
const slapRank = new Map(bySlap.map((p, i) => [p.playerId, i + 1]));

const players = scored.map((p) => {
  const g = gameOf.get(p.team);
  return {
    playerId: p.playerId,
    name: p.name,
    team: p.team,
    opp: p.opponentTeam,
    position: p.position,
    isHome: p.isHome,
    gameId: g?.gameId ?? null,
    matchup: g?.key ?? null,
    opponentGoalie: p.opponentGoalie,
    opponentGoalieId: p.opponentGoalieId,
    goalieGrade: p.goalieGrade?.letter ?? null,
    baseGrade: p.baseGrade.letter,
    effectiveGrade: p.effectiveGrade.letter,
    slapScore: p.slapScore,
    slapRank: slapRank.get(p.playerId),
    gGoal: p.gGoal,
    tier: p.tier,
    iceSig: p.iceSig,
    snipeScore: p.snipeScore,
    breakawayScore: p.breakawayScore,
    anytimeGoalPct: p.anytimeGoalPct,
    plus3SogPct: p.plus3SogPct,
    firstGoalPct: Math.round((firstGoal.get(p.playerId) || 0) * 1000) / 10,
    goalSignal: isGoalSignal(p),
    pointSignal: isPointSignal(p),
  };
});

const snapshot = {
  _meta: {
    slateDate: meta.slateDate,
    snapshotAt: new Date().toISOString(),
    poolGenerated: meta.generated,
    games: meta.slate.map((g) => ({
      gameId: g.gameId, away: g.away, home: g.home, startTimeUTC: g.startTimeUTC,
      awayGoalie: g.awayGoalie, awayGoalieStatus: g.awayGoalieStatus,
      homeGoalie: g.homeGoalie, homeGoalieStatus: g.homeGoalieStatus,
    })),
    note: "Pre-game projections as shown in the app. Sim % are the exact odds the Lamp/Apple Lab Monte Carlo estimates.",
  },
  players,
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 1));

// Index of available snapshot dates, for the Track Record page.
const dates = fs.readdirSync(outDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).sort();
fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify({ dates }, null, 1));

console.log(`Wrote ${outPath}: ${players.length} skaters, ${meta.slate.length} games (${dates.length} snapshot dates total)`);
