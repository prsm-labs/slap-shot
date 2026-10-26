import { useEffect, useState } from "react";
import { fetchScoredPool, useScoredPool } from "../lib/data.js";
import { keysOf, matchupKey, pickMatchup, setMatchup, setMultiPick, useMatchup, useMultiPick } from "../lib/matchupFilter.js";
import GameStepper, { StripToggle, useStripExpanded } from "./GameStepper.jsx";
import "./MultiPick.css";
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
  const multi = useMultiPick();
  const picked = keysOf(selected);
  const expanded = useStripExpanded();
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
  const selGames = slate.filter((g) => picked.includes(matchupKey(g.away, g.home)));
  const sel = selGames.length === 1 ? selGames[0] : null;
  // 2026-10-26 ◀ ▶ stepper (swipe / ← →) in strip order; off while several games are picked
  const steps = picked.length > 1 ? [] : ordered.map((g) => ({ key: matchupKey(g.away, g.home), label: `${g.away} @ ${g.home}` }));
  const stepAt = picked.length === 1 ? ordered.findIndex((g) => matchupKey(g.away, g.home) === picked[0]) : -1;
  return (
    <>
    <div className={`game-strip ${expanded ? "strip-expanded" : ""}`}>
      <StripToggle className="game-chip all" />
      <button className={`game-chip all ${!selected ? "active" : ""}`} onClick={() => setMatchup(null)}>
        All games<span className="gc-status"> {slate.length}</span>
      </button>
      {/* 2026-10-25 multi-select: Ctrl / Cmd + click a game adds it; on touch this chip turns taps into add / remove */}
      <button className={`game-chip all ms-toggle ${multi ? "on" : ""}`} aria-pressed={multi} onClick={() => setMultiPick(!multi)}
        title="Pick several games at once (on a computer: hold Ctrl or Cmd and click)">
        {multi ? "☑ Multi-select on" : "☐ Multi-select"}<span className="ms-hint">{multi ? "tap games to add / remove" : "or Ctrl / ⌘ + click"}</span>
      </button>
      {ordered.map((g) => {
        const k = matchupKey(g.away, g.home);
        const lg = byKey.get(k);
        const st = lg?.state;
        const started = LIVE.has(st) || DONE.has(st);
        const status = LIVE.has(st) ? `● ${lg.clock?.inIntermission ? "INT" : `P${lg.period ?? ""}`} ${lg.clock?.timeRemaining || ""}`.trim() : DONE.has(st) ? "Final" : timeOf(g.startTimeUTC);
        return (
          <button key={k} className={`game-chip ${picked.includes(k) ? "active ms-picked" : ""}`} onClick={(e) => pickMatchup(k, multi || e.ctrlKey || e.metaKey)}
            title={selected === k ? "Tap again to show all games" : `Show only ${g.away} @ ${g.home} on every page (Ctrl / ⌘ + click to add it)`}>
            {picked.length > 1 && picked.includes(k) && <span className="ms-check" aria-hidden="true">✓</span>}
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
      {selGames.length > 1 && (
        <button className="game-chip all" onClick={() => setMatchup(null)} title="Every page is narrowed to these games">
          Showing {selGames.length} games: {selGames.map((g) => `${g.away}-${g.home}`).join(", ")}<span className="gc-status"> ✕ all games</span>
        </button>
      )}
    </div>
    <GameStepper items={steps} index={stepAt} onPick={(k) => setMatchup(k)} activeSelector=".game-strip .game-chip.active:not(.all)" />
    </>
  );
}
