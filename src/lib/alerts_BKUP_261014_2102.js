// In-app alerts (the drop-down notification bar): goals as they're scored, starting goalies
// confirmed / changed, official lineups posted. One shared store; watchers live in
// components/NotificationBar.jsx. Preferences are saved in this browser.
import { useSyncExternalStore } from "react";

const PREFS_KEY = "slapshot.alerts.v1";
const DEFAULT_PREFS = { goals: true, lineups: true, picksOnly: false };
const SHOW_MS = 8000;
const MAX_VISIBLE = 3;
const MAX_HISTORY = 30;

function loadPrefs() {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

let state = { prefs: loadPrefs(), visible: [], history: [], unread: 0 };
const listeners = new Set();
const set = (next) => {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn());
};
let seq = 0;

export function setAlertPref(key, value) {
  const prefs = { ...state.prefs, [key]: value };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // storage unavailable — keep for this visit
  }
  set({ prefs });
}

// alert: { kind: "goal" | "goalie" | "lineup", icon, title, body, player?: {playerId, name, team} }
export function pushAlert(alert) {
  const a = { ...alert, id: ++seq, at: Date.now() };
  set({
    visible: [a, ...state.visible].slice(0, MAX_VISIBLE),
    history: [a, ...state.history].slice(0, MAX_HISTORY),
    unread: state.unread + 1,
  });
  setTimeout(() => dismissAlert(a.id), SHOW_MS);
}

export function dismissAlert(id) {
  if (state.visible.some((a) => a.id === id)) set({ visible: state.visible.filter((a) => a.id !== id) });
}

export function markAlertsRead() {
  if (state.unread) set({ unread: 0 });
}

export function useAlerts() {
  return useSyncExternalStore((fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, () => state);
}
