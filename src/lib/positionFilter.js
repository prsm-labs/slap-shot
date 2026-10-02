// Shared skater position filter — one app-wide selection (like the matchup filter), so picking
// "Forwards" on one tab keeps every skater list filtered until it's cleared.
// Positions in the data are the NHL's codes: C, L, R (forwards) and D.
import { useSyncExternalStore } from "react";

export const POSITION_OPTIONS = [
  { key: null, label: "All positions" },
  { key: "F", label: "Forwards", codes: ["C", "L", "R"] },
  { key: "C", label: "C", codes: ["C"] },
  { key: "L", label: "LW", codes: ["L"] },
  { key: "R", label: "RW", codes: ["R"] },
  { key: "D", label: "D", codes: ["D"] },
];

let selected = null;
const listeners = new Set();

export function setPosition(key) {
  selected = key || null;
  listeners.forEach((fn) => fn());
}

export function usePosition() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => selected
  );
}

export function matchesPosition(position, key) {
  if (!key) return true;
  const opt = POSITION_OPTIONS.find((o) => o.key === key);
  return Boolean(opt?.codes.includes(position));
}

export function filterPositions(list, key, field = "position") {
  if (!key || !list) return list;
  return list.filter((p) => matchesPosition(p[field], key));
}

// "C" -> "C", "L" -> "LW", "R" -> "RW", "D" -> "D"
export function positionLabel(code) {
  return code === "L" ? "LW" : code === "R" ? "RW" : code || "";
}
