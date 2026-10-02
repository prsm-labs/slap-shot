import { useEffect, useMemo, useState } from "react";
import { fetchScoredPool } from "../lib/data.js";
import { openSkaterSlide } from "../slideouts.js";
import PlayerAvatar from "../components/PlayerAvatar.jsx";
import BoxScore from "../components/BoxScore.jsx";
import PositionFilter from "../components/PositionFilter.jsx";
import { filterPositions, positionLabel, usePosition } from "../lib/positionFilter.js";
import { matchupKey, toggleMatchup, setMatchup, useMatchup } from "../lib/matchupFilter.js";
import { FIRST_GOAL, firstGoalsByGame } from "../lib/goalBadges.js";

// Live games + in-game "Heating Up" board (TopCheese-style), fed by /api/live (api/live.js),
// which reads the NHL's play-by-play and scores every skater's night so far. Polls while any
// game is unfinished — same poll-don't-stream approach as Going Yard's live tabs.
const POLL_MS = 30_000;
const DONE = new Set(["FINAL", "OFF"]);
const LIVE = new Set(["LIVE", "CRIT"]);

// Single-hue brightness ramp (network rule: one accent hue, no multi-color temperature scale).
const HEAT_STYLE = {
  fire: { icon: "🔥", color: "#fff", background: "var(--accent2)" },
  hot: { icon: "🔥", color: "#fff", background: "var(--accent)" },
  warm: { icon: "🌡", color: "var(--accent2)", background: "var(--surface2)" },
  neutral: { icon: "—", color: "var(--muted)", background: "var(--surface2)" },
  cold: { icon: "🧊", color: "var(--muted)", background: "transparent" },
};

function easternDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function shiftDate(date, days) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function gameStatus(g) {
  if (LIVE.has(g.state)) {
    const per = g.periodType === "OT" ? "OT" : g.periodType === "SO" ? "SO" : `P${g.period}`;
    return g.clock?.inIntermission ? `${per} INT` : `${per} ${g.clock?.timeRemaining ?? ""}`;
  }
  if (DONE.has(g.state)) return g.periodType && g.periodType !== "REG" ? `FINAL/${g.periodType}` : "FINAL";
  return new Date(g.startTimeUTC).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function HeatBadge({ heat }) {
  const s = HEAT_STYLE[heat.cls] || HEAT_STYLE.neutral;
  return (
    <span
      className="mono"
      title={`Heat ${heat.points}/10 — volume ${heat.volume}, danger ${heat.danger}, recency ${heat.recency}`}
      style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 999, color: s.color, background: s.background, border: "1px solid var(--border)", whiteSpace: "nowrap" }}
    >
      {s.icon} {heat.label} · {heat.points}
    </span>
  );
}

function PressureBar({ g }) {
  if (!g.pressure) return null;
  const { homeShare, awayAttempts, homeAttempts, windowMinutes } = g.pressure;
  return (
    <div style={{ marginTop: 8 }}>
      <div className="mono" style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--muted)" }}>
        <span>{g.away.abbrev} {awayAttempts}</span>
        <span>shot attempts, last {windowMinutes} min</span>
        <span>{homeAttempts} {g.home.abbrev}</span>
      </div>
      <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", marginTop: 3, background: "var(--surface2)" }}>
        <div style={{ width: `${100 - homeShare}%`, background: "var(--accent2)" }} />
        <div style={{ width: `${homeShare}%`, background: "var(--accent)" }} />
      </div>
    </div>
  );
}

function GameCard({ g, selected, onSelect, onBox, boxOpen }) {
  const live = LIVE.has(g.state);
  const started = live || DONE.has(g.state);
  return (
    <div
      className="card"
      onClick={onSelect}
      style={{ padding: "10px 12px", cursor: "pointer", borderColor: selected ? "var(--accent2)" : undefined }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: live ? "var(--green)" : "var(--muted)" }}>
          {live ? "● " : ""}{gameStatus(g)}
        </span>
        {started && <span className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>SOG {g.away.sog ?? "—"}-{g.home.sog ?? "—"}</span>}
      </div>
      {[g.away, g.home].map((t) => (
        <div key={t.abbrev} style={{ display: "flex", justifyContent: "space-between", fontFamily: "'Oswald',sans-serif", fontWeight: 700, fontSize: 18, marginTop: 4 }}>
          <span>{t.abbrev}</span>
          <span>{started ? t.score : ""}</span>
        </div>
      ))}
      <PressureBar g={g} />
      {started && (
        <button
          className={`pill-btn ${boxOpen ? "active" : ""}`}
          style={{ marginTop: 8, width: "100%" }}
          onClick={(e) => { e.stopPropagation(); onBox(); }}
        >
          📋 Box score
        </button>
      )}
      {g.error && <div className="mono" style={{ fontSize: 9, color: "var(--red)", marginTop: 6 }}>Feed error: {g.error}</div>}
    </div>
  );
}

