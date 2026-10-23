// Shared "filter to one matchup" selection. One selection for the whole app, so picking
// NYI @ TOR on All Matchups keeps the other tabs filtered to that game too until cleared.
// A matchup is keyed "AWAY@HOME" (e.g. "NYI@TOR").
import { useSyncExternalStore } from "react";

let selected = null;
const listeners = new Set();

export function setMatchup(key) {
  selected = key || null;
  listeners.forEach((fn) => fn());
}

export function toggleMatchup(key) {
  setMatchup(selected === key ? null : key);
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useMatchup() {
  return useSyncExternalStore(subscribe, () => selected);
}

export function matchupKey(away, home) {
  return `${away}@${home}`;
}

// A pool skater's game tonight, from their team / opponent / home flag.
export function playerMatchupKey(p) {
  if (!p?.team || !p?.opponentTeam) return null;
  return p.isHome ? matchupKey(p.opponentTeam, p.team) : matchupKey(p.team, p.opponentTeam);
}

export function teamsOf(key) {
  return key ? key.split("@") : [];
}

// Filters a list to the selected matchup; with no selection, returns it unchanged.
export function filterPlayers(list, key) {
  if (!key || !list) return list;
  return list.filter((p) => playerMatchupKey(p) === key);
}

export function filterByTeam(list, key, teamField = "team") {
  if (!key || !list) return list;
  const teams = teamsOf(key);
  return list.filter((x) => teams.includes(x[teamField]));
}
