// Today's goals straight from the NHL live feed (via /api/live), in the same row shape as
// public/data/goals_log.json — that file is rebuilt nightly from MoneyPuck, so it never has
// tonight's goals. The Goal Tracker and the ticker use this for today's date.
export const LIVE_POLL_MS = 30_000;
const DONE = new Set(["FINAL", "OFF"]);
const STARTED = new Set(["LIVE", "CRIT", "FINAL", "OFF"]);

export function easternToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

// { goals, hasGames, started, unfinished, firstPuck } for one date.
export async function fetchLiveGoals(date) {
  const res = await fetch(`/api/live?date=${date}`);
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || res.status);
  return {
    goals: body.goals || [],
    hasGames: body.games.length > 0,
    started: body.games.some((g) => STARTED.has(g.state)),
    firstPuck: body.games.length ? body.games.map((g) => g.startTimeUTC).sort()[0] : null,
    unfinished: body.games.some((g) => !DONE.has(g.state)),
    games: body.games, // gameId, state, period, clock — for hat watch (2 goals in a game still on)
  };
}
