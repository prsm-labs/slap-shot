import { useEffect, useState, useSyncExternalStore } from "react";
import { ladderFor } from "./lineBoard.js";
import { PAIR_CORR } from "./pairs.js";

// 🪙 Degen Picks (2026-11-09, user: CourtIQ's play-money mini game in Slap Shot too). Every browser starts with 1,000 free coins,
// picks skater props from tonight's line ladders (the Risk Slider's numbers: lib/lineBoard.js ladderFor on public/data/line_board.json),
// wins / loses coins by our own chance, resets any time. No real money, no book odds, nothing to buy or cash out. Saved in this browser.
//   payout: a hit returns stake / chance (kept between 3% and 97%); if our chances are right, picks break even over time.
//   lock:   picks close at puck drop (the slate's startTimeUTC) and settle from the NHL box score (/api/boxscore); a scratch = void.
//   parlay: 2-6 legs, one per player; chance = legs multiplied x the measured same-game factor (lib/pairs.js PAIR_CORR, goal / point
//           legs, 2022-26: opponents ~0.96-0.98, teammates' goal + point / point + point 1.12). SOG and assist legs in one game
//           weren't measured, so they count as unrelated. Any miss loses; a scratched leg drops out and the rest is re-priced.
// Same rules as CourtIQ's lib/coins.js. Guardrails (Operation Move): coins are never sold, never redeemable, no prizes, not tied to Pro.
export const START = 1000;
export const SIGNUP_START = 10000; // signed-in accounts (login step, Operation Move E)
export const STAKES = [10, 25, 50, 100, 250];
export const MAX_LEGS = 6;
export const STATS = [["G", "Goals"], ["PTS", "Points"], ["A", "Assists"], ["SOG", "Shots on goal"]];
export const STAT_LABEL = Object.fromEntries(STATS);
export const SHORT = { G: "G", PTS: "PTS", A: "A", SOG: "SOG" };
export const clampChance = (c) => Math.min(0.97, Math.max(0.03, Number(c) || 0));
const clampParlay = (c) => Math.min(0.97, Math.max(0.002, Number(c) || 0));
export const payoutFor = (stake, chance) => Math.round(stake / clampChance(chance));
export const parlayPayout = (stake, chance) => Math.round(stake / clampParlay(chance));

const KEY = "slapshot.coins.v1";
const fresh = (run = 1, start = START) => ({ v: 1, run, start, startedAt: new Date().toISOString(), balance: start, bets: [] });
const listeners = new Set();
let state = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    return v && Array.isArray(v.bets) && typeof v.balance === "number" ? v : fresh();
  } catch { return fresh(); }
})();
function commit(next) {
  state = next;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private window: this visit only */ }
  listeners.forEach((fn) => fn());
}
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    try { state = JSON.parse(e.newValue || "null") || fresh(); } catch { state = fresh(); }
    listeners.forEach((fn) => fn());
  });
}
export const useCoins = () => useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => state, () => state);

