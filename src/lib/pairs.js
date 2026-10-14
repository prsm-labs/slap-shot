// 🤝 Pairs — auto-built 2-leg parlays from tonight's live slate (Scouting > Pairs).
// Legs: anytime goal (model goal % + sportsbook price), 1+ point (model point %), 3+ SOG (grade model).
// Pair chance = leg A x leg B x correlation for how the two legs relate. Correlations measured on 2022-23 ..
// 2025-26 (Feb-Apr, each night's top 60 by goal chance, scratch pair_corr.py), as actual P(both) / product of
// the app's calibrated chances, after removing each leg's own calibration:
//   different games        goal+goal 0.99   goal+point 1.00   point+point 1.00   -> independent (1.00)
//   same game, opponents   goal+goal 0.96   goal+point 0.98   point+point 0.97   (±0.02-0.04)
//   same game, teammates   goal+goal 0.99   goal+point 1.12   point+point 1.12   (one assists the other)
// 3+ SOG wasn't measured inside a game, so SOG pairs are different-games only.
// Pairs are ranked by the model's chance that both legs hit (grades, matchup and form are already in each leg's
// chance). Only the "Value vs book" mode (and 2 of Balanced's slots) rank by sportsbook price.
// Locked once a night (scripts/lock_pairs.mjs, about 20-45 min before the first puck drop, after the first
// game's official lineups) and graded in Track Record > Pairs.
// Book parlay price (goal legs only — the only prop we pull prices for): decimal A x decimal B at the same book,
// e.g. +380 / +200 -> 4.80 x 3.00 = 14.40 -> +1340. Books price same-game parlays with their own correlation
// haircut, so a same-game pair only gets our fair price.
export const PAIR_CORR = {
  diff: { gg: 1, gp: 1, pp: 1, ss: 1 },
  opp: { gg: 0.96, gp: 0.98, pp: 0.97 },
  team: { gg: 1.0, gp: 1.12, pp: 1.12 },
};
import { breakoutBoard } from "./breakout.js";

export const MAX_PAIRS = 10;
const LEGS_PER_PROP = 40; // candidates per prop (by chance); keeps the search small
// A player can appear in at most this many pairs. Balanced uses 1 so the board isn't the same few stars in
// every section (they crowded out e.g. Chychrun, an A grade vs a soft defense, on 10/14).
const MAX_PER_PLAYER = { balanced: 1, default: 2 };
export const SOFT_D = 0.67; // oppSoftPct cut, same as the "Soft defense tonight" filter and the ▲ marker

export const PROPS = {
  goal: { key: "goal", short: "G", label: "Anytime goal", emoji: "🚨" },
  point: { key: "point", short: "P", label: "1+ point", emoji: "🍎" },
  sog3: { key: "sog3", short: "S", label: "3+ shots on goal", emoji: "🏒" },
};

export const MODES = [
  { key: "balanced", label: "⚖️ Balanced", blurb: "Strongest goal pairs by the model, best value goal pairs, teammate stacks, point and SOG pairs" },
  { key: "value", label: "💰 Value vs book", blurb: "Goal + goal pairs, different games, ranked by expected return at the best book" },
  { key: "safest", label: "🛡️ Safest", blurb: "Highest chance both legs hit, any prop" },
  { key: "due", label: "🔥 Due & heating", blurb: "At least one leg is 🔥 Due + heating up, 🍎 Points due or on Breakout Watch" },
  { key: "soft", label: "▲ Soft matchups", blurb: "Both legs face one of tonight's softest defenses (top third by xGA allowed), any prop" },
  { key: "stacks", label: "🔗 Same game", blurb: "Both legs in one game — teammates (assist link) or opponents" },
];
export const MODE_KEYS = MODES.map((m) => m.key);

// ★ Best pairs: every pair shown gets a star score, and the top STAR_TOP of the list are ranked ★1..★5 (gold).
//   strength  = percentile of the pair's both-hit chance among EVERY valid pair tonight with the same props
//               (goal+goal vs all goal+goal, point+point vs all point+point, ...) — "how good is this of its kind";
//               raw chance alone would always crown point pairs (60%) over goal pairs (15%).
//   + value   = 0.3 x expected return at the book (goal+goal with a price only; clipped -50%..+100%)
//   + lineups = 0.05 per leg already in an official lineup (no void risk)
// Matchup, form, grade, due boosts are already inside each leg's chance, so they aren't counted twice.
export const STAR_TOP = 5;
export const PROP_FILTERS = [
  { key: null, label: "All props" },
  { key: "goal", label: "🚨 Goal pairs" },
  { key: "point", label: "🍎 Point pairs" },
  { key: "sog3", label: "🏒 Shots pairs" },
];

export const toDecimal = (am) => (am > 0 ? 1 + am / 100 : 1 + 100 / -am);
export const toAmerican = (dec) => (dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1)));
const fairAmerican = (p) => toAmerican(1 / p);

