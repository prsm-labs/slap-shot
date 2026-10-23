import { useEffect, useState } from "react";
import { fetchScoredPool, useScoredPool } from "../lib/data.js";
import { matchupKey, setMatchup, toggleMatchup, useMatchup } from "../lib/matchupFilter.js";
import { easternToday, fetchLiveGoals, LIVE_POLL_MS } from "../lib/liveGoals.js";

// 2026-10-22 (user: CourtIQ's layout is the standard for every app): ONE matchup strip in the header, above the tabs -- an
// "All games" card plus a compact card per game (logos, live score, status), ordered live -> upcoming -> final by start time.
// Tapping a game narrows every page to it (the shared lib/matchupFilter.js store), tapping again or "✕ all games" clears it.
// Replaces the per-page MatchupFilter strips (those still render when a page passes its own `games` list for another date).
const LIVE = new Set(["LIVE", "CRIT"]);
const DONE = new Set(["FINAL", "OFF"]);
const logo = (t) => `https://assets.nhle.com/logos/nhl/svg/${t}_dark.svg`;
const timeOf = (utc) => (utc ? new Date(utc).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");

function useLiveScores() {
  const [games, setGames] = useState(null);
  useEffect(() => {
    let alive = true, timer = null;
    const load = async () => {
      try {
        const d = await fetchLiveGoals(easternToday());
        if (!alive) return;
        setGames(d.games || []);
        if (d.unfinished) timer = setTimeout(load, d.started ? LIVE_POLL_MS : 5 * 60_000);
      } catch {
        if (alive) timer = setTimeout(load, 2 * 60_000);
      }
    };
    load();
    return () => { alive = false; clearTimeout(timer); };
  }, []);
  return games;
}

export default function GameStrip() {
  const selected = useMatchup();
  const pool = useScoredPool({ includeStarted: true });
  const liveNow = useLiveScores();
  // 2026-10-23 past night (date picker): the strip shows that night's games with their final scores
  const live = pool?.past ? (pool.meta.slate || []).map((g) => ({ away: { abbrev: g.away, score: g.awayScore }, home: { abbrev: g.home, score: g.homeScore }, state: "OFF" })) : liveNow;
  useEffect(() => { fetchScoredPool().catch(() => {}); }, []);
  const slate = pool?.meta?.slate || [];
  if (!slate.length) return null;
  const byKey = new Map((live || []).map((g) => [matchupKey(g.away?.abbrev, g.home?.abbrev), g]));
  const rank = (g) => { const s = byKey.get(matchupKey(g.away, g.home))?.state; return LIVE.has(s) ? 0 : DONE.has(s) ? 2 : 1; };
  const ordered = [...slate].sort((a, b) => rank(a) - rank(b) || String(a.startTimeUTC).localeCompare(String(b.startTimeUTC)));
  const sel = selected ? slate.find((g) => matchupKey(g.away, g.home) === selected) : null;
  return (
    <div className="game-strip">
      <button className={`game-chip all ${!selected ? "active" : ""}`} onClick={() => setMatchup(null)}>
        All games<span className="gc-status"> {slate.length}</span>
      </button>
      {ordered.map((g) => {
        const k = matchupKey(g.away, g.home);
        const lg = byKey.get(k);
        const st = lg?.state;
        const started = LIVE.has(st) || DONE.has(st);
        const status = LIVE.has(st) ? `● ${lg.clock?.inIntermission ? "INT" : `P${lg.period ?? ""}`} ${lg.clock?.timeRemaining || ""}`.trim() : DONE.has(st) ? "Final" : timeOf(g.startTimeUTC);
        return (
          <button key={k} className={`game-chip ${selected === k ? "active" : ""}`} onClick={() => toggleMatchup(k)}
            title={selected === k ? "Tap again to show all games" : `Show only ${g.away} @ ${g.home} on every page`}>
            {[["away", g.away], ["home", g.home]].map(([side, t]) => (
              <span key={side} className="gc-row"><img src={logo(t)} alt="" width="16" height="16" /> {t}{started && <b className="gc-score">{lg[side]?.score ?? ""}</b>}</span>
            ))}
            <span className={`gc-status ${LIVE.has(st) ? "live" : ""}`}>{status}</span>
          </button>
        );
      })}
      {sel && (
        <button className="game-chip all" onClick={() => setMatchup(null)} title="Every page is narrowed to this game">
          Showing {sel.away} @ {sel.home} only<span className="gc-status"> ✕ all games</span>
        </button>
      )}
    </div>
  );
}
