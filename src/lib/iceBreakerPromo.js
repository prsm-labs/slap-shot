// DraftKings NHL "Ice Breaker" promo: is it on tonight, and what would each pick pay?
//
// The promo: opt in, place a $5+ First Goalscorer bet with the promo token; if that player scores the QUICKEST goal
// (game clock) of the 7 PM ET slate, everyone who picked him splits the pool (usually $250K, $500K for specials) in
// bonus bets. Payout = pool / number of people who picked the winner, so it depends on how popular the pick is.
//
// On tonight? /api/promo (DK Network posts): "confirmed" | "likely" (a Thursday, no post yet) | "off". A viewer can
// switch it on or off for a night here (saved in this browser) — e.g. they see the promo in the DraftKings app before
// DK Network posts about it.
//
// Payout model: share of entrants picking a player = A x p^k, p = his chance to break the ice as the MARKET sees it
// (DraftKings' first-goal price, vig off, x his game's share of the group's first goal from our model) — the crowd
// picks off the odds. Payout = pool / (entrants x share). A = e^7.9865, k = 2.7226 are fitted to the 12 projections on
// a public chart of this promo (fit on last season's 5-game Ice Breakers, 71 payouts, ~27,000 entrants; our refit of
// its points has residual sd 0.07 in log $). The 80% range uses sd 0.75 in log $, read off that chart's band.
// Not our own fit to raw payouts: DK only publishes the winner's payout (DK Network keeps a few — see `history`), so
// treat the dollar figures as a rough guide. Entrants and pool are editable on the page.
import { useEffect, useState, useSyncExternalStore } from "react";

export const PAYOUT = { A: Math.exp(7.9865), k: 2.7226, entrants: 27000, pool: 250000, sigma: 0.75, z80: 1.2816 };

// Projected bonus-bet payout if this player breaks the ice. marketP = market chance (0-1).
export function projectedPayout(marketP, { pool = PAYOUT.pool, entrants = PAYOUT.entrants } = {}) {
  if (!(marketP > 0)) return null;
  const share = Math.min(1, PAYOUT.A * marketP ** PAYOUT.k);
  const mid = Math.min(pool, pool / Math.max(1, entrants * share));
  const spread = Math.exp(PAYOUT.z80 * PAYOUT.sigma);
  return { mid, lo: mid / spread, hi: Math.min(pool, mid * spread), share };
}

// American odds -> decimal
export const decimalOf = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / -a);

// Ice Breaker games: the 7:00 PM ET start group, else the earliest (same rule as build_odds.py promo_games).
export function promoGroup(groups) {
  const seven = groups.find((g) => new Date(g.start).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York" }) === "19:00");
  return seven || groups[0] || null;
}

// Board rows (lib/icebreaker.js) -> promo rows: market chance, payout, EV.
//   marketP = DraftKings first-goal fair % (vig off) x his game's share of the group's icebreaker chance (our model)
//   ev      = OUR icebreaker % x projected payout (bonus bets, face value)
//   betEv   = the $5 qualifying bet itself at the best first-goal price, with our First Goal %
export function promoRows(rows, opts) {
  const gameShare = new Map();
  for (const r of rows) gameShare.set(r.game.gameId, (gameShare.get(r.game.gameId) || 0) + r.iceP);
  return rows.map((r) => {
    const fb = r.firstGoalBook;
    const marketP = fb?.fair != null ? fb.fair * gameShare.get(r.game.gameId) : null;
    const pay = projectedPayout(marketP ?? r.iceP, opts);
    const ev = pay ? r.iceP * pay.mid : null;
    const betEv = fb?.best != null && r.firstGoalP != null ? 5 * (r.firstGoalP * decimalOf(fb.best) - 1) : null;
    return { ...r, marketP, payout: pay?.mid ?? null, payLo: pay?.lo ?? null, payHi: pay?.hi ?? null, pickShare: pay?.share ?? null, promoEv: ev, betEv, fgBest: fb?.best ?? null, fgBook: fb?.bestBook ?? null };
  });
}

// ---- promo status (shared per date) -------------------------------------------------------------------------------
const KEY = "slapshot.icebreaker.v1"; // { [date]: true | false } viewer override
function loadOverrides() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}
let overrides = loadOverrides();
const listeners = new Set();
export function setPromoOverride(date, on) {
  overrides = { ...overrides, [date]: on };
  try {
    localStorage.setItem(KEY, JSON.stringify(overrides));
  } catch {
    // storage unavailable — keep for this visit
  }
  listeners.forEach((fn) => fn());
}
const useOverrides = () => useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => overrides);

const cache = new Map(); // date -> status
export function usePromo(date) {
  const [status, setStatus] = useState(() => cache.get(date) || null);
  const ov = useOverrides();
  useEffect(() => {
    if (!date) return undefined;
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/promo?date=${date}`);
        if (res.ok) {
          const s = await res.json();
          cache.set(date, s);
          if (alive) setStatus(s);
        }
      } catch {
        // offline / API down: overrides still work
      }
    };
    load();
    const t = setInterval(load, 30 * 60 * 1000);
    return () => { alive = false; clearInterval(t); };
  }, [date]);
  const override = ov[date];
  const auto = status?.status === "confirmed" || status?.status === "likely";
  return { ...(status || { status: "unknown", history: [] }), override, on: override ?? auto };
}
