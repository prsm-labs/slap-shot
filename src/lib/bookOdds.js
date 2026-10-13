// Sportsbook anytime-goal prices on a skater (set in lib/data.js from public/data/odds/<date>.json):
// p.book = { best, bestBook, bestImplied, medianImplied, books, open? }, p.edge = our goal % minus bestImplied.
// Edge >= VALUE_EDGE = "value" (same cut as the 💰 Value vs book filter).
export const VALUE_EDGE = 3;

export const fmtAmerican = (v) => (v == null ? "—" : v > 0 ? `+${v}` : `${v}`);
export const fmtEdge = (e) => (e == null ? "—" : `${e > 0 ? "+" : ""}${e.toFixed(1)}`);
export const edgeColor = (e) => (e == null ? undefined : e >= VALUE_EDGE ? "var(--accent2)" : e < 0 ? "var(--muted)" : undefined);

// "DK +150 · FD +150 · MGM +165 — opened +140 DK"
export function booksText(book) {
  if (!book) return "No sportsbook price";
  const all = Object.entries(book.books).map(([b, v]) => `${b} ${fmtAmerican(v)}`).join(" · ");
  return book.open ? `${all} — opened ${fmtAmerican(book.open.best)} ${book.open.bestBook}` : all;
}

// "Ours 49.2% vs book 37.7% (+165 MGM)"
export function edgeText(p) {
  if (!p.book) return "No sportsbook price yet";
  return `Ours ${p.anytimeGoalPct}% vs book ${p.book.bestImplied}% (${fmtAmerican(p.book.best)} ${p.book.bestBook}) — edge ${fmtEdge(p.edge)} pts`;
}
