// Estimated ice time tonight, in minutes: the average of the player's last 5 games and his
// season-to-date average (ice time per game played), so a recent promotion or demotion shows
// up without one odd game swinging it. Uses the per-game ice time in each player's last7 log.
export function estimatedToi(p) {
  const season = p.games_played > 0 ? p.icetime / 60 / p.games_played : null;
  const recent = (p.last7 || []).slice(-5).filter((g) => g.icetime > 0);
  const recentAvg = recent.length ? recent.reduce((s, g) => s + g.icetime, 0) / 60 / recent.length : null;
  if (season == null) return recentAvg;
  if (recentAvg == null) return season;
  return (season + recentAvg) / 2;
}

// Power-play minutes per game played (season to date).
export function ppToiPerGame(p) {
  return p.games_played > 0 && p.ppIcetime != null ? p.ppIcetime / 60 / p.games_played : null;
}

// 17.42 -> "17:25"
export function fmtToi(minutes) {
  if (minutes == null || !Number.isFinite(minutes)) return "—";
  const total = Math.round(minutes * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