function legOf(p, prop) {
  const chance = prop === "goal" ? p.anytimeGoalPct / 100 : prop === "point" ? p.anytimePointPct / 100 : p.modelProbs?.sog3;
  if (chance == null || !(chance > 0)) return null;
  return { p, prop, chance, book: prop === "goal" ? p.book || null : null };
}

function relation(a, b) {
  if (a.p.team === b.p.team) return "team";
  return a.p.opponentTeam === b.p.team ? "opp" : "diff";
}

function corrKey(a, b) {
  const s = [a.prop, b.prop].sort().join("+");
  return { "goal+goal": "gg", "goal+point": "gp", "point+point": "pp", "sog3+sog3": "ss" }[s] || null;
}

// Best price for the parlay at a single book where both legs are listed. boost = profit boost (1 = 100%).
function bookParlay(a, b, boost) {
  if (!a.book?.books || !b.book?.books) return null;
  let best = null;
  for (const [bk, am] of Object.entries(a.book.books)) {
    const bm = b.book.books[bk];
    if (am == null || bm == null) continue;
    const dec = toDecimal(am) * toDecimal(bm);
    if (!best || dec > best.dec) best = { book: bk, dec, legs: [am, bm] };
  }
  if (!best) return null;
  const boosted = 1 + (best.dec - 1) * (1 + boost);
  return { ...best, american: toAmerican(best.dec), boostedDec: boosted, boostedAmerican: toAmerican(boosted) };
}

function makePair(a, b, boost) {
  const rel = relation(a, b);
  const ck = corrKey(a, b);
  const corr = ck ? PAIR_CORR[rel][ck] : null;
  if (corr == null) return null; // e.g. SOG legs in the same game (not measured)
  const chance = Math.min(0.99, a.chance * b.chance * corr);
  const sameGame = rel !== "diff";
  const parlay = !sameGame && a.prop === "goal" && b.prop === "goal" ? bookParlay(a, b, boost) : null;
  const ev = parlay ? chance * parlay.boostedDec - 1 : null;
  const [x, y] = a.p.playerId < b.p.playerId ? [a, b] : [b, a];
  return {
    key: `${x.p.playerId}:${x.prop}|${y.p.playerId}:${y.prop}`,
    legs: [a, b], rel, corr, chance, fair: fairAmerican(chance), sameGame, parlay, ev,
  };
}

function allPairs(legs, filter, boost) {
  const out = [];
  for (let i = 0; i < legs.length; i++) {
    for (let j = i + 1; j < legs.length; j++) {
      const a = legs[i], b = legs[j];
      if (a.p.playerId === b.p.playerId) continue;
      if (!filter(a, b)) continue;
      const pr = makePair(a, b, boost);
      if (pr) out.push(pr);
    }
  }
  return out;
}

// Take pairs in order, skipping repeats and any player already used state.cap times.
function take(sorted, n, state) {
  const got = [];
  for (const pr of sorted) {
    if (got.length >= n) break;
    if (state.keys.has(pr.key)) continue;
    const ids = pr.legs.map((l) => l.p.playerId);
    if (ids.some((id) => (state.uses.get(id) || 0) >= state.cap)) continue;
    state.keys.add(pr.key);
    ids.forEach((id) => state.uses.set(id, (state.uses.get(id) || 0) + 1));
    got.push(pr);
  }
  return got;
}

// players: live slate skaters (upcoming games). Returns up to MAX_PAIRS pairs, each tagged with its section.
// prop = null | "goal" | "point" | "sog3": only pairs whose two legs are both that prop (up to 10 of them).
export function buildPairs(players, { mode = "balanced", boost = 0, prop = null } = {}) {
  const live = players.filter((p) => !p.gameStarted && p.lineupStatus !== "out" && p.lineupStatus !== "scratched");
  const top = (k) => live.map((p) => legOf(p, k)).filter(Boolean).sort((a, b) => b.chance - a.chance).slice(0, LEGS_PER_PROP);
  const allGoal = top("goal"), allPoint = top("point"), allSog = top("sog3");
  const only = (k, list) => (prop && prop !== k ? [] : list);
  const goal = only("goal", allGoal), point = only("point", allPoint), sog = only("sog3", allSog);
  const universe = starUniverse(allGoal, allPoint, allSog);
  return withStars(pickPairs({ goal, point, sog, live, mode, boost, prop }), universe);
}

// Sorted both-hit chances of every valid pair tonight, per prop combination (for the star strength percentile).
function starUniverse(goal, point, sog) {
  const by = {};
  for (const pr of [...allPairs([...goal, ...point], () => true, 0), ...allPairs(sog, () => true, 0)]) {
    const k = comboOf(pr);
    (by[k] ||= []).push(pr.chance);
  }
  for (const k of Object.keys(by)) by[k].sort((a, b) => a - b);
  return by;
}

