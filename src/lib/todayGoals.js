// "Scored today" — one shared store for the goal badges on every table (like Going Yard's "gone yard"
// badge) and for the alert bar. Polls /api/live for today (Eastern) every 20s while games are on.
// Until today's first goal, it shows the previous day's scorers, so badges reset the moment the
// first goal of the new day goes in.
//   byPlayer: playerId -> { goals, hatTrick (3+ in one game), hatWatch (exactly 2 in a game still
//   going), opp, gameId }
import { useSyncExternalStore } from "react";
import { easternToday, fetchLiveGoals } from "./liveGoals.js";

const LIVE_MS = 20_000;
const PREGAME_MS = 60_000;
const IDLE_MS = 5 * 60_000;
const LIVE_STATES = new Set(["LIVE", "CRIT"]);

let state = { date: null, goals: [], games: [], byPlayer: new Map(), loaded: false };
const listeners = new Set();
let started = false;

function dayBefore(date) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function summarize(goals, games) {
  const live = new Set(games.filter((g) => LIVE_STATES.has(g.state)).map((g) => g.gameId));
  const perGame = new Map(); // `${playerId}|${gameId}` -> count
  for (const g of goals) {
    const k = `${g.scorerId}|${g.gameId}`;
    perGame.set(k, (perGame.get(k) || 0) + 1);
  }
  const byPlayer = new Map();
  for (const g of goals) {
    const p = byPlayer.get(g.scorerId) || { goals: 0, hatTrick: false, hatWatch: false, opp: g.oppTeam, gameId: g.gameId, team: g.scorerTeam };
    p.goals += 1;
    const n = perGame.get(`${g.scorerId}|${g.gameId}`);
    if (n >= 3) p.hatTrick = true;
    if (n === 2 && live.has(g.gameId)) p.hatWatch = true;
    byPlayer.set(g.scorerId, p);
  }
  return byPlayer;
}

async function poll() {
  let next = IDLE_MS;
  try {
    const today = easternToday();
    let res = await fetchLiveGoals(today);
    let date = today;
    if (res.hasGames && res.unfinished) next = res.started ? LIVE_MS : PREGAME_MS;
    if (!res.goals.length) {
      // No goals yet today: keep showing the previous day's scorers.
      const prev = await fetchLiveGoals(dayBefore(today));
      if (prev.goals.length) {
        res = { ...prev, games: [...prev.games, ...res.games] };
        date = dayBefore(today);
      }
    }
    state = { date, goals: res.goals, games: res.games, byPlayer: summarize(res.goals, res.games), loaded: true };
    listeners.forEach((fn) => fn());
  } catch {
    next = LIVE_MS;
  }
  setTimeout(poll, next);
}

function subscribe(fn) {
  listeners.add(fn);
  if (!started) {
    started = true;
    poll();
  }
  return () => listeners.delete(fn);
}

export function useTodayGoals() {
  return useSyncExternalStore(subscribe, () => state);
}

export function goalBadgeFor(byPlayer, playerId) {
  return playerId != null ? byPlayer.get(playerId) || null : null;
}

// { icon, text, title, count } for a player's badge (see components/PlayerAvatar.jsx).
export function goalBadgeLabel(b, date) {
  if (!b) return null;
  if (b.hatTrick) return { icon: "🎩", text: "Hat trick", title: `Hat trick (${date})`, count: b.goals };
  if (b.hatWatch) return { icon: "👀", text: "Hat watch", title: "HAT WATCH — 2 goals tonight, game still on", count: b.goals };
  return { icon: "🚨", text: b.goals > 1 ? `${b.goals} goals` : "Goal", title: `Scored ${b.goals > 1 ? `${b.goals} goals` : "a goal"} (${date})`, count: b.goals };
}
