import { useEffect, useMemo, useState } from "react";
import { useScoredPool } from "../lib/data.js";
import { lineupMaps, skaterStatus, useLineups } from "../lib/lineups.js";
import { filterByTeam, useMatchup } from "../lib/matchupFilter.js";
import { filterPositions, positionLabel, usePosition } from "../lib/positionFilter.js";
import { matchesSearch } from "../lib/teamSearch.js";
import { useSort } from "../lib/useSort.js";
import { openGoalieSlide, openSkaterSlide } from "../slideouts.js";
import PlayerAvatar from "../components/PlayerAvatar.jsx";
import PickButton from "../components/PickButton.jsx";
import LineupBadge from "../components/LineupBadge.jsx";
import GradeBadge from "../components/GradeBadge.jsx";
import MatchupFilter from "../components/MatchupFilter.jsx";
import PositionFilter from "../components/PositionFilter.jsx";
import GamblyButton from "../components/GamblyButton.jsx";
import { betLine } from "../lib/gambly.js";

// 🆙 Called Up — this season's minor-league call-ups (public/data/callups.json, nhl_project/build_callups.py:
// ESPN transactions + NHL rosters / player pages): when and from where, their AHL line this season and last, NHL
// experience, and tonight — opponent, lineup status (✅ dressed / OUT / PP unit) and, when they have NHL history,
// the model's goal chance and grade from tonight's pool.

const STATUS_OPTIONS = [["up", "Still up"], ["all", "All call-ups"], ["down", "Sent down"]];
const muted = { color: "var(--muted)" };

