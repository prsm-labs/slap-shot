// Top 3 Tonight — one deterministic pick per tier (Chalk, Mid-Tier, Breakout), modeled on Going
// Yard's "Top 4 Tonight". Shared by the page (src/tabs/Top3Tab.jsx, live until the lock) and the
// pipeline (scripts/lock_top3.mjs, which freezes the picks at the 5:30 PM ET run).
//
// Everything here was backtested on 2025-26, point-in-time (scratch, 2026-10-04; profiles/fits on
// Nov-Jan, checked on Feb-Apr):
//   - Quality = the grade model's goal chance (lib/grades.js; blends last season with this one and
//     shrinks thin samples, so early-season counting stats don't drive it).
//   - Matchup = the opponent's expected goals allowed per game. It adds a little on top of the
//     model (goal AUC .702 -> .704; logloss better for goal/assist/point/3+SOG), fitted at +0.041 on
//     the log-odds per slate standard deviation — applied below as the matchup-adjusted chance.
//     The opposing goalie's save % / GSAx added nothing beyond that, so it isn't used.
//   - Goalie-specific "arsenal fit" (shot type / distance / rush-rebound weak spots) was tested and
//     is noise: split-half r ~ 0 once the league-wide xG bias is removed. Not used.
//   - Mid-Tier gate (soft matchup = opponent xGA in the slate's top third, AND shots on goal over
//     the last 5 games > 1.2x the season rate): scored 14% (Nov-Jan) / 24% (Feb-Apr) above the
//     model's expectation; ~9 qualifiers per slate, none on 3 of 143 days.
//   - Not used, because they didn't hold up: excluding skaters facing a top-10% save % goalie
//     (+7% / -9%), excluding skaters who scored last game (+3% / -4%).
// Within each tier the pick is the highest matchup-adjusted chance (not a 50/50 blend of two
// scores — matchup's real effect is far smaller than half).
//
// v2 (2026-10-06, user-approved): the Longshot card ("below the median + softest defenses") kept
// landing on low-minute depth players and its backtest pool only scored ~8% with no edge, so it's
// replaced by a Breakout pick — the best Breakout Watch skater (lib/breakout.js: rising expected
// goals into a soft defense, 1.20x / 1.29x the model last season) with at least 13 minutes of
// estimated ice time. Also: at most one pick per team (10/5 had two Ottawa skaters in one game).
// Locked nights before this keep their original Longshot cards (LEGACY_TIERS).
import { breakoutBoard } from "./breakout.js";
import { estimatedToi } from "./toi.js";

export const TIERS = [
  { key: "chalk", label: "Chalk", emoji: "🎯", color: "#8fd0f7", blurb: "Proven scorer, soft matchup" },
  { key: "mid", label: "Mid-Tier", emoji: "⚖️", color: "#4a9fd4", blurb: "Shots trending up into a soft matchup" },
  { key: "breakout", label: "Breakout", emoji: "🚀", color: "#2f6d96", blurb: "Rising shot quality into a soft defense" },
];
// Retired tiers that still appear on locked nights (Track Record / recent results).
export const LEGACY_TIERS = [
  { key: "longshot", label: "Longshot (retired)", emoji: "🎲", color: "#2f6d96", blurb: "Weaker form, softest matchups" },
];
export const TIER_INFO = Object.fromEntries([...TIERS, ...LEGACY_TIERS].map((t) => [t.key, t]));

const MATCHUP_COEF = 0.041;
const CHALK_QUALITY = 0.85;   // top 15% of tonight's eligible skaters by model goal chance
const MID_FLOOR = 0.5;        // Mid-Tier: 50th-85th percentile
const CHALK_MATCHUP = 0.5;    // opponent xGA allowed in the slate's top half
const MID_MATCHUP = 0.67;     // ... top third
const BREAKOUT_MIN_TOI = 13;  // minutes of estimated ice time for the Breakout pick
const SOG_TREND = 1.2;

const pct = (v) => Math.round(v * 1000) / 10;
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

function pctRank(rows, key) {
  const sorted = [...rows].sort((a, b) => a[key] - b[key]);
  const n = sorted.length;
  const out = new Map();
  sorted.forEach((r, i) => out.set(r.playerId, n > 1 ? i / (n - 1) : 0.5));
  return out;
}

// Tonight's eligible skaters: still in the slate after lineup news (lib/slateOverlay.js removes
// the ruled-out and scratched) and their game hasn't started.
export function eligibleForTop3(players, slate, now = Date.now()) {
  const start = new Map();
  for (const g of slate || []) {
    start.set(g.away, Date.parse(g.startTimeUTC));
    start.set(g.home, Date.parse(g.startTimeUTC));
  }
  return players.filter((p) => !p.gameStarted && (start.get(p.team) ?? Infinity) > now);
}

