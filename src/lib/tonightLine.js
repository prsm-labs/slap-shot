import { useEffect, useState } from "react";
import { useScoredPool } from "./data.js";

// 2026-10-20 live slideout: the open skater's / goalie's line in tonight's game, from /api/boxscore (NHL feed, cached
// 15 s at the edge). Refreshes every 15 s while the game is live, checks every 2 min before puck drop, stops once final.
// Nothing polls while the slideout is closed.
const LIVE = new Set(["LIVE", "CRIT"]);
const DONE = new Set(["FINAL", "OFF"]);

export function useTonightLine(player) {
  const meta = useScoredPool({ includeStarted: true })?.meta;
  const game = player && (meta?.slate || []).find((g) => g.away === player.team || g.home === player.team);
  const gameId = game?.gameId;
  const [out, setOut] = useState(null);
  useEffect(() => {
    setOut(null);
    if (!gameId || !player?.playerId) return undefined;
    let alive = true;
    let timer = null;
    async function load() {
      let state = null;
      try {
        const r = await fetch(`/api/boxscore?gameId=${gameId}`);
        const b = r.ok ? await r.json() : null;
        if (!alive) return;
        if (b) {
          state = b.state;
          const side = b.away.abbrev === player.team ? "away" : "home";
          const t = b[side], o = b[side === "away" ? "home" : "away"];
          const skater = t.skaters.find((s) => s.playerId === player.playerId) || null;
          const goalie = t.goalies.find((g) => g.playerId === player.playerId) || null;
          setOut({
            gameId, state, live: LIVE.has(state), done: DONE.has(state), started: LIVE.has(state) || DONE.has(state),
            period: b.period, clock: b.clock, us: { abbrev: t.abbrev, score: t.score }, them: { abbrev: o.abbrev, score: o.score },
            away: b.away, home: b.home, skater, goalie,
            goals: (b.scoring || []).filter((g) => g.scorerId === player.playerId),
          });
        }
      } catch { /* offline: try again on the next tick */ }
      if (!alive || DONE.has(state)) return;
      timer = setTimeout(load, LIVE.has(state) ? 15000 : 120000);
    }
    load();
    return () => { alive = false; clearTimeout(timer); };
  }, [gameId, player?.playerId, player?.team, player?.name]);
  return out;
}