export const comboOf = (pr) => pr.legs.map((l) => l.prop).sort().join("+");

function pctBelow(sorted, v) {
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] <= v) lo = m + 1; else hi = m; }
  return sorted.length > 1 ? (lo - 1) / (sorted.length - 1) : 1;
}

export function starScore(pr, universe) {
  const strength = Math.max(0, pctBelow(universe[comboOf(pr)] || [pr.chance], pr.chance));
  const value = pr.ev != null ? 0.3 * Math.min(1, Math.max(-0.5, pr.ev)) : 0;
  const lineups = 0.05 * pr.legs.filter((l) => l.p.lineupStatus === "dressed").length;
  return { score: strength + value + lineups, strength, value, lineups };
}

function withStars(list, universe) {
  const scored = list.map((pr) => ({ ...pr, star: starScore(pr, universe) }));
  const order = [...scored].sort((a, b) => b.star.score - a.star.score);
  const rank = new Map(order.slice(0, STAR_TOP).map((pr, i) => [pr.key, i + 1]));
  return scored.map((pr) => ({ ...pr, starRank: rank.get(pr.key) ?? null }));
}

function pickPairs({ goal, point, sog, live, mode, boost, prop }) {
  const byChance = (a, b) => b.chance - a.chance;
  const byEv = (a, b) => b.ev - a.ev;
  const state = { keys: new Set(), uses: new Map(), cap: MAX_PER_PLAYER[mode] ?? MAX_PER_PLAYER.default };
  const tag = (list, section) => list.map((pr) => ({ ...pr, section }));

  const goalPairs = allPairs(goal, (a, b) => relation(a, b) === "diff", boost).sort(byChance);
  const valuePairs = allPairs(goal.filter((l) => l.book), (a, b) => relation(a, b) === "diff", boost)
    .filter((pr) => pr.ev != null && pr.ev > 0).sort(byEv);
  // Teammate stacks: goal + point or point + point on one team (the +12% assist link).
  const teamStacks = allPairs([...goal, ...point], (a, b) => relation(a, b) === "team" && !(a.prop === "goal" && b.prop === "goal"), boost).sort(byChance);
  const oppStacks = allPairs([...goal, ...point], (a, b) => relation(a, b) === "opp", boost).sort(byChance);
  const pointPairs = allPairs(point, (a, b) => relation(a, b) === "diff", boost).sort(byChance);
  const sogPairs = allPairs(sog, (a, b) => relation(a, b) === "diff", boost).sort(byChance);
  // 🔥 Due / 🍎 Points due / 🚀 Breakout Watch legs (their boosts are already in the chances), paired with any leg.
  const hot = hotIds(live);
  const isHot = (l) => (l.prop === "goal" && (l.p.dueHeat || hot.breakout.has(l.p.playerId))) || (l.prop === "point" && l.p.pointHeat);
  const duePairs = allPairs([...goal, ...point], (a, b) => isHot(a) || isHot(b), boost).sort(byChance);
  const isSoft = (l) => l.p.oppSoftPct != null && l.p.oppSoftPct >= SOFT_D;
  const softPairs = allPairs([...goal, ...point, ...sog].filter(isSoft), () => true, boost).sort(byChance);

  if (mode === "value") return tag(take(valuePairs, MAX_PAIRS, state), "💰 Value");
  // One prop type on Balanced: the strongest pairs of that kind across every relationship (teammates, opponents,
  // different games), one per player.
  if (prop && mode === "balanced") {
    const label = { goal: "🚨 Goals", point: "🍎 Points", sog3: "🏒 Shots" }[prop];
    const any = [...allPairs([...goal, ...point], () => true, boost), ...sogPairs].sort(byChance);
    return tag(take(any, MAX_PAIRS, state), label);
  }
  if (mode === "safest") {
    const any = [...allPairs([...goal, ...point], () => true, boost), ...sogPairs].sort(byChance);
    return tag(take(any, MAX_PAIRS, state), "🛡️ Safest");
  }
  if (mode === "due") return tag(take(duePairs, MAX_PAIRS, state), "🔥 Due / heating");
  if (mode === "soft") return tag(take(softPairs, MAX_PAIRS, state), "▲ Soft matchup");
  if (mode === "stacks") {
    const t = tag(take(teamStacks, 6, state), "🔗 Teammates");
    const o = tag(take(oppStacks, MAX_PAIRS - t.length, state), "⚔️ Opponents");
    return [...t, ...tag(take(teamStacks, MAX_PAIRS - t.length - o.length, state), "🔗 Teammates"), ...o];
  }
  // balanced
  const out = [
    ...tag(take(goalPairs, 2, state), "🚨 Goals"),
    ...tag(take(valuePairs, 2, state), "💰 Value"),
    ...tag(take(softPairs, 2, state), "▲ Soft matchup"),
    ...tag(take(duePairs, 2, state), "🔥 Due / heating"),
    ...tag(take(teamStacks, 1, state), "🔗 Teammates"),
  ];
  // last slot: the best 3+ SOG pair, so every prop type is on the board (a point pair if no SOG pair is left)
  const sogSlot = take(sogPairs, 1, state);
  out.push(...tag(sogSlot.length ? sogSlot : take(pointPairs, 1, state), sogSlot.length ? "🏒 Shots" : "🍎 Points"));
  if (out.length < MAX_PAIRS) out.push(...tag(take(goalPairs, MAX_PAIRS - out.length, state), "🚨 Goals"));
  if (out.length < MAX_PAIRS) out.push(...tag(take(pointPairs, MAX_PAIRS - out.length, state), "🍎 Points"));
  return out;
}