// players: scored + graded pool skaters (modelProbs from lib/grades.js), already filtered to
// tonight's eligible set (not ruled out, game not started).
export function selectTop3(players) {
  const rows = players
    .filter((p) => p.modelProbs?.goal != null && p.opponentTeamxGA60 != null)
    .map((p) => {
      const recent = (p.last7 || []).slice(-5);
      const sogL5 = recent.length ? recent.reduce((s, g) => s + (g.sog || 0), 0) / recent.length : null;
      return { ...p, pGoal: p.modelProbs.goal, oppXga: p.opponentTeamxGA60, sogL5, sogPg: p.ShotsOnGoalPerGame || 0 };
    });
  if (!rows.length) return { picks: TIERS.map((t) => ({ tier: t.key, player: null })), eligible: 0 };

  const xs = rows.map((r) => r.oppXga);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length) || 1;
  const q = pctRank(rows, "pGoal");
  const m = pctRank(rows, "oppXga");
  // Softest defense = rank 1.
  const teams = [...new Set(rows.map((r) => r.opponentTeam))];
  const teamXga = new Map(rows.map((r) => [r.opponentTeam, r.oppXga]));
  const softRank = new Map([...teams].sort((a, b) => teamXga.get(b) - teamXga.get(a)).map((t, i) => [t, i + 1]));

  for (const r of rows) {
    const z = (r.oppXga - mean) / sd;
    const logit = Math.log(r.pGoal / (1 - r.pGoal)) + MATCHUP_COEF * z;
    r.pAdj = 1 / (1 + Math.exp(-logit));
    r.qPct = q.get(r.playerId);
    r.mPct = m.get(r.playerId);
    r.softRank = softRank.get(r.opponentTeam);
    r.trending = r.sogL5 != null && r.sogL5 > SOG_TREND * r.sogPg;
  }
  const best = (list) => [...list].sort((a, b) => b.pAdj - a.pAdj)[0] || null;
  // No skater twice, and at most one pick per team.
  const used = new Set();
  const usedTeams = new Set();
  const take = (r) => { if (r) { used.add(r.playerId); usedTeams.add(r.team); } };
  const free = (list) => list.filter((r) => !used.has(r.playerId) && !usedTeams.has(r.team));

  const chalk = best(free(rows.filter((r) => r.qPct >= CHALK_QUALITY && r.mPct >= CHALK_MATCHUP)));
  take(chalk);

  const midPool = free(rows.filter((r) => r.qPct >= MID_FLOOR && r.qPct < CHALK_QUALITY));
  let mid = best(midPool.filter((r) => r.mPct >= MID_MATCHUP && r.trending));
  const midFallback = !mid;
  if (!mid) mid = best(midPool);
  take(mid);

  // Breakout: Breakout Watch qualifiers (same rules and slate as that page) with real minutes.
  const byId = new Map(rows.map((r) => [r.playerId, r]));
  const breakoutPool = breakoutBoard(players).list
    .filter((b) => byId.has(b.playerId) && (estimatedToi(b) ?? 0) >= BREAKOUT_MIN_TOI)
    .map((b) => Object.assign(byId.get(b.playerId), { xgL5: b.xgL5, xgSeason: b.xgSeason, xgTrend: b.xgTrend, estToi: estimatedToi(b) }));
  const breakout = best(free(breakoutPool));

  const nTeams = teams.length;
  const card = (tier, r, fallback = false) => (r ? { tier, fallback, player: r, why: whyLine(tier, r, nTeams, fallback) } : { tier, player: null });
  return {
    eligible: rows.length,
    picks: [card("chalk", chalk), card("mid", mid, midFallback), card("breakout", breakout)],
  };
}

// The plain-English "why this pick" line — a template, no AI.
function whyLine(tier, r, nTeams, fallback) {
  const top = Math.max(1, Math.round((1 - r.qPct) * 100));
  const opp = `${r.opponentTeam} (#${r.softRank} softest defense of ${nTeams} tonight, ${r1(r.oppXga)} expected goals allowed a game)`;
  if (tier === "chalk") {
    return `Top ${top}% of tonight's slate by the grade model (${pct(r.pGoal)}% to score), facing ${opp}. Matchup-adjusted chance ${pct(r.pAdj)}%.`;
  }
  if (tier === "mid") {
    if (fallback) {
      return `No mid-tier skater cleared tonight's bar (soft matchup + shots trending up), so this is the best remaining mid-tier chance: ${pct(r.pAdj)}% vs ${opp}.`;
    }
    return `${r1(r.sogL5)} shots a game over the last 5 games vs ${r1(r.sogPg)} on the season, into ${opp} — the combination that scored 14-24% above the model last season. ${pct(r.pAdj)}% to score.`;
  }
  return `${r.xgL5.toFixed(2)} expected goals a game over the last 5 vs ${r.xgSeason.toFixed(2)} usual (${r.xgTrend.toFixed(1)}x), outside the model's top 15%, into ${opp} — the combination that scored 20-29% above the model last season. About ${Math.round(r.estToi)} minutes a night. ${pct(r.pAdj)}% to score.`;
}

// Compact record of a pick, as stored by the daily lock (public/data/top3/<date>.json).
export function pickRecord(card) {
  const r = card.player;
  if (!r) return { tier: card.tier, player: null };
  return {
    tier: card.tier,
    fallback: Boolean(card.fallback),
    why: card.why,
    playerId: r.playerId, name: r.name, team: r.team, opp: r.opponentTeam, position: r.position, isHome: r.isHome,
    opponentGoalie: r.opponentGoalie || null, opponentGoalieId: r.opponentGoalieId ?? null,
    goalieGrade: r.goalieGrade?.letter || null, grade: r.effectiveGrade?.letter || null,
    lineupStatus: r.lineupStatus || null,
    modelGoalPct: pct(r.pGoal), adjGoalPct: pct(r.pAdj), oppXga: r1(r.oppXga), softRank: r.softRank,
    sogL5: r1(r.sogL5), sogPg: r1(r.sogPg),
    ...(card.tier === "breakout" ? { xgTrend: r1(r.xgTrend), estToi: r1(r.estToi) } : {}),
  };
}
