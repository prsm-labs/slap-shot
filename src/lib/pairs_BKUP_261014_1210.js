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
// Book parlay price (goal legs only — the only prop we pull prices for): decimal A x decimal B at the same book,
// e.g. +380 / +200 -> 4.80 x 3.00 = 14.40 -> +1340. Books price same-game parlays with their own correlation
// haircut, so a same-game pair only gets our fair price.
export const PAIR_CORR = {
  diff: { gg: 1, gp: 1, pp: 1, ss: 1 },
  opp: { gg: 0.96, gp: 0.98, pp: 0.97 },
  team: { gg: 1.0, gp: 1.12, pp: 1.12 },
};
export const MAX_PAIRS = 10;
const LEGS_PER_PROP = 40; // candidates per prop (by chance); keeps the search small
const MAX_PER_PLAYER = 2;

export const PROPS = {
  goal: { key: "goal", short: "G", label: "Anytime goal", emoji: "🚨" },
  point: { key: "point", short: "P", label: "1+ point", emoji: "🍎" },
  sog3: { key: "sog3", short: "S", label: "3+ shots on goal", emoji: "🏒" },
};

export const MODES = [
  { key: "balanced", label: "⚖️ Balanced", blurb: "Strongest goal pairs by the model, best value goal pairs, teammate stacks, point and SOG pairs" },
  { key: "value", label: "💰 Value vs book", blurb: "Goal + goal pairs, different games, ranked by expected return at the best book" },
  { key: "safest", label: "🛡️ Safest", blurb: "Highest chance both legs hit, any prop" },
  { key: "stacks", label: "🔗 Same game", blurb: "Both legs in one game — teammates (assist link) or opponents" },
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

// Take pairs in order, skipping repeats and any player already used MAX_PER_PLAYER times.
function take(sorted, n, state) {
  const got = [];
  for (const pr of sorted) {
    if (got.length >= n) break;
    if (state.keys.has(pr.key)) continue;
    const ids = pr.legs.map((l) => l.p.playerId);
    if (ids.some((id) => (state.uses.get(id) || 0) >= MAX_PER_PLAYER)) continue;
    state.keys.add(pr.key);
    ids.forEach((id) => state.uses.set(id, (state.uses.get(id) || 0) + 1));
    got.push(pr);
  }
  return got;
}

// players: live slate skaters (upcoming games). Returns up to MAX_PAIRS pairs, each tagged with its section.
export function buildPairs(players, { mode = "balanced", boost = 0 } = {}) {
  const live = players.filter((p) => !p.gameStarted && p.lineupStatus !== "out" && p.lineupStatus !== "scratched");
  const top = (prop) => live.map((p) => legOf(p, prop)).filter(Boolean).sort((a, b) => b.chance - a.chance).slice(0, LEGS_PER_PROP);
  const goal = top("goal"), point = top("point"), sog = top("sog3");
  const byChance = (a, b) => b.chance - a.chance;
  const byEv = (a, b) => b.ev - a.ev;
  const state = { keys: new Set(), uses: new Map() };
  const tag = (list, section) => list.map((pr) => ({ ...pr, section }));

  const goalPairs = allPairs(goal, (a, b) => relation(a, b) === "diff", boost).sort(byChance);
  const valuePairs = allPairs(goal.filter((l) => l.book), (a, b) => relation(a, b) === "diff", boost)
    .filter((pr) => pr.ev != null && pr.ev > 0).sort(byEv);
  // Teammate stacks: goal + point or point + point on one team (the +12% assist link).
  const teamStacks = allPairs([...goal, ...point], (a, b) => relation(a, b) === "team" && !(a.prop === "goal" && b.prop === "goal"), boost).sort(byChance);
  const oppStacks = allPairs([...goal, ...point], (a, b) => relation(a, b) === "opp", boost).sort(byChance);
  const pointPairs = allPairs(point, (a, b) => relation(a, b) === "diff", boost).sort(byChance);
  const sogPairs = allPairs(sog, (a, b) => relation(a, b) === "diff", boost).sort(byChance);

  if (mode === "value") return tag(take(valuePairs, MAX_PAIRS, state), "💰 Value");
  if (mode === "safest") {
    const any = [...allPairs([...goal, ...point], () => true, boost), ...sogPairs].sort(byChance);
    return tag(take(any, MAX_PAIRS, state), "🛡️ Safest");
  }
  if (mode === "stacks") {
    const t = tag(take(teamStacks, 6, state), "🔗 Teammates");
    const o = tag(take(oppStacks, MAX_PAIRS - t.length, state), "⚔️ Opponents");
    return [...t, ...tag(take(teamStacks, MAX_PAIRS - t.length - o.length, state), "🔗 Teammates"), ...o];
  }
  // balanced
  const out = [
    ...tag(take(goalPairs, 2, state), "🚨 Goals"),
    ...tag(take(valuePairs, 2, state), "💰 Value"),
    ...tag(take(teamStacks, 2, state), "🔗 Teammates"),
    ...tag(take(pointPairs, 2, state), "🍎 Points"),
    ...tag(take(sogPairs, 2, state), "🏒 Shots"),
  ];
  if (out.length < MAX_PAIRS) out.push(...tag(take(goalPairs, MAX_PAIRS - out.length, state), "🚨 Goals"));
  if (out.length < MAX_PAIRS) out.push(...tag(take(pointPairs, MAX_PAIRS - out.length, state), "🍎 Points"));
  return out;
}

export const relText = (pr) =>
  pr.rel === "diff" ? "Different games — independent" :
  pr.rel === "team" ? `Teammates — ${pr.corr > 1 ? `+${Math.round((pr.corr - 1) * 100)}% (one can assist the other)` : "no measurable link"}` :
  `Opponents, same game — ${Math.round((pr.corr - 1) * 100)}%`;
