// Tonight's lineup status for every page, from /api/lineups (api/lineups.js): RotoWire's goalie
// status / power-play units / injuries, plus the NHL's official dressed list once a game's lineup
// is in (around warmups). Re-fetched every few minutes while the slate is still to be played.
import { useEffect, useState } from "react";

const POLL_MS = 3 * 60_000;
const cache = new Map(); // date -> { at, data }

export async function fetchLineups(date) {
  const hit = cache.get(date);
  if (hit && Date.now() - hit.at < POLL_MS - 5_000) return hit.data;
  const res = await fetch(`/api/lineups?date=${date}`);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || res.status);
  cache.set(date, { at: Date.now(), data: body });
  return body;
}

export function useLineups(date) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!date) return undefined;
    let cancelled = false;
    let timer = null;
    async function load() {
      try {
        const body = await fetchLineups(date);
        if (cancelled) return;
        setData(body);
        if (body.games.some((g) => g.state !== "FINAL" && g.state !== "OFF")) timer = setTimeout(load, POLL_MS);
      } catch {
        if (!cancelled) timer = setTimeout(load, POLL_MS);
      }
    }
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [date]);
  return data;
}

// Flatten the API response into lookups the pages use.
//   skaters: playerId -> { dressed, pp: 1|2|null, out: "IR"|"DTD"|...|null }
//   goalies: team -> { name, playerId, status }   (RotoWire's starter)
//   officialTeams: teams whose dressed lineup is in
//   inNet: team -> { name, playerId }   (the goalie who actually started, once the game is on)
//   gameState: team -> NHL game state (FUT, PRE, LIVE, CRIT, FINAL, OFF)
const normName = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");

// Lineup status for a pool skater: by NHL id first, then by team + name — injured players are
// often dropped from the NHL's active roster, so RotoWire's injury list can't always be matched
// to an id.
export function skaterStatus(maps, p) {
  return maps.skaters.get(p.playerId) || maps.outByName.get(`${p.team}|${normName(p.name)}`) || null;
}

export function lineupMaps(data) {
  const skaters = new Map();
  const goalies = new Map();
  const officialTeams = new Set();
  const outByName = new Map();
  const inNet = new Map();
  const gameState = new Map();
  for (const g of data?.games || []) {
    gameState.set(g.away, g.state);
    gameState.set(g.home, g.state);
    for (const [team, t] of Object.entries(g.teams)) {
      const entry = (id) => {
        if (!skaters.has(id)) skaters.set(id, { dressed: false, pp: null, out: null });
        return skaters.get(id);
      };
      if (t.dressed.length) officialTeams.add(team);
      for (const p of t.dressed) entry(p.playerId).dressed = true;
      for (const p of t.pp1) if (p.playerId) entry(p.playerId).pp = 1;
      for (const p of t.pp2) if (p.playerId) entry(p.playerId).pp ??= 2;
      for (const p of t.injuries) {
        if (p.playerId) entry(p.playerId).out = p.tag || "OUT";
        outByName.set(`${team}|${normName(p.name)}`, { dressed: false, pp: null, out: p.tag || "OUT" });
      }
      if (t.goalie) goalies.set(team, t.goalie);
      if (t.inNet) inNet.set(team, t.inNet);
    }
  }
  return { skaters, goalies, officialTeams, outByName, inNet, gameState };
}

// Starting goalie for a team tonight, best source first: the goalie actually in net once the game
// has started (NHL boxscore), a Confirmed report from RotoWire or DailyFaceoff (carried in the
// pool's slate), then RotoWire's expected starter, then ours.
const lastName = (s) => normName(String(s || "").trim().split(/\s+/).pop());

export function startingGoalie(team, slateGame, maps) {
  const actual = maps.inNet?.get(team);
  if (actual) return { ...actual, status: "In net", confirmed: true, source: "NHL boxscore" };
  const side = slateGame && (slateGame.away === team ? "away" : slateGame.home === team ? "home" : null);
  const dfo = side
    ? { name: slateGame[`${side}Goalie`], playerId: slateGame[`${side}GoalieId`], status: slateGame[`${side}GoalieStatus`] }
    : null;
  let rw = maps.goalies.get(team);
  // RotoWire's name couldn't be matched to an NHL id (e.g. the roster lookup failed that run):
  // borrow the id from DailyFaceoff / the pool when it's the same goalie by last name.
  if (rw && rw.playerId == null && dfo?.playerId != null && lastName(rw.name) === lastName(dfo.name)) {
    rw = { ...rw, playerId: dfo.playerId };
  }
  if (rw?.status === "Confirmed") return { ...rw, confirmed: true, source: "RotoWire" };
  if (dfo?.status === "Confirmed") return { ...dfo, confirmed: true, source: "DailyFaceoff" };
  if (rw) return { ...rw, confirmed: false, source: "RotoWire" };
  return dfo ? { ...dfo, confirmed: false, source: "DailyFaceoff / projected" } : null;
}