export default function LiveTab() {
  const [date, setDate] = useState(() => easternDate());
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [pool, setPool] = useState(null);
  const selected = useMatchup();
  const [boxGame, setBoxGame] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const position = usePosition();

  useEffect(() => {
    fetchScoredPool().then(({ players }) => setPool(players)).catch(() => setPool([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer = null;
    async function load() {
      try {
        const res = await fetch(`/api/live?date=${date}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || res.status);
        if (cancelled) return;
        setData(body);
        setError(null);
        const unfinished = body.games.some((g) => !DONE.has(g.state));
        if (unfinished) timer = setTimeout(load, POLL_MS);
      } catch (e) {
        if (cancelled) return;
        setError(String(e.message || e));
        timer = setTimeout(load, POLL_MS);
      }
    }
    setData(null);
    setBoxGame(null);
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [date]);

  const poolById = useMemo(() => new Map((pool || []).map((p) => [p.playerId, p])), [pool]);
  // gameId -> scorerId of that game's first goal
  const firstScorer = useMemo(
    () => new Map([...firstGoalsByGame(data?.goals).entries()].map(([gid, g]) => [gid, g.scorerId])),
    [data]
  );

  const gameKeys = useMemo(
    () => new Map((data?.games || []).map((g) => [g.gameId, matchupKey(g.away.abbrev, g.home.abbrev)])),
    [data]
  );
  // The shared matchup filter only applies if that game is on this date's list.
  const gameFilter = selected && [...gameKeys.values()].includes(selected) ? selected : null;

  const rows = useMemo(() => {
    if (!data) return [];
    return data.skaters
      .filter((s) => !gameFilter || gameKeys.get(s.gameId) === gameFilter)
      .filter((s) => showAll || s.heat.points >= 5)
      .filter((s) => filterPositions([s], position).length > 0)
      .map((s) => ({ ...s, pre: poolById.get(s.playerId) }))
      .sort((a, b) => b.heat.points - a.heat.points || b.sog - a.sog || b.hd - a.hd);
  }, [data, gameFilter, gameKeys, showAll, poolById, position]);

  const anyStarted = data?.games.some((g) => LIVE.has(g.state) || DONE.has(g.state));
  const anyLive = data?.games.some((g) => LIVE.has(g.state));
  const today = easternDate();

  return (
    <div>
      <div className="section-header">
        <div className="section-title">🔴 Live</div>
        <div className="section-sub">Tonight's games and who's heating up — built from every real shot in the NHL's live feed</div>
      </div>

      <div className="card" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button className="btn" onClick={() => setDate(shiftDate(date, -1))}>◀</button>
        <span className="mono" style={{ fontSize: 12 }}>
          {new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
        </span>
        <button className="btn" onClick={() => setDate(shiftDate(date, 1))}>▶</button>
        {date !== today && <button className="btn" onClick={() => setDate(today)}>↩ Today</button>}
        <div style={{ flex: 1 }} />
        {data && (
          <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
            {anyLive ? `Live · refreshes every ${POLL_MS / 1000}s · ` : ""}updated {new Date(data.generated).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}
          </span>
        )}
      </div>

      {error && <div className="note" style={{ borderColor: "var(--red)", color: "var(--red)" }}>Live feed error: {error}</div>}
      {!data && !error && <div className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>Loading live feed…</div>}

      {data && data.games.length === 0 && <div className="note">No NHL games on this date.</div>}

      {data && data.games.length > 0 && (
        <div className="grid-cards" style={{ marginBottom: 14 }}>
          {data.games.map((g) => (
            <GameCard
              key={g.gameId}
              g={g}
              selected={gameFilter === gameKeys.get(g.gameId)}
              onSelect={() => toggleMatchup(gameKeys.get(g.gameId))}
              onBox={() => setBoxGame(boxGame === g.gameId ? null : g.gameId)}
              boxOpen={boxGame === g.gameId}
            />
          ))}
        </div>
      )}

      {boxGame && <BoxScore gameId={boxGame} poolById={poolById} onClose={() => setBoxGame(null)} />}

      {data && data.games.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
            <div className="section-title" style={{ fontSize: 18 }}>🔥 Heating Up</div>
            <div className="pill-row">
              <button className={`pill-btn ${!showAll ? "active" : ""}`} onClick={() => setShowAll(false)}>Heating Up +</button>
              <button className={`pill-btn ${showAll ? "active" : ""}`} onClick={() => setShowAll(true)}>All skaters</button>
            </div>
            {gameFilter && <button className="btn" onClick={() => setMatchup(null)}>All games</button>}
          </div>
          <div className="note">
            ℹ️ Heat (0-10) = shots on goal tonight + high-danger attempts (within 20 ft) + attempts in the last 10 minutes
            of game time. 5+ is Heating Up, 8+ is On Fire — the same scale Going Yard uses for hitters, not yet
            checked against hockey results. Click a game card to filter to that matchup; 📋 opens its box score.
          </div>

          {!anyStarted && <div className="note">No game has started yet — the board fills in once the puck drops.</div>}
          {anyStarted && rows.length === 0 && <div className="note">Nobody is at Heating Up yet — switch to All skaters to see everyone.</div>}

          {rows.length > 0 && (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Skater</th>
                    <th>Heat</th>
                    <th>SOG</th>
                    <th>High-danger</th>
                    <th>Last 10 min</th>
                    <th>G-A</th>
                    <th>Last shot</th>
                    <th>Pre-game Slap</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={`${s.gameId}-${s.playerId}`} className={s.heat.cls === "fire" ? "signal-row" : ""}>
                      <td className="clickable" onClick={() => openSkaterSlide(s.pre || { playerId: s.playerId, name: s.name, team: s.team })}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <PlayerAvatar playerId={s.playerId} name={s.name} team={s.team} size={28} />
                          <div>
                            <span className="player-name-link">{s.name}</span>
                            {s.goals > 0 && <span title="Scored tonight"> 🚨</span>}
                            {firstScorer.get(s.gameId) === s.playerId && <span title="Scored the first goal of the game"> {FIRST_GOAL}</span>}
                            <div className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>{s.team} vs {s.opp} · {positionLabel(s.position)}</div>
                          </div>
                        </div>
                      </td>
                      <td><HeatBadge heat={s.heat} /></td>
                      <td>{s.sog}</td>
                      <td>{s.hd}</td>
                      <td>{s.recentAttempts}</td>
                      <td>{s.goals}-{s.assists}</td>
                      <td className="mono" style={{ fontSize: 11 }}>{s.lastShot || "—"}</td>
                      <td>{s.pre ? s.pre.slapScore : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