function hotIds(players) {
  return { breakout: new Set(breakoutBoard(players).list.map((r) => r.playerId)) };
}

// Blind-spot check: notable skaters tonight who aren't in any shown pair, with why they're notable and their
// strongest prop. Notable = A/A+ grade, 🔥 due, 🍎 points due, 🚀 Breakout Watch, value vs book (edge >= 3), or a
// B-or-better grade against a soft defense.
export function notInPairs(players, pairs) {
  const used = new Set(pairs.flatMap((pr) => pr.legs.map((l) => l.p.playerId)));
  const live = players.filter((p) => !p.gameStarted && p.lineupStatus !== "out" && p.lineupStatus !== "scratched" && p.modelProbs);
  const hot = hotIds(live);
  const out = [];
  for (const p of live) {
    if (used.has(p.playerId)) continue;
    const g = p.effectiveGrade?.letter || "";
    const why = [];
    if (g.startsWith("A")) why.push(`${g} grade`);
    if (p.dueHeat) why.push("🔥 due");
    if (p.pointHeat) why.push("🍎 points due");
    if (hot.breakout.has(p.playerId)) why.push("🚀 breakout");
    if (p.edge != null && p.edge >= 3) why.push(`💰 edge +${p.edge.toFixed(1)}`);
    if (p.oppSoftPct >= SOFT_D && /^[AB]/.test(g)) why.push("▲ soft D");
    if (!why.length) continue;
    const legs = ["goal", "point", "sog3"].map((k) => legOf(p, k)).filter(Boolean);
    const best = legs.sort((a, b) => b.chance - a.chance)[0];
    out.push({ p, why, goal: p.anytimeGoalPct, point: p.anytimePointPct, sog3: p.modelProbs?.sog3 != null ? Math.round(p.modelProbs.sog3 * 1000) / 10 : null, best: best?.prop, score: why.length * 100 + (p.anytimeGoalPct || 0) });
  }
  return out.sort((a, b) => b.score - a.score);
}

// What gets frozen into public/data/pairs/<date>.json (scripts/lock_pairs.mjs) and graded in Track Record.
const r1 = (v) => (v == null ? null : Math.round(v * 1000) / 10); // 0-1 -> % with 1 decimal
export function pairRecord(pr) {
  return {
    key: pr.key, section: pr.section, rel: pr.rel, corr: pr.corr, chancePct: r1(pr.chance), fair: pr.fair,
    starRank: pr.starRank ?? null, star: pr.star ? Math.round(pr.star.score * 1000) / 1000 : null,
    parlay: pr.parlay ? { book: pr.parlay.book, legs: pr.parlay.legs, american: pr.parlay.american, dec: Math.round(pr.parlay.dec * 1000) / 1000 } : null,
    evPct: pr.ev == null ? null : Math.round(pr.ev * 1000) / 10,
    legs: pr.legs.map(({ p, prop, chance, book }) => ({
      playerId: p.playerId, name: p.name, team: p.team, opp: p.opponentTeam, isHome: p.isHome, position: p.position,
      prop, chancePct: r1(chance), grade: p.effectiveGrade?.letter ?? null, lineupStatus: p.lineupStatus ?? null,
      softD: p.oppSoftPct != null && p.oppSoftPct >= SOFT_D, toughD: p.oppSoftPct != null && p.oppSoftPct < 0.33,
      book: book ? { best: book.best, bestBook: book.bestBook, books: book.books } : null, edge: prop === "goal" ? p.edge ?? null : null,
    })),
  };
}

export const relText = (pr) =>
  pr.rel === "diff" ? "Different games — independent" :
  pr.rel === "team" ? `Teammates — ${pr.corr > 1 ? `+${Math.round((pr.corr - 1) * 100)}% (one can assist the other)` : "no measurable link"}` :
  `Opponents, same game — ${Math.round((pr.corr - 1) * 100)}%`;