function daysAgo(d) {
  const n = Math.round((Date.now() - new Date(`${d}T12:00:00`).getTime()) / 86_400_000);
  return n <= 0 ? "today" : n === 1 ? "1 day ago" : `${n} days ago`;
}
const fmtDate = (d) => new Date(`${d}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric" });
function age(birth) {
  if (!birth) return null;
  const b = new Date(`${birth}T12:00:00`);
  return Math.floor((Date.now() - b.getTime()) / (365.25 * 86_400_000));
}
function line(s, goalie) {
  if (!s || !s.gamesPlayed) return "—";
  if (goalie) return `${s.gamesPlayed} GP · ${s.savePct != null ? s.savePct.toFixed(3).replace(/^0/, "") : "—"} · ${s.gaa ?? "—"} GAA`;
  return `${s.gamesPlayed} GP · ${s.goals}-${s.assists}-${s.points}`;
}
const ppg = (s) => (s?.gamesPlayed ? s.points / s.gamesPlayed : null);
const draftText = (d) => (d?.year ? `${d.year} R${d.round} #${d.overallPick}${d.teamAbbrev ? ` ${d.teamAbbrev}` : ""}` : "Undrafted");
const startTime = (utc) => (utc ? new Date(utc).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");

export default function CalledUpTab() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [status, setStatus] = useState("up");
  const [lineupOnly, setLineupOnly] = useState(false);
  const [tonightOnly, setTonightOnly] = useState(false);
  const [team, setTeam] = useState("");
  const [search, setSearch] = useState("");
  const live = useScoredPool({ includeStarted: true });
  const meta = live?.meta;
  const lineups = useLineups(meta?.slateDate);
  const maps = useMemo(() => lineupMaps(lineups), [lineups]);
  const selected = useMatchup();
  const position = usePosition();

  useEffect(() => {
    fetch("/data/callups.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch((e) => setErr(e.message));
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const pool = new Map((live?.players || []).map((p) => [p.playerId, p]));
    const games = new Map();
    for (const g of meta?.slate || []) {
      games.set(g.away, { opp: g.home, home: false, g });
      games.set(g.home, { opp: g.away, home: true, g });
    }
    return data.players.map((c) => {
      const p = c.playerId ? pool.get(c.playerId) : null;
      const game = games.get(c.team);
      const lineup = c.playerId ? skaterStatus(maps, { playerId: c.playerId, team: c.team, name: c.name }) : null;
      const goalie = c.position === "G";
      return {
        ...c, pool: p, game, lineup, goalie,
        age: age(c.birthDate),
        opponentTeam: game?.opp, // for the matchup filter
        dressed: Boolean(lineup?.dressed),
        goalPct: p?.anytimeGoalPct ?? null,
        gradeScore: p?.gradeScore ?? null,
        ahlPpg: goalie ? c.ahl?.season?.savePct ?? null : ppg(c.ahl?.season),
        ahlLastPpg: goalie ? c.ahl?.last?.savePct ?? null : ppg(c.ahl?.last),
        nhlGp: c.nhl?.careerGp ?? 0,
        debut: (c.nhl?.careerGp ?? 0) === 0,
      };
    });
  }, [data, live, meta, maps]);

  const teams = useMemo(() => [...new Set(rows.map((r) => r.team))].sort(), [rows]);
  const shown = filterPositions(filterByTeam(rows, selected), position).filter((r) =>
    (status === "all" || r.status === status)
    && (!team || r.team === team)
    && (!lineupOnly || r.dressed)
    && (!tonightOnly || r.game)
    && matchesSearch(search, [r.name], [r.team]));
  const { sorted, sortKey, sortDir, toggleSort } = useSort(shown, "recalledOn", "desc");

  if (err) return <div className="note">Couldn't load call-ups ({err}).</div>;
  if (!data) return <div className="mono" style={{ ...muted, fontSize: 12 }}>Loading…</div>;

  const upCount = rows.filter((r) => r.status === "up").length;
  const tonight = rows.filter((r) => r.status === "up" && r.game).length;
  const dressed = rows.filter((r) => r.status === "up" && r.dressed).length;
  const th = (k, label, title, sub) => (
    <th key={k} title={title} className={sortKey === k ? "sorted" : ""} onClick={() => toggleSort(k)}>
      {label}{sortKey === k ? (sortDir === "desc" ? " ↓" : " ↑") : ""}{sub}
    </th>
  );
  const pill = (on, label, onClick, title) => (
    <button key={label} className={`pill-btn ${on ? "active" : ""}`} onClick={onClick} title={title}>{label}</button>
  );
  const open = (r) => {
    if (!r.playerId) return;
    if (r.goalie) openGoalieSlide({ playerId: r.playerId, name: r.name, team: r.team });
    else openSkaterSlide(r.pool || { playerId: r.playerId, name: r.name, team: r.team, position: r.position });
  };

  return (
    <div>
      <div className="section-header">
        <div className="section-title">🆙 Called Up</div>
        <div className="section-sub">Players recalled from the minors this season — their AHL numbers, NHL experience and tonight's lineup</div>
      </div>

      <div className="signal-board" style={{ marginBottom: 12 }}>
        <div className="card" style={{ padding: "10px 14px" }}><div className="mono" style={{ fontSize: 9, ...muted }}>STILL UP</div><div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 22, fontWeight: 700 }}>{upCount}</div></div>
        <div className="card" style={{ padding: "10px 14px" }}><div className="mono" style={{ fontSize: 9, ...muted }}>PLAYING TONIGHT</div><div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 22, fontWeight: 700 }}>{tonight}</div></div>
        <div className="card" style={{ padding: "10px 14px" }}><div className="mono" style={{ fontSize: 9, ...muted }}>✅ IN OFFICIAL LINEUP</div><div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 22, fontWeight: 700 }}>{dressed}</div></div>
        <div className="card" style={{ padding: "10px 14px" }}><div className="mono" style={{ fontSize: 9, ...muted }}>SEASON CALL-UPS</div><div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 22, fontWeight: 700 }}>{rows.length}</div></div>
      </div>

      <MatchupFilter />
      <PositionFilter />
      <div className="pill-row" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10, alignItems: "center" }}>
        {STATUS_OPTIONS.map(([k, label]) => pill(status === k, label, () => setStatus(k)))}
        {pill(tonightOnly, "Playing tonight", () => setTonightOnly(!tonightOnly))}
        {pill(lineupOnly, "✅ In official lineup", () => setLineupOnly(!lineupOnly), "Only players in tonight's posted lineup (around warmups)")}
        <select className="mono" value={team} onChange={(e) => setTeam(e.target.value)}
          style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", fontSize: 11 }}>
          <option value="">All teams</option>
          {teams.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input className="mono" placeholder="Search player or team" value={search} onChange={(e) => setSearch(e.target.value)}
          style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", fontSize: 11, minWidth: 160 }} />
        <span className="mono" style={{ fontSize: 10, ...muted }}>{sorted.length} of {rows.length}</span>
      </div>

      {sorted.length === 0 ? (
        <div className="note">No call-ups match these filters.</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {th("name", "Player")}
                {th("recalledOn", "Called up", "Most recent recall this season, and from which minor-league club")}
                <th>Tonight</th>
                {th("dressed", "Lineup", "✅ = in tonight's official lineup (posted around warmups); OUT = injured; PP = power-play unit (RotoWire)")}
                {th("goalPct", "Goal %", "Model chance to score tonight (players with NHL history in tonight's pool)")}
                {th("gradeScore", "Grade")}
                {th("ahlPpg", "AHL this season", "GP · G-A-P (goalies: GP · SV% · GAA). Sorts by points per game / SV%", <div key="s" style={{ fontSize: 8, fontWeight: 400, letterSpacing: 0, textTransform: "none", color: "var(--muted)" }}>GP · Goals-Assists-Points</div>)}
                {th("ahlLastPpg", "AHL last season", "GP · G-A-P (goalies: GP · SV% · GAA). Sorts by points per game / SV%", <div key="s" style={{ fontSize: 8, fontWeight: 400, letterSpacing: 0, textTransform: "none", color: "var(--muted)" }}>GP · Goals-Assists-Points</div>)}
                <th title="GP · G-A-P (goalies: GP · SV% · GAA)">NHL this season<div style={{ fontSize: 8, fontWeight: 400, letterSpacing: 0, textTransform: "none", color: "var(--muted)" }}>GP · Goals-Assists-Points</div></th>
                {th("nhlGp", "NHL career GP")}
                {th("age", "Age")}
                <th>Draft</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={`${r.playerId || r.name}-${r.team}`} style={r.status === "down" ? { opacity: 0.6 } : undefined}>
                  <td className={r.playerId ? "clickable" : ""} onClick={() => open(r)}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {r.playerId ? <PlayerAvatar playerId={r.playerId} name={r.name} team={r.team} size={28} /> : null}
                      <div>
                        <span className={r.playerId ? "player-name-link" : ""}>{r.name}</span>
                        {r.playerId && !r.goalie && <> <PickButton player={r.pool || { playerId: r.playerId, name: r.name, team: r.team }} /> <GamblyButton text={betLine({ name: r.name, team: r.team }, "goal")} /></>}
                        {r.debut && <span className="mono" title="Hasn't played an NHL game yet" style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, border: "1px solid var(--accent)", color: "var(--accent2)", marginLeft: 4 }}>NHL DEBUT</span>}
                        <div className="mono" style={{ fontSize: 9, ...muted }}>
                          {r.team} · {r.goalie ? "G" : positionLabel(r.position)}{r.shoots ? ` · ${r.goalie ? "catches" : "shoots"} ${r.shoots}` : ""}
                          {r.status === "down" ? ` · sent down ${r.sentDownOn ? fmtDate(r.sentDownOn) : ""}` : ""}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="mono" style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                    {fmtDate(r.recalledOn)} <span style={muted}>· {daysAgo(r.recalledOn)}</span>
                    <div style={{ fontSize: 9, ...muted }}>from {r.from} ({r.fromLeague}){r.timesRecalled > 1 ? ` · ${r.timesRecalled}x this season` : ""}</div>
                  </td>
                  <td className="mono" style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                    {r.game ? <>{r.game.home ? "vs" : "@"} {r.game.opp} <span style={muted}>· {startTime(r.game.g.startTimeUTC)}</span></> : <span style={muted}>No game</span>}
                  </td>
                  <td>{r.lineup ? <LineupBadge status={r.lineup} /> : <span className="mono" style={{ fontSize: 10, ...muted }}>{r.game ? "not posted" : "—"}</span>}</td>
                  <td className="mono">{r.goalPct != null ? `${r.goalPct}%` : "—"}</td>
                  <td>{r.pool?.effectiveGrade ? <GradeBadge grade={r.pool.effectiveGrade} /> : <span className="mono" style={{ fontSize: 10, ...muted }}>—</span>}</td>
                  <td className="mono" style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                    {line(r.ahl?.season, r.goalie)}
                    {!r.goalie && r.ahlPpg != null && <div style={{ fontSize: 9, ...muted }}>{r.ahlPpg.toFixed(2)} P/GP</div>}
                  </td>
                  <td className="mono" style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                    {line(r.ahl?.last, r.goalie)}
                    {!r.goalie && r.ahlLastPpg != null && <div style={{ fontSize: 9, ...muted }}>{r.ahlLastPpg.toFixed(2)} P/GP</div>}
                  </td>
                  <td className="mono" style={{ fontSize: 11, whiteSpace: "nowrap" }}>{line(r.nhl?.season, r.goalie)}</td>
                  <td className="mono">{r.nhlGp}</td>
                  <td className="mono">{r.age ?? "—"}</td>
                  <td className="mono" style={{ fontSize: 10, whiteSpace: "nowrap" }}>{r.noProfile ? "—" : draftText(r.draft)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mono" style={{ fontSize: 9, ...muted, marginTop: 8 }}>
        Call-ups from ESPN's NHL transactions (recalls; a later assignment to the minors = sent down); still up = on the NHL roster today.
        AHL / NHL lines and draft info from the NHL's player pages. Updated with the daily runs ({data._meta.generated}).
        Goal % and grade only for players with NHL history in tonight's pool — a first-timer has no NHL numbers to model yet.
      </div>
    </div>
  );
}
