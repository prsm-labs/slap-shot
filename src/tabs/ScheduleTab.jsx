import { useEffect, useState } from "react";
import { teamsOf, useMatchup } from "../lib/matchupFilter.js";
import { openGame } from "../lib/nav.js";

// 📅 Schedule (2026-10-23, user: a way to see the upcoming schedule and recent scores -- Six Points has one; CourtIQ got
// the same page today). NHL schedule + score feeds through api/schedule.js, 7 days at a time: 📅 Upcoming = today + the
// next 6 days (today's games show live period / clock and finals as they happen), ✅ Results = the 7 days before today,
// newest first; ◀ / ▶ move a week. Finals show the score, OT / SO, shots, the game's multi-goal / multi-point players
// (hat tricks and 3+ point nights marked) and the winning goalie; upcoming games the start time, the teams' current
// W-L-OTL and US TV. Pick a team for just its games and its record over the finished ones shown; the header game strip
// narrows it to that matchup's two teams like every other page.

const SPAN = 7;
const LIVE = new Set(["LIVE", "CRIT"]);
const DONE = new Set(["FINAL", "OFF"]);
const logo = (t) => `https://assets.nhle.com/logos/nhl/svg/${t}_dark.svg`;
const TEAMS = ["ANA", "BOS", "BUF", "CAR", "CBJ", "CGY", "CHI", "COL", "DAL", "DET", "EDM", "FLA", "LAK", "MIN", "MTL", "NJD", "NSH",
  "NYI", "NYR", "OTT", "PHI", "PIT", "SEA", "SJS", "STL", "TBL", "TOR", "UTA", "VAN", "VGK", "WPG", "WSH"];

function easternToday() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
function addDays(ymd, n) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const dayLabel = (ymd, opts) => new Date(`${ymd}T12:00:00`).toLocaleDateString([], opts);
const timeEt = (utc) => (utc ? new Date(utc).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET" : "");

function useSchedule(start, days) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true, timer = null;
    setData(null);
    const load = async () => {
      try {
        const r = await fetch(`/api/schedule?start=${start}&days=${days}`);
        const d = r.ok ? await r.json() : null;
        if (!alive) return;
        setData(d?.days ? d : { days: [], error: true });
        const live = d?.days?.some((x) => x.games.some((g) => LIVE.has(g.state)));
        timer = setTimeout(load, live ? 30_000 : 180_000);
      } catch {
        if (alive) { setData((v) => v || { days: [], error: true }); timer = setTimeout(load, 120_000); }
      }
    };
    load();
    return () => { alive = false; clearTimeout(timer); };
  }, [start, days]);
  return data;
}

function statusOf(g) {
  if (LIVE.has(g.state)) {
    const per = g.periodType === "OT" ? "OT" : g.periodType === "SO" ? "SO" : `P${g.period ?? ""}`;
    return `● ${g.clock?.intermission ? `${per} INT` : `${per} ${g.clock?.time || ""}`}`.trim();
  }
  if (DONE.has(g.state)) return g.lastPeriodType && g.lastPeriodType !== "REG" ? `Final / ${g.lastPeriodType}` : "Final";
  if (g.scheduleState && g.scheduleState !== "OK") return g.scheduleState === "PPD" ? "Postponed" : g.scheduleState;
  return timeEt(g.startUTC);
}

// 2026-10-23 (user): every game opens on the Live tab -- box score, team comparison, play-by-play (or the lineups before puck drop)
function GameRow({ g, focus, date }) {
  const started = LIVE.has(g.state) || DONE.has(g.state);
  const side = (s) => (
    <div className={`sch-team ${s.winner ? "win" : ""} ${focus?.includes(s.team) ? "focus" : ""}`}>
      <img src={logo(s.team)} alt="" width={20} height={20} loading="lazy" />
      <span className="sch-abbr">{s.team}</span>
      {/* the feed's record is today's, not the record at the time -> only on games still to come */}
      {!started && s.record && <span className="sch-muted">{s.record}</span>}
      {started && s.sog != null && <span className="sch-muted">{s.sog} SOG</span>}
      {started && <b className="sch-score">{s.score}</b>}
    </div>
  );
  return (
    <div className="sch-row clickable" role="button" tabIndex={0} title="Open the box score"
      onClick={() => openGame({ date, gameId: g.id })} onKeyDown={(e) => e.key === "Enter" && openGame({ date, gameId: g.id })}>
      <div className={`sch-status ${LIVE.has(g.state) ? "live" : ""}`}>{statusOf(g)}</div>
      <div className="sch-teams">{side(g.away)}{side(g.home)}</div>
      <div className="sch-side">
        {started ? (
          <>
            {g.leaders.map((r) => {
              const mark = r.g >= 3 ? "🎩 hat trick" : r.pts >= 3 ? `${r.pts} pts` : null;
              return (
                <span key={r.id} className={mark ? "ms" : ""}>
                  {r.name} ({r.team}) {r.g ? `${r.g} G` : ""}{r.g && r.a ? " · " : ""}{r.a ? `${r.a} A` : ""}
                  {mark && <b className="sch-ms">{mark}</b>}
                </span>
              );
            })}
            {DONE.has(g.state) && g.winningGoalie && <span className="sch-muted">W: {g.winningGoalie}</span>}
          </>
        ) : <span className="sch-muted">{g.tv || ""}</span>}
        {g.gameType === 1 && <span className="sch-muted">Preseason</span>}
      </div>
    </div>
  );
}

