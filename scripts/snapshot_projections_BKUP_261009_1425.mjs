// Saves the day's pre-game projections — the grades, scores and sim odds the app shows for that
// slate — to public/data/projections/<slateDate>.json, so the Track Record can grade them against
// what actually happened. Runs in the pipeline right after build_player_pool.py.
//
//   node scripts/snapshot_projections.mjs                       # public/data/todays_pool.json
//   node scripts/snapshot_projections.mjs path/to/pool.json     # a backfilled pool
//   ... --force                                                  # overwrite after puck drop
//   ... --goalies-only   # add/replace only the Crease Lab goalie section of an existing snapshot
//                          (used to backfill days snapshotted before goalies were tracked)
//
// A snapshot is locked once the slate's first game has started: later runs leave it alone, so
// the record always reflects what was shown before the games, never a re-run after the fact.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scorePlayerPool } from "../src/scoring.js";
import { computeGoalieGrades, gradeSlate } from "../src/lib/grades.js";
import { isGoalSignal, isPointSignal } from "../src/lib/signals.js";
import { simOdds, firstGoalProbs } from "../src/lib/projections.js";
import { applySlateScores } from "../src/lib/slapScore.js";
import { projectGoalie } from "../src/lib/crease.js";
import { lineupMaps, startingGoalie } from "../src/lib/lineups.js";
import { buildLineups } from "../api/lineups.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const force = args.includes("--force");
const goaliesOnly = args.includes("--goalies-only");
const poolPath = args.find((a) => !a.startsWith("--")) || path.join(root, "public/data/todays_pool.json");
const outDir = path.join(root, "public/data/projections");

const pool = JSON.parse(fs.readFileSync(poolPath, "utf8"));
const meta = pool._meta;
const outPath = path.join(outDir, `${meta.slateDate}.json`);

// Crease Lab projections for every team's starter, exactly as the Crease Lab tab computes them:
// starter = RotoWire / DailyFaceoff confirmed first, then expected (lib/lineups.js startingGoalie).
// RotoWire only covers the upcoming slate, so a backfilled past day uses the pool's own starter.
async function goalieSection() {
  const lineups = await buildLineups(meta.slateDate).catch(() => null);
  const maps = lineupMaps(lineups);
  const byId = new Map(pool.goalies.map((g) => [g.playerId, g]));
  return meta.slate.flatMap((game) => [game.away, game.home].map((team) => {
    const opp = team === game.away ? game.home : game.away;
    const s = startingGoalie(team, game, maps);
    const stats = s ? byId.get(s.playerId) : null;
    const proj = projectGoalie(stats, team, opp, meta);
    return {
      gameId: game.gameId, matchup: `${game.away}@${game.home}`, team, opp, isHome: team === game.home,
      goalieId: s?.playerId ?? null, goalie: stats?.name || s?.name || null,
      confirmed: Boolean(s?.confirmed), status: s?.status || null, source: s?.source || null,
      shots: proj.shots, saves: proj.saves, goalsAllowed: proj.goalsAllowed,
      savePct: Math.round(proj.savePct * 10000) / 10000, lines: proj.lines,
      teamsDataPresent: Boolean(meta.teams),
    };
  }));
}

const firstPuck = Math.min(...meta.slate.map((g) => Date.parse(g.startTimeUTC)));
if (goaliesOnly) {
  if (!fs.existsSync(outPath)) {
    console.log(`No ${meta.slateDate} snapshot to add goalies to.`);
    process.exit(1);
  }
  const existing = JSON.parse(fs.readFileSync(outPath, "utf8"));
  if (existing.goalies && Date.now() >= firstPuck && !force) {
    console.log(`Locked: ${meta.slateDate} already has goalie projections and the first game has started.`);
    process.exit(0);
  }
  existing.goalies = await goalieSection();
  existing._meta.goaliesAddedAt = new Date().toISOString();
  existing._meta.goaliesBackfilled = Date.now() >= firstPuck;
  fs.writeFileSync(outPath, JSON.stringify(existing, null, 1));
  console.log(`Added ${existing.goalies.length} goalie projections to ${outPath}${existing._meta.goaliesBackfilled ? " (backfilled after puck drop)" : ""}`);
  process.exit(0);
}
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
const scoredRaw = scorePlayerPool(pool.players);
const grades = gradeSlate(scoredRaw);
// Slap Score v2 (lib/slapScore.js): Slap Score, tier, gGOAL and goal / point % from the grade model,
// exactly as the app shows them. The 3+ SOG % still comes from the shot sim (lib/projections.js).
const scored = applySlateScores(scoredRaw.map((p) => {
  const grade = grades.get(p.playerId);
  const goalieGrade = p.opponentGoalieId != null ? goalieGrades[p.opponentGoalieId] : null;
  return { ...p, plus3SogPct: simOdds(p).plus3SogPct, grade, goalieGrade, modelProbs: grade?.probs ?? null };
}));
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
    baseGrade: p.grade.letter,
    effectiveGrade: p.grade.letter,
    gradeScore: p.grade.score,
    modelGoalPct: Math.round(p.grade.probs.goal * 1000) / 10,
    modelAssistPct: Math.round(p.grade.probs.assist * 1000) / 10,
    modelPointPct: Math.round(p.grade.probs.point * 1000) / 10,
    modelSog3Pct: Math.round(p.grade.probs.sog3 * 1000) / 10,
    slapScore: p.slapScore,
    slapRank: slapRank.get(p.playerId),
    gGoal: p.gGoal,
    tier: p.tier,
    iceSig: p.iceSig,
    snipeScore: p.snipeScore,
    breakawayScore: p.breakawayScore,
    anytimeGoalPct: p.anytimeGoalPct,
    anytimePointPct: p.anytimePointPct,
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
    scoreVersion: 2,
    note: "Pre-game projections as shown in the app. Slap Score v2: goal / point % from the grade model adjusted for the opponent (lib/slapScore.js); 3+ SOG % from the shot sim.",
  },
  players,
  goalies: await goalieSection(),
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 1));

// Index of available snapshot dates, for the Track Record page.
const dates = fs.readdirSync(outDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).sort();
fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify({ dates }, null, 1));

console.log(`Wrote ${outPath}: ${players.length} skaters, ${snapshot.goalies.length} goalies, ${meta.slate.length} games (${dates.length} snapshot dates total)`);
