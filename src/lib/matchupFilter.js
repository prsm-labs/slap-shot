// Shared "filter to one matchup" selection. One selection for the whole app, so picking
// NYI @ TOR on All Matchups keeps the other tabs filtered to that game too until cleared.
// A matchup is keyed "AWAY@HOME" (e.g. "NYI@TOR").
import { useSyncExternalStore } from "react";
import { matchesSearch } from "./teamSearch.js";
import { getListSearch } from "./listFilters.js";

// 2026-10-23 (user: one header team dropdown + player search for the whole app): with no matchup picked, the header's team
// is the selection, keyed "TEAM:TOR". teamsOf / filterPlayers / filterByTeam / inScope understand both, so every page that
// follows the game strip follows the team too; filterPlayers / filterByTeam also apply the header search.
let selected = null;
let team = null;
const listeners = new Set();

export function setMatchup(key) {
  selected = key || null;
  listeners.forEach((fn) => fn());
}

export function toggleMatchup(key) {
  setMatchup(selected === key ? null : key);
}

// 2026-10-25 (user: Ctrl-click several matchup cards for a multi-game view; a Multi-select option on touch): several games
// are one key joined by "|" ("NYI@TOR|FLA@CHI"); inScope / filterPlayers / filterByTeam / teamsOf read every game in it.
export const keysOf = (key) => (key && !key.startsWith("TEAM:") ? key.split("|") : []);
export function pickMatchup(key, add) {
  if (!add) return toggleMatchup(key);
  const cur = keysOf(selected);
  const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
  setMatchup(next.join("|") || null);
}
let multi = false; // the strip's Multi-select chip (touch: taps add / remove games)
export function setMultiPick(v) {
  multi = Boolean(v);
  listeners.forEach((fn) => fn());
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const current = () => selected || (team ? `TEAM:${team}` : null);
export function useMatchup() {
  return useSyncExternalStore(subscribe, current);
}
export function useMultiPick() {
  return useSyncExternalStore(subscribe, () => multi);
}
export function setTeamFilter(t) {
  team = t || null;
  if (team) selected = null;
  listeners.forEach((fn) => fn());
}
export function useTeamFilter() {
  return useSyncExternalStore(subscribe, () => team);
}
export const teamOfKey = (key) => (key && key.startsWith("TEAM:") ? key.slice(5) : null);
// Is this "AWAY@HOME" matchup inside the selection (null = everything)?
export function inScope(matchup, key) {
  if (!key) return true;
  const t = teamOfKey(key);
  return t ? String(matchup || "").split("@").includes(t) : keysOf(key).includes(matchup);
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
  const t = teamOfKey(key);
  return t ? [t] : keysOf(key).flatMap((k) => k.split("@"));
}
const searched = (list, names, teams) => {
  const q = getListSearch();
  return q ? list.filter((x) => matchesSearch(q, names(x), teams(x))) : list;
};

// Filters a list to the selected matchup; with no selection, returns it unchanged.
export function filterPlayers(list, key) {
  if (!list) return list;
  const t = teamOfKey(key);
  const ks = keysOf(key);
  const base = !key ? list : t ? list.filter((p) => p.team === t) : list.filter((p) => ks.includes(playerMatchupKey(p)));
  return searched(base, (p) => [p.name], (p) => [p.team, p.opponentTeam]);
}

export function filterByTeam(list, key, teamField = "team") {
  if (!list) return list;
  const teams = teamsOf(key);
  const base = key ? list.filter((x) => teams.includes(x[teamField])) : list;
  return searched(base, (x) => [x.name || x.player || ""], (x) => [x[teamField]]);
}
