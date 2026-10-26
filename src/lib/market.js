// Market check (2026-10-26 review, 3,277 priced skater-games 9/29-10/24): where our goal % and the sportsbook disagree,
// the book has been closer. Rated 3+ pts above the best price (the old "value" lists): we said 25.5%, the book 20.6%,
// 18.9% scored. 3+ pts below (the old "fade" list): we said 17.4%, the book 22.5%, 24.0% scored. Half ours + half the
// book (best price x 0.92 to take out the vig) beat both: log loss .3968 vs ours .4002 / book median .3984, in each half
// of the period too (scratch review/ + tweaks/). Shown as context beside our number -- never a grade input (our model
// leads; the user's "not Vegas-driven" rule). No React here so scripts/lock_pairs.mjs can import it through lib/pairs.js.
export const MARKET_DEVIG = 0.92;
export const MARKET_NOTE =
  "Market check = half our goal %, half the book's best price (vig taken out) — context only, not in our grades. Where we and the book disagree, the book has been closer: rated 3+ pts above the book, we said 25.5%, the book 20.6%, 18.9% scored (9/29-10/24).";

const impliedPct = (am) => (am == null ? null : am > 0 ? 10000 / (am + 100) : (100 * -am) / (-am + 100));

// ours: our chance in %; book: { best } (American). Returns the market check in % (1 decimal), or null without a price.
export function marketPct(ours, book) {
  if (ours == null || book?.best == null) return null;
  return Math.round(((ours + MARKET_DEVIG * impliedPct(book.best)) / 2) * 10) / 10;
}
