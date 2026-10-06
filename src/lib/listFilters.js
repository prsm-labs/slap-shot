// Shared list filters for All Matchups / Lamp Lab / Apple Lab — one app-wide selection (like the
// matchup and position filters), so narrowing the list on one page carries to the others.
import { useSyncExternalStore } from "react";
import { breakoutBoard } from "./breakout.js";
import { isGoalSignal, isPointSignal } from "./signals.js";

export const TIER_OPTIONS = [
  { key: null, label: "All tiers" },
  { key: "elite", label: "Elite only", min: 90 },
  { key: "core", label: "Core +", min: 70 },
  { key: "value", label: "Value +", min: 50 },
];
export const GOAL_OPTIONS = [null, 10, 20, 30];
export const GRADE_OPTIONS = [null, "A", "B", "C"]; // "B" = B or better
const GRADE_ORDER = ["A+", "A", "B", "C", "D", "F"];

const DEFAULTS = { tier: null, minGoal: null, minGrade: null, signals: false, soft: false, breakout: false, confirmed: false, search: "" };
let state = { ...DEFAULTS };
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

export function setListFilter(key, value) {
  state = { ...state, [key]: value };
  notify();
}
export function clearListFilters() {
  state = { ...DEFAULTS };
  notify();
}
export function activeFilterCount(f) {
  return Object.keys(DEFAULTS).filter((k) => f[k] !== DEFAULTS[k]).length;
}
export function useListFilters() {
  return useSyncExternalStore((fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, () => state);
}

// list: the players to show; slate: every eligible skater tonight (for the Breakout Watch check).
// signal: "goal" | "point" — which signal the "Signals only" toggle means on this page.
export function applyListFilters(list, f, { slate, signal = "goal" } = {}) {
  if (!list) return list;
  const tierMin = TIER_OPTIONS.find((t) => t.key === f.tier)?.min ?? null;
  const breakoutIds = f.breakout && slate ? new Set(breakoutBoard(slate).list.map((p) => p.playerId)) : null;
  const q = f.search.trim().toLowerCase();
  const sig = signal === "point" ? isPointSignal : isGoalSignal;
  return list.filter((p) =>
    (tierMin == null || (p.slapScore ?? 0) >= tierMin)
    && (f.minGoal == null || (p.anytimeGoalPct ?? 0) >= f.minGoal)
    && (f.minGrade == null || GRADE_ORDER.indexOf(p.effectiveGrade?.letter) <= GRADE_ORDER.indexOf(f.minGrade))
    && (!f.signals || sig(p))
    && (!f.soft || (p.oppSoftPct ?? 0) >= 0.67)
    && (!breakoutIds || breakoutIds.has(p.playerId))
    && (!f.confirmed || p.lineupStatus === "dressed")
    && (!q || `${p.name} ${p.team} ${p.opponentTeam}`.toLowerCase().includes(q)));
}
