// Goal badges shared by the Goal Tracker, Live tab and First Goal tab.
export const FIRST_GOAL = "🥇";
export const FASTEST_GOAL = "⏱️";

// gameId -> that game's first goal (lowest game-elapsed time).
export function firstGoalsByGame(goals) {
  const first = new Map();
  for (const g of goals || []) {
    const cur = first.get(g.gameId);
    if (!cur || g.elapsedSeconds < cur.elapsedSeconds) first.set(g.gameId, g);
  }
  return first;
}

export function isFirstGoal(goal, firstByGame) {
  const f = firstByGame.get(goal.gameId);
  return Boolean(f) && f.elapsedSeconds === goal.elapsedSeconds && f.scorerId === goal.scorerId;
}

// The day's quickest goal from opening puck drop, across every game.
export function fastestGoal(goals) {
  let best = null;
  for (const g of goals || []) if (!best || g.elapsedSeconds < best.elapsedSeconds) best = g;
  return best;
}

// "0:48 into the game"
export function gameClock(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