export const betKey = (b) => `${b.date}|${b.playerId}|${b.stat}|${b.line}`;
export const isOpenPick = (t) => !t || Date.now() < Date.parse(t);
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// ---- tonight's ladders (same inputs as the Risk Slider) ----------------------------------------------------------
let boardPromise = null;
const loadBoard = () => (boardPromise = boardPromise || fetch("/data/line_board.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null));
export function useLineBoard() {
  const [d, setD] = useState(undefined);
  useEffect(() => { let alive = true; loadBoard().then((x) => alive && setD(x)); return () => { alive = false; }; }, []);
  return d;
}
export function laddersOf(p, board) {
  const form = board?.form?.[p.playerId];
  if (!form || form.s.length < board.model.min_games) return {};
  return ladderFor({
    SOG: p.modelProbs?.sog3 ?? null,
    PTS: p.anytimePointPct != null ? p.anytimePointPct / 100 : null,
    G: (p.goalLadderPct ?? p.anytimeGoalPct) != null ? (p.goalLadderPct ?? p.anytimeGoalPct) / 100 : null,
    A: p.modelProbs?.assist ?? null,
  }, form, board.model);
}
export const gameOf = (meta, team) => (meta?.slate || []).find((g) => g.away === team || g.home === team) || null;

// A pick ticket from a live skater + a priced line. Null on a past night.
export function ticket(pool, p, stat, line, chance) {
  const m = pool?.meta;
  if (!m || m.past || line == null || chance == null) return null;
  const g = gameOf(m, p.team);
  if (!g) return null;
  return { date: m.slateDate, gameId: g.gameId, tip: g.startTimeUTC || null, playerId: p.playerId, name: p.name, team: p.team,
    opp: p.opponentTeam || (g.away === p.team ? g.home : g.away), stat, statLabel: STAT_LABEL[stat], line, chance };
}

// ---- parlay pricing ----------------------------------------------------------------------------------------------
const corrKey = (stat) => ({ G: "g", PTS: "p" }[stat] || null);
export function pairFactor(a, b) {
  if (a.gameId !== b.gameId) return 1;
  const ka = corrKey(a.stat), kb = corrKey(b.stat);
  if (!ka || !kb) return 1; // SOG / assist legs in one game: not measured
  return PAIR_CORR[a.team === b.team ? "team" : "opp"]?.[[ka, kb].sort().join("")] ?? 1;
}
export function parlayChance(legs) {
  let p = legs.reduce((s, l) => s * clampChance(l.chance), 1);
  const indep = p;
  for (let i = 0; i < legs.length; i++) for (let j = i + 1; j < legs.length; j++) p *= pairFactor(legs[i], legs[j]);
  return { chance: clampParlay(p), indep, sameGame: legs.some((l, i) => legs.some((m, j) => j > i && m.gameId === l.gameId)) };
}
export function parlayProblem(legs) {
  if (legs.length < 2) return "A parlay needs 2+ legs";
  if (legs.length > MAX_LEGS) return `Up to ${MAX_LEGS} legs`;
  if (new Set(legs.map((l) => `${l.date}|${l.playerId}`)).size < legs.length) return "One leg per player in a parlay";
  return null;
}

export function placeBet(t, stake) {
  stake = Math.floor(Number(stake));
  if (!(stake > 0) || stake > state.balance) return "Not enough coins";
  if (!isOpenPick(t.tip)) return "This game has started";
  if (state.bets.some((b) => b.type !== "parlay" && betKey(b) === betKey(t))) return "Already picked";
  const chance = clampChance(t.chance);
  commit({ ...state, balance: state.balance - stake, bets: [...state.bets, { ...t, id: newId(), chance, stake, payout: payoutFor(stake, chance), placedAt: new Date().toISOString(), status: "open" }] });
  return null;
}
export function placeParlay(legs, stake) {
  stake = Math.floor(Number(stake));
  if (!(stake > 0) || stake > state.balance) return "Not enough coins";
  const bad = parlayProblem(legs);
  if (bad) return bad;
  if (legs.some((l) => !isOpenPick(l.tip))) return "A leg's game has started";
  const { chance } = parlayChance(legs);
  const tip = legs.map((l) => l.tip).filter(Boolean).sort()[0] || null;
  const bet = { type: "parlay", id: newId(), date: legs[0].date, tip, legs: legs.map((l) => ({ ...l, chance: clampChance(l.chance), status: "open" })),
    chance, stake, payout: parlayPayout(stake, chance), placedAt: new Date().toISOString(), status: "open" };
  commit({ ...state, balance: state.balance - stake, bets: [...state.bets, bet] });
  return null;
}
export function cancelBet(id) {
  const b = state.bets.find((x) => x.id === id);
  if (!b || b.status !== "open" || !isOpenPick(b.tip)) return;
  commit({ ...state, balance: state.balance + b.stake, bets: state.bets.filter((x) => x.id !== id) });
}
export function resetCoins() { commit(fresh((state.run || 1) + 1, state.start || START)); }

// ---- settling ----------------------------------------------------------------------------------------------------
const VALUE = { G: (s) => s.goals, PTS: (s) => s.points, A: (s) => s.assists, SOG: (s) => s.sog };
const DONE = new Set(["FINAL", "OFF"]);
function rollUp(b) {
  const legs = b.legs;
  if (legs.some((l) => l.status === "lost")) return { status: "lost" };
  if (legs.some((l) => l.status === "open")) return { status: "open" };
  const live = legs.filter((l) => l.status === "won");
  if (!live.length) return { status: "void" };
  if (live.length === legs.length) return { status: "won" };
  const ch = live.length === 1 ? clampChance(live[0].chance) : parlayChance(live).chance;
  return { status: "won", chance: ch, payout: parlayPayout(b.stake, ch), repriced: true };
}
let running = false;
export async function settleOpen() {
  const todo = [];
  for (const b of state.bets) {
    if (b.status !== "open") continue;
    if (b.type === "parlay") b.legs.forEach((l, i) => { if (l.status === "open" && !isOpenPick(l.tip)) todo.push([b.id, i, l]); });
    else if (!isOpenPick(b.tip)) todo.push([b.id, null, b]);
  }
  if (!todo.length || running) return;
  running = true;
  try {
    const boxes = {};
    const results = new Map();
    for (const [id, i, l] of todo) {
      if (!(l.gameId in boxes)) boxes[l.gameId] = await fetch(`/api/boxscore?gameId=${l.gameId}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const b = boxes[l.gameId];
      if (!b || !DONE.has(b.state)) continue;
      const sk = [...(b.away?.skaters || []), ...(b.home?.skaters || [])].find((s) => s.playerId === l.playerId);
      const res = !sk ? { status: "void", actual: null } : (() => { const v = VALUE[l.stat](sk) ?? 0; return { status: v >= l.line ? "won" : "lost", actual: v }; })();
      results.set(`${id}|${i}`, res);
    }
    if (!results.size) return;
    const now = new Date().toISOString();
    let balance = state.balance;
    const bets = state.bets.map((b) => {
      if (b.status !== "open") return b;
      if (b.type !== "parlay") {
        const r = results.get(`${b.id}|null`);
        if (!r) return b;
        if (r.status === "won") balance += b.payout;
        if (r.status === "void") balance += b.stake;
        return { ...b, ...r, settledAt: now };
      }
      const legs = b.legs.map((l, i) => { const r = results.get(`${b.id}|${i}`); return r ? { ...l, ...r } : l; });
      const u = rollUp({ ...b, legs });
      if (u.status === "open") return { ...b, legs };
      const out = { ...b, legs, ...u, settledAt: now };
      if (out.status === "won") balance += out.payout;
      if (out.status === "void") balance += out.stake;
      return out;
    });
    commit({ ...state, balance, bets });
  } finally { running = false; }
}
export function useCoinSettler() {
  const coins = useCoins();
  const started = (b) => (b.type === "parlay" ? b.legs.some((l) => l.status === "open" && !isOpenPick(l.tip)) : !isOpenPick(b.tip));
  const waiting = coins.bets.some((b) => b.status === "open" && started(b));
  const anyOpen = coins.bets.some((b) => b.status === "open");
  useEffect(() => {
    if (!anyOpen) return undefined;
    settleOpen();
    const t = setInterval(settleOpen, waiting ? 3 * 60 * 1000 : 60 * 1000);
    const vis = () => { if (document.visibilityState === "visible") settleOpen(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [anyOpen, waiting]);
}

export function summarize(coins) {
  const done = coins.bets.filter((b) => b.status === "won" || b.status === "lost");
  const won = done.filter((b) => b.status === "won").length;
  const open = coins.bets.filter((b) => b.status === "open");
  const par = done.filter((b) => b.type === "parlay");
  return {
    done: done.length, won, lost: done.length - won, void: coins.bets.filter((b) => b.status === "void").length, said: done.reduce((s, b) => s + b.chance, 0),
    parlays: par.length, parlaysWon: par.filter((b) => b.status === "won").length, parlaysSaid: par.reduce((s, b) => s + b.chance, 0),
    openN: open.length, inPlay: open.reduce((s, b) => s + b.stake, 0), pnl: coins.balance + open.reduce((s, b) => s + b.stake, 0) - (coins.start || START),
  };
}

// ---- the slip (shared by the Degen Picks page and the skater slideout's 🪙 section) -------------------------------
const SLIP_KEY = "slapshot.coins.slip";
const slipSubs = new Set();
let slip = (() => { try { const v = JSON.parse(localStorage.getItem(SLIP_KEY) || "[]"); return Array.isArray(v) ? v.filter((t) => isOpenPick(t.tip)) : []; } catch { return []; } })();
export function setSlip(next) {
  slip = typeof next === "function" ? next(slip) : next;
  try { localStorage.setItem(SLIP_KEY, JSON.stringify(slip)); } catch { /* this visit only */ }
  slipSubs.forEach((f) => f());
}
export const useSlip = () => useSyncExternalStore((f) => { slipSubs.add(f); return () => slipSubs.delete(f); }, () => slip, () => slip);
export const toggleSlip = (t) => setSlip((cur) => (cur.some((x) => betKey(x) === betKey(t)) ? cur.filter((x) => betKey(x) !== betKey(t)) : [...cur, t]));

// Gambly text ("Name (TEAM) — Anytime Goal Scorer" like the app's other Gambly buttons)
const GAMBLY_WORD = { G: "Goals", PTS: "Points", A: "Assists", SOG: "Shots on Goal" };
export const gamblyLeg = (l) => `${l.name}${l.team ? ` (${l.team})` : ""} — ${l.stat === "G" && l.line === 1 ? "Anytime Goal Scorer" : `${l.line}+ ${GAMBLY_WORD[l.stat]}`}`;
