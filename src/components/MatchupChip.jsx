import { useEffect, useState } from "react";
import { useScoredPool } from "../lib/data.js";
import { easternToday } from "../lib/liveGoals.js";
import { openGame } from "../lib/nav.js";

// 2026-10-23 (user): the player's game today in the slideout -- start time, or the live score + period / clock, or the
// final -- and on a day his team is off, its most recent game (NHL schedule feed, last 7 days). Tap it for the box score.
const logo = (t) => `https://assets.nhle.com/logos/nhl/svg/${t}_dark.svg`;
const timeEt = (utc) => (utc ? new Date(utc).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET" : "");
const addDays = (ymd, n) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export default function MatchupChip({ player, t }) {
  const meta = useScoredPool({ includeStarted: true })?.meta;
  const game = player && (meta?.slate || []).find((g) => g.away === player.team || g.home === player.team);
  const [last, setLast] = useState(null);
  useEffect(() => {
    setLast(null);
    if (!player?.team || game) return undefined;
    let alive = true;
    const start = addDays(easternToday(), -7);
    fetch(`/api/schedule?start=${start}&days=8`).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!alive || !d?.days) return;
      for (const day of [...d.days].reverse()) {
        const g = day.games.find((x) => (x.away.team === player.team || x.home.team === player.team) && (x.state === "FINAL" || x.state === "OFF"));
        if (g) { setLast({ ...g, date: day.date }); return; }
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, [player?.team, game]);
  if (game) {
    const date = meta?.slateDate;
    const started = t?.started || game.awayScore != null;
    const as = t?.away?.score ?? game.awayScore, hs = t?.home?.score ?? game.homeScore;
    const status = t?.live ? `● P${t.period ?? ""} ${t.clock?.inIntermission ? "INT" : t.clock?.timeRemaining || ""}`.trim() : started ? "Final" : `Today · ${timeEt(game.startTimeUTC)}`;
    return (
      <button className={`matchup-chip ${t?.live ? "live" : ""}`} onClick={() => openGame({ date, gameId: game.gameId })} title="Open the box score">
        <span className="mc-status">{status}</span>
        <span><img src={logo(game.away)} alt="" width="14" height="14" /> {game.away}{started && as != null ? ` ${as}` : ""}</span>
        <span className="mc-at">{started ? "–" : "@"}</span>
        <span>{started && hs != null ? `${hs} ` : ""}{game.home} <img src={logo(game.home)} alt="" width="14" height="14" /></span>
        <span className="mc-go">Box score ›</span>
      </button>
    );
  }
  if (!last) return null;
  const mine = last.away.team === player.team ? last.away : last.home;
  return (
    <button className="matchup-chip" onClick={() => openGame({ date: last.date, gameId: last.id })} title="Open that game's box score">
      <span className="mc-status">Last game · {new Date(`${last.date}T12:00:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</span>
      <span>{last.away.team} {last.away.score} – {last.home.score} {last.home.team}{mine.winner ? " (W)" : ""}</span>
      <span className="mc-go">Box score ›</span>
    </button>
  );
}
