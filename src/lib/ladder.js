// Game ladder (Scouting -> 🪜 Game Ladder): for each team tonight, the best anytime-goal pick in each price band —
// favorite down to super-deep longshot — the way a handicapper lays out a game sheet.
// Band = the skater's best sportsbook price (anytime goal); with no price yet, the fair price from our goal %.
// Within a band the pick is the best value: our goal % minus the book's implied % (vig included), so the
// comparison is like-for-like inside a band. Unpriced skaters rank after priced ones, by our goal %.
// Honorable mention = the best value on the team not already shown (band pick or alternate).
export const LADDER_BANDS = [
  { key: "fav", label: "Favorite", short: "FAV", max: 249, title: "Best price +249 or shorter" },
  { key: "second", label: "Secondary", short: "2ND", max: 399, title: "+250 to +399" },
  { key: "long", label: "Longshot", short: "LS", max: 699, title: "+400 to +699" },
  { key: "deep", label: "Deep longshot", short: "DEEP", max: 1199, title: "+700 to +1199" },
  { key: "super", label: "Super deep", short: "SUPER", max: Infinity, title: "+1200 or longer" },
];

// Fair American price from a probability (0-1).
export function fairAmerican(p) {
  if (!(p > 0 && p < 1)) return null;
  return p >= 0.5 ? -Math.round((p / (1 - p)) * 100) : Math.round(((1 - p) / p) * 100);
}

// Price used for banding: best book price, else our fair price.
export function ladderPrice(p) {
  if (p.book?.best != null) return { am: p.book.best, priced: true };
  const fair = fairAmerican((p.anytimeGoalPct ?? 0) / 100);
  return fair == null ? null : { am: fair, priced: false };
}

const bandOf = (am) => LADDER_BANDS.find((b) => am <= b.max) || LADDER_BANDS[LADDER_BANDS.length - 1];
const valueSort = (a, b) =>
  (b.edge != null) - (a.edge != null) || (b.edge ?? 0) - (a.edge ?? 0) || (b.anytimeGoalPct ?? 0) - (a.anytimeGoalPct ?? 0);

// players: one team's skaters tonight (already filtered for scratches / position). Returns
// { bands: [{ ...band, pick, alts: [up to 2] }], honorable, count }.
export function teamLadder(players, { alts = 2 } = {}) {
  const rows = players
    .filter((p) => p.anytimeGoalPct != null)
    .map((p) => ({ p, price: ladderPrice(p) }))
    .filter((r) => r.price);
  const used = new Set();
  const bands = LADDER_BANDS.map((band) => {
    const inBand = rows.filter((r) => bandOf(r.price.am) === band).map((r) => r.p).sort(valueSort);
    const pick = inBand[0] || null;
    for (const p of inBand.slice(0, 1 + alts)) used.add(p.playerId);
    return { ...band, pick, alts: inBand.slice(1, 1 + alts), size: inBand.length };
  });
  const honorable = rows.map((r) => r.p).filter((p) => !used.has(p.playerId) && p.edge != null).sort(valueSort)[0] || null;
  return { bands, honorable, count: rows.length };
}
