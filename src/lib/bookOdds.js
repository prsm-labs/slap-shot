import { useSyncExternalStore } from "react";

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

// ── Tap-to-bet links (build_odds.py stores p.book.links {DK, FD, MGM, BR} from The Odds API; no credits per click) ──
// BetMGM / BetRivers links carry a {state} placeholder (their sites are per state): filled from the viewer's state,
// saved on this device. Links open the book's own site / app with the selection on the bet slip; the viewer must be
// logged in and in a state where that book is legal. Prices can move between our last pull and the tap.
export const BOOK_NAMES = { DK: "DraftKings", FD: "FanDuel", MGM: "BetMGM", BR: "BetRivers", BOV: "Bovada" };
export const BET_STATES = ["AZ", "CO", "CT", "DC", "IA", "IL", "IN", "KS", "KY", "LA", "MA", "MD", "ME", "MI", "NC", "NH", "NJ", "NV", "NY", "OH", "PA", "TN", "VA", "VT", "WV", "WY"];
const STATE_KEY = "slapshot.betstate.v1";
let betState = (() => { try { return localStorage.getItem(STATE_KEY) || ""; } catch { return ""; } })();
const stateListeners = new Set();
export function setBetState(s) {
  betState = s || "";
  try { localStorage.setItem(STATE_KEY, betState); } catch { /* storage off: this visit only */ }
  stateListeners.forEach((fn) => fn());
}
export function useBetState() {
  return useSyncExternalStore((fn) => { stateListeners.add(fn); return () => stateListeners.delete(fn); }, () => betState);
}

// One leg's link at one book: { url } | { needsState: true } | null (no link at that book).
export function betUrl(book, bk, state = betState) {
  const raw = book?.links?.[bk];
  if (!raw) return null;
  if (raw.includes("{state}") && !state) return { needsState: true };
  return {
    url: raw.replace("{state}", state.toLowerCase())
      .replace("{pickType}", "single").replace("|{wagerAmount}", "|"),
  };
}

// Both legs on one slip, for books whose add-to-slip link takes several selections. Built from each leg's own link.
// FanDuel: indexed marketId/selectionId; DraftKings: outcomes joined with "+"; BetMGM: options joined with ",",
// type=Combo. Not verified from here — each leg also has its own link as a fallback.
export function pairBetUrl(legBooks, bk, state = betState) {
  const raws = legBooks.map((b) => b?.links?.[bk]);
  if (raws.some((r) => !r)) return null;
  try {
    if (bk === "FD") {
      const qs = raws.map((r, i) => {
        const u = new URL(r);
        return `marketId[${i}]=${u.searchParams.get("marketId")}&selectionId[${i}]=${u.searchParams.get("selectionId")}`;
      }).join("&");
      return { url: `https://sportsbook.fanduel.com/addToBetslip?${qs}` };
    }
    if (bk === "DK") {
      const outs = raws.map((r) => new URL(r).searchParams.get("outcomes"));
      return { url: `https://sportsbook.draftkings.com/?outcomes=${outs.map(encodeURIComponent).join("+")}` };
    }
    if (bk === "MGM") {
      if (!state) return { needsState: true };
      const opts = raws.map((r) => new URL(r.replace("{state}", "x")).searchParams.get("options"));
      return { url: `https://sports.${state.toLowerCase()}.betmgm.com/en/sports?options=${opts.join(",")}&type=Combo` };
    }
  } catch {
    return null;
  }
  return null;
}