export default function ScheduleTab() {
  const today = easternToday();
  const [view, setView] = useState("upcoming");
  const [offset, setOffset] = useState(0);
  // 2026-10-23: the team comes from the header (MasterFilter) or the game strip; this page's own picker was retired
  const matchup = useMatchup();
  const stripTeams = matchup ? teamsOf(matchup) : null;
  const team = stripTeams?.length === 1 ? stripTeams[0] : "";
  const start = view === "upcoming" ? addDays(today, offset * SPAN) : addDays(today, -SPAN + offset * SPAN);
  const data = useSchedule(start, SPAN);
  const focus = stripTeams;
  let days = (data?.days || []).map((d) => ({ ...d, games: d.games.filter((g) => !focus || focus.includes(g.away.team) || focus.includes(g.home.team)) }));
  if (view === "results") days = days.filter((d) => d.date < today).reverse();
  if (focus) days = days.filter((d) => d.games.length);
  const rec = team ? days.flatMap((d) => d.games).filter((g) => DONE.has(g.state)).reduce((r, g) => {
    const me = g.away.team === team ? g.away : g.home;
    if (me.winner) return { ...r, w: r.w + 1 };
    return g.lastPeriodType && g.lastPeriodType !== "REG" ? { ...r, otl: r.otl + 1 } : { ...r, l: r.l + 1 };
  }, { w: 0, l: 0, otl: 0 }) : null;
  const pick = (v) => { setView(v); setOffset(0); };
  return (
    <div>
      <div className="section-header">
        <div className="section-title">📅 Schedule</div>
        <div className="section-sub">Upcoming games and recent scores, from the NHL's schedule feed.</div>
      </div>
      <div className="sch-controls">
        <div className="pill-row">
          <button className={`pill-btn ${view === "upcoming" ? "active" : ""}`} onClick={() => pick("upcoming")}>📅 Upcoming</button>
          <button className={`pill-btn ${view === "results" ? "active" : ""}`} onClick={() => pick("results")}>✅ Results</button>
        </div>
        <div className="sch-nav">
          <button className="btn" onClick={() => setOffset(offset - 1)}>◀ Earlier</button>
          <span className="sch-range">{dayLabel(start, { month: "short", day: "numeric" })} – {dayLabel(addDays(start, SPAN - 1), { month: "short", day: "numeric" })}</span>
          <button className="btn" onClick={() => setOffset(offset + 1)}>Later ▶</button>
          {offset !== 0 && <button className="btn" onClick={() => setOffset(0)}>{view === "upcoming" ? "Today" : "Latest"}</button>}
        </div>
      </div>
      {stripTeams?.length === 2 && <p className="sch-muted">Showing {stripTeams.join(" and ")} games (the game strip above) -- tap All games to clear.</p>}
      {rec && rec.w + rec.l + rec.otl > 0 && <p className="sch-muted">{team}: {rec.w}-{rec.l}-{rec.otl} in the finished games shown.</p>}
      {!data && <div className="mono stats-muted">Loading the schedule…</div>}
      {data?.error && <div className="note">Couldn't reach the NHL schedule feed -- try again in a minute.</div>}
      {data && !data.error && !days.length && <div className="note">No games in these dates{focus ? " for this team" : ""}.</div>}
      {days.map((d) => (
        <div key={d.date} className={`card sch-day ${d.date === today ? "today" : ""}`}>
          <div className="sch-day-head">
            <b>{dayLabel(d.date, { weekday: "long", month: "short", day: "numeric" })}</b>
            {d.date === today && <span className="badge">TODAY</span>}
            <span className="sch-muted">{d.games.length ? `${d.games.length} game${d.games.length > 1 ? "s" : ""}` : "No games"}</span>
          </div>
          {[...d.games].sort((a, b) => String(a.startUTC).localeCompare(String(b.startUTC))).map((g) => <GameRow key={g.id} g={g} focus={focus} date={d.date} />)}
        </div>
      ))}
      <p className="sch-muted">Refreshed every 30 seconds while a game is live. Start times are Eastern. Tap a game for its box score. Listed under each final: players with 2+ goals or 2+ points (hat tricks and 3+ point nights marked) and the winning goalie.</p>
    </div>
  );
}
