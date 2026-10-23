// My Picks — one shared store for every [+] button and the My Picks page (modeled on Going Yard's
// GLOBAL_PICKS). Saved in this browser only (localStorage); no account or server involved.
// Each player holds at most one category: picking the same category again removes it, picking a
// different one replaces it.
import { useSyncExternalStore } from "react";

export const PICK_TYPES = [
  { key: "fav", label: "Favorite", emoji: "⭐" },
  { key: "goal", label: "Anytime Goal", emoji: "🚨" },
  { key: "point", label: "Point", emoji: "🍎" },
  { key: "sog", label: "Shots (3+)", emoji: "🏒" },
  { key: "first", label: "First Goal", emoji: "🥇" },
  { key: "dark", label: "Dark Horse", emoji: "🐎" },
  { key: "long", label: "Longshot", emoji: "🎲" },
  { key: "hot", label: "Hot Hand", emoji: "🔥" },
];
export const PICK_TYPE = Object.fromEntries(PICK_TYPES.map((t) => [t.key, t]));

const KEY = "slapshot.picks.v1";
const listeners = new Set();

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
let picks = load(); // pid -> { pid, name, team, type, ts }

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(picks));
  } catch {
    // storage unavailable (private window etc.) — picks still work for this visit
  }
  listeners.forEach((fn) => fn());
}

export function setPick(pid, name, team, type) {
  const next = { ...picks };
  if (next[pid]?.type === type || !type) delete next[pid];
  else next[pid] = { pid, name, team, type, ts: new Date().toISOString() };
  picks = next;
  save();
}

export function removePick(pid) {
  if (!picks[pid]) return;
  const next = { ...picks };
  delete next[pid];
  picks = next;
  save();
}

export function clearPicks() {
  picks = {};
  save();
}

function subscribe(fn) {
  listeners.add(fn);
  // Another tab changed the picks.
  const onStorage = (e) => {
    if (e.key === KEY) {
      picks = load();
      fn();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

export function usePicks() {
  return useSyncExternalStore(subscribe, () => picks);
}
