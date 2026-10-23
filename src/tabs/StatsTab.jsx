import { Fragment, useEffect, useMemo, useState } from "react";
import { useScoredPool } from "../lib/data.js";
import { openGoalieSlide, openSkaterSlide } from "../slideouts.js";
import PlayerAvatar from "../components/PlayerAvatar.jsx";
import { POSITION_OPTIONS, matchesPosition, setPosition, usePosition } from "../lib/positionFilter.js";
import { useMatchup, useTeamFilter } from "../lib/matchupFilter.js";
import { useListFilters } from "../lib/listFilters.js";

// 📊 Stats (2026-10-20, user: "a 'stats' or 'splits' page that shows a player and teams stats throughout the year.
// Filterable and searchable by team and/or player"). Every skater's, goalie's and team's regular-season line,
// game by game (build_stats.py -> stats_<season>.json from MoneyPuck's game files + NHL final scores, every pipeline
// run): totals or per game, season / last 5 / last 10 / home / away, this season or last. Tap a row for the game log.
// Context only -- nothing on this page is in a grade. (📊 Splits stays as tonight's pool leaderboard with H2H.)

const WINDOWS = [["season", "Season"], ["l5", "Last 5"], ["l10", "Last 10"], ["home", "Home"], ["away", "Away"]];
const VIEWS = [["skaters", "Skaters"], ["goalies", "Goalies"], ["teams", "Teams"]];
const fold = (x) => String(x || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase(); // Stützle -> stutzle

// [label, tooltip, decimals per game, kind]
const S = {
  gp: ["GP", "Games played", 0, "count"], toi: ["TOI", "Ice time per game (min)", 1, "avg"], g: ["G", "Goals", 2, "sum"],
  a: ["A", "Assists", 2, "sum"], pts: ["PTS", "Points", 2, "sum"], sog: ["SOG", "Shots on goal", 1, "sum"],
  shpct: ["SH%", "Shooting % (goals / shots on goal; 10+ shots)", 1, "rate"], att: ["ATT", "Shot attempts", 1, "sum"],
  xg: ["xG", "Expected goals (MoneyPuck)", 2, "sum"], gax: ["G−xG", "Goals minus expected goals (finishing / luck)", 2, "sum"],
  pptoi: ["PP TOI", "Power-play ice time per game (min)", 1, "avg"], ppg: ["PPG", "Power-play goals", 2, "sum"],
  ppp: ["PPP", "Power-play points", 2, "sum"], hit: ["HIT", "Hits", 1, "sum"], blk: ["BLK", "Blocked shots", 1, "sum"],
  pim: ["PIM", "Penalty minutes", 1, "sum"], fopct: ["FO%", "Faceoff win % (20+ draws)", 1, "rate"],
  tk: ["TK", "Takeaways", 1, "sum"], gv: ["GV", "Giveaways", 1, "sum"], pm5: ["5v5 ±", "5-on-5 on-ice goals for minus against", 2, "sum"],
  mg: ["2+ G", "Games with 2+ goals", 0, "count"],
};
const SCOLS = ["gp", "toi", "g", "a", "pts", "sog", "shpct", "att", "xg", "gax", "pptoi", "ppg", "ppp", "hit", "blk", "pim", "fopct", "tk", "gv", "pm5", "mg"];
const G = {
  gp: ["GP", "Games played", 0], w: ["W", "Wins (decision = the goalie with the most ice time)", 0], l: ["L", "Regulation losses", 0],
  otl: ["OTL", "Overtime / shootout losses", 0], sa: ["SA", "Shots against", 1], ga: ["GA", "Goals against", 1],
  svpct: ["SV%", "Save %", 3], gaa: ["GAA", "Goals against per 60 minutes", 2], xga: ["xGA", "Expected goals against", 1],
  gsax: ["GSAx", "Goals saved above expected (xGA − GA)", 1], toi: ["TOI", "Minutes", 0],
};
const GCOLS = ["gp", "w", "l", "otl", "toi", "sa", "ga", "svpct", "gaa", "xga", "gsax"];
const T = {
  gp: ["GP", "Games", 0], rec: ["W-L-OTL", "Record", 0], pts: ["PTS", "Standings points", 0], gf: ["GF", "Goals for (shootout winner counted)", 2],
  ga: ["GA", "Goals against", 2], sog: ["SOG", "Shots on goal", 1], sa: ["SA", "Shots against", 1], xgf: ["xGF", "Expected goals for", 2],
  xga: ["xGA", "Expected goals against", 2], xgpct: ["xG%", "Share of the expected goals in its games", 1], shpct: ["SH%", "Shooting %", 1],
  svpct: ["SV%", "Save %", 3], ppg: ["PPG", "Power-play goals", 2], hit: ["HIT", "Hits", 1], blk: ["BLK", "Blocked shots", 1], pim: ["PIM", "Penalty minutes", 1],
};
const TCOLS = ["gp", "rec", "pts", "gf", "ga", "sog", "sa", "xgf", "xga", "xgpct", "shpct", "svpct", "ppg", "hit", "blk", "pim"];

const inWindow = (games, w) => {
  if (w === "home") return games.filter((g) => g.ha === "vs");
  if (w === "away") return games.filter((g) => g.ha === "@");
  if (w === "l5") return games.slice(-5);
  if (w === "l10") return games.slice(-10);
  return games;
};
const fmt = (v, d = 1) => (v == null || Number.isNaN(v) ? "—" : d ? Number(v).toFixed(d) : Math.round(v).toString());
const sum = (games, k) => games.reduce((s, g) => s + (g[k] || 0), 0);

function skaterLine(games, perGame) {
  const n = games.length;
  const div = perGame && n ? n : 1;
  const out = { gp: n };
  for (const k of ["g", "a", "pts", "sog", "att", "xg", "ppg", "ppp", "hit", "blk", "pim", "tk", "gv"]) out[k] = sum(games, k) / div;
  out.toi = n ? sum(games, "toi") / n : null;
  out.pptoi = n ? sum(games, "pptoi") / n : null;
  out.gax = (sum(games, "g") - sum(games, "xg")) / div;
  out.pm5 = (sum(games, "gf5") - sum(games, "ga5")) / div;
  const sog = sum(games, "sog");
  out.shpct = sog >= 10 ? (100 * sum(games, "g")) / sog : null;
  const fo = sum(games, "fow") + sum(games, "fol");
  out.fopct = fo >= 20 ? (100 * sum(games, "fow")) / fo : null;
  out.mg = games.filter((g) => (g.g || 0) >= 2).length;
  return out;
}

function goalieLine(games, perGame) {
  const n = games.length;
  const div = perGame && n ? n : 1;
  const sa = sum(games, "sa"), ga = sum(games, "ga"), xga = sum(games, "xga"), toi = sum(games, "toi");
  return {
    gp: n, w: games.filter((g) => g.dec === "W").length, l: games.filter((g) => g.dec === "L").length,
    otl: games.filter((g) => g.dec === "OTL").length, toi: toi / div, sa: sa / div, ga: ga / div, xga: xga / div,
    gsax: (xga - ga) / div, svpct: sa ? 1 - ga / sa : null, gaa: toi ? (60 * ga) / toi : null,
  };
}

function teamLine(games, perGame) {
  const n = games.length;
  const div = perGame && n ? n : 1;
  const w = games.filter((g) => g.res?.startsWith("W")).length;
  const otl = games.filter((g) => g.res?.startsWith("OTL")).length;
  const l = games.filter((g) => g.res?.startsWith("L")).length;
  const gf = sum(games, "gf"), ga = sum(games, "ga"), sog = sum(games, "sog"), sa = sum(games, "o_sog"), xgf = sum(games, "xg"), xga = sum(games, "o_xg");
  return {
    gp: n, rec: `${w}-${l}-${otl}`, _w: w, pts: 2 * w + otl, gf: gf / div, ga: ga / div, sog: sog / div, sa: sa / div,
    xgf: xgf / div, xga: xga / div, xgpct: xgf + xga ? (100 * xgf) / (xgf + xga) : null,
    shpct: sog ? (100 * sum(games, "g")) / sog : null, svpct: sa ? 1 - sum(games, "o_g") / sa : null,
    ppg: sum(games, "ppg") / div, hit: sum(games, "hit") / div, blk: sum(games, "blk") / div, pim: sum(games, "pim") / div,
  };
}

function downloadCsv(name, header, rows) {
  const esc = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([[header, ...rows].map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function useSortState(initial) {
  const [key, setKey] = useState(initial);
  const [dir, setDir] = useState(-1); // -1 = high first; tap again to flip
  const on = (k) => {
    if (k === key) setDir((d) => -d);
    else { setKey(k); setDir(-1); }
  };
  const cmp = (av, bv) => {
    if (av == null || bv == null) return (av == null) - (bv == null); // missing last either way
    return dir === -1 ? bv - av : av - bv;
  };
  return { key, dir, on, cmp };
}

function Th({ k, def, s }) {
  return (
    <th className={s.key === k ? "sorted" : ""} title={`${def[1]} — tap to sort, tap again to flip`} onClick={() => s.on(k)}
      aria-sort={s.key === k ? (s.dir === -1 ? "descending" : "ascending") : "none"}>
      {def[0]}{s.key === k ? (s.dir === -1 ? " ↓" : " ↑") : ""}
    </th>
  );
}

function Bars({ games, stat, label }) {
  const last = games.slice(-20);
  const max = Math.max(1, ...last.map((g) => g[stat] || 0));
  return (
    <div className="stats-bars">
      {last.map((g, i) => (
        <div key={`${g.d}-${i}`} className="stats-bar" title={`${g.d} ${g.ha} ${g.opp}: ${g[stat]} ${label}`}>
          <span className="v">{g[stat] ?? 0}</span>
          <span className={`b ${g.res?.startsWith("W") ? "win" : ""}`} style={{ height: `${Math.max(3, (100 * (g[stat] || 0)) / max)}%` }} />
          <span className="x">{g.opp}</span>
        </div>
      ))}
    </div>
  );
}

const shortDate = (d) => new Date(`${d}T12:00:00`).toLocaleDateString([], { month: "numeric", day: "numeric" });
const LOG_S = [["toi", "TOI"], ["g", "G"], ["a", "A"], ["pts", "PTS"], ["sog", "SOG"], ["att", "ATT"], ["xg", "xG"], ["pptoi", "PP TOI"], ["ppp", "PPP"], ["hit", "HIT"], ["blk", "BLK"], ["pim", "PIM"], ["fow", "FOW"], ["fol", "FOL"], ["gf5", "5v5 GF"], ["ga5", "5v5 GA"]];
const LOG_G = [["dec", "Dec"], ["toi", "TOI"], ["sa", "SA"], ["ga", "GA"], ["xga", "xGA"]];
const LOG_T = [["sog", "SOG"], ["o_sog", "SA"], ["xg", "xGF"], ["o_xg", "xGA"], ["ppg", "PPG"], ["hit", "HIT"], ["blk", "BLK"], ["pim", "PIM"], ["fow", "FOW"]];

function GameLog({ title, sub, games, cols, bar, barLabel, card }) {
  return (
    <div className="stats-log">
      <div className="stats-log-head">
        <b>{title}</b> <span className="stats-muted">{sub} · game log (bright bars = wins)</span>
        {card}
      </div>
      <Bars games={games} stat={bar} label={barLabel} />
      <div className="table-wrap" style={{ maxHeight: 340 }}>
        <table className="data-table">
          <thead><tr><th>Date</th><th>Opp</th><th>Result</th>{cols.map(([k, l]) => <th key={k}>{l}</th>)}</tr></thead>
          <tbody>
            {[...games].reverse().map((g, i) => (
              <tr key={`${g.d}-${i}`}>
                <td>{shortDate(g.d)}</td><td>{g.ha} {g.opp}</td><td>{g.res ? `${g.res} ${g.gf}-${g.ga}` : "—"}</td>
                {cols.map(([k]) => <td key={k}>{g[k] ?? "—"}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function StatsTab() {
  const pool = useScoredPool({ includeStarted: true });
  const [index, setIndex] = useState(undefined);
  const [season, setSeason] = useState(null);
  const [book, setBook] = useState(null);
  const [view, setView] = useState("skaters");
  const [win, setWin] = useState("season");
  const [perGame, setPerGame] = useState(false);
  // 2026-10-23: team + search come from the header (MasterFilter); this page's own boxes were retired
  const team = useTeamFilter() || "all";
  const query = useListFilters().search;
  const [minG, setMinG] = useState(1);
  const [open, setOpen] = useState(null);
  const position = usePosition();
  const matchup = useMatchup();
  const ss = useSortState("pts");
  const gs = useSortState("gsax");
  const ts = useSortState("pts");

  useEffect(() => {
    fetch("/data/stats_index.json").then((r) => (r.ok ? r.json() : null)).then(setIndex).catch(() => setIndex(null));
  }, []);
  useEffect(() => {
    if (!index || season) return;
    const cur = index.seasons.find((s) => s.season === index.current);
    setSeason(cur?.n_games ? cur.season : index.seasons.find((s) => s.n_games)?.season || index.current);
  }, [index, season]);
  useEffect(() => {
    if (!season || !index) return;
    const f = index.seasons.find((s) => s.season === season)?.file;
    setBook(null);
    fetch(`/data/${f}`).then((r) => (r.ok ? r.json() : null)).then((d) => setBook(d || { error: true })).catch(() => setBook({ error: true }));
  }, [season, index]);
  useEffect(() => { if (book?.n_games != null) setMinG(book.n_games > 400 ? 10 : 1); }, [book]);

  const parse = (obj, C) => Object.entries(obj || {}).map(([id, v]) => ({
    id, n: v.n, pos: v.pos, t: v.t, games: v.g.map((row) => Object.fromEntries(C.map((c, i) => [c, row[i]]))),
  }));
  const skaters = useMemo(() => (book?.players ? parse(book.players, book.player_cols) : []), [book]);
  const goalies = useMemo(() => (book?.goalies ? parse(book.goalies, book.goalie_cols) : []), [book]);
  const teamGames = useMemo(() => {
    if (!book?.teams) return {};
    const C = book.team_cols;
    return Object.fromEntries(Object.entries(book.teams).map(([t, rows]) => [t, rows.map((row) => Object.fromEntries(C.map((c, i) => [c, row[i]])))]));
  }, [book]);
  const poolSk = useMemo(() => new Map((pool?.players || []).map((p) => [String(p.playerId), p])), [pool]);
  const poolG = useMemo(() => new Map((pool?.goalies || []).map((p) => [String(p.playerId), p])), [pool]);

  if (index === undefined || (index && !book)) return <div className="mono stats-muted">Loading…</div>;
  if (!index || book?.error) return <div className="mono stats-muted">No stats yet.</div>;

  const teams = Object.keys(teamGames).sort();
  const gameKey = matchup && !matchup.startsWith("TEAM:") ? matchup : null;
  const [mAway, mHome] = gameKey ? gameKey.split("@") : [];
  const teamOk = (t) => (gameKey ? t === mAway || t === mHome : team === "all" || t === team);
  const q = fold(query.trim());
  const hit = (p) => !q || fold(p.n).includes(q) || p.t?.toLowerCase() === q;
  const winLabel = Object.fromEntries(WINDOWS)[win];
  const csvBtn = (fn) => <button className="pill-btn stats-csv" onClick={fn}>⬇ CSV</button>;

  let body;
  if (!book.n_games) {
    body = <div className="note">No {book.season} games yet. Last season is one tap away above.</div>;
  } else if (view === "skaters") {
    const rows = skaters
      .filter((p) => matchesPosition(p.pos, position) && teamOk(p.t) && hit(p))
      .map((p) => ({ ...p, line: skaterLine(inWindow(p.games, win), perGame) }))
      .filter((p) => p.line.gp >= minG)
      .sort((a, b) => ss.cmp(a.line[ss.key], b.line[ss.key]));
    const shown = rows.slice(0, 300);
    const dec = (c) => (S[c][3] === "count" ? 0 : S[c][3] === "rate" || S[c][3] === "avg" ? 1 : perGame ? S[c][2] : c === "xg" || c === "gax" ? 1 : 0);
    body = (
      <>
        <div className="stats-meta">
          {rows.length} skaters{rows.length > shown.length ? ` (top ${shown.length} shown — search or filter to narrow)` : ""} · {winLabel}{perGame ? ", per game" : ", totals"} · tap a row for his game log
          {csvBtn(() => downloadCsv(`slap-shot-skaters-${book.season}-${win}${perGame ? "-per-game" : ""}.csv`, ["Player", "Pos", "Team", ...SCOLS.map((c) => S[c][0])],
            rows.map((p) => [p.n, p.pos, p.t, ...SCOLS.map((c) => fmt(p.line[c], dec(c)))])))}
        </div>
        <div className="table-wrap">
          <table className="data-table stats-table">
            <thead><tr><th>Player</th><th>Team</th>{SCOLS.map((c) => <Th key={c} k={c} def={S[c]} s={ss} />)}</tr></thead>
            <tbody>
              {shown.map((p) => (
                <Fragment key={p.id}>
                  <tr className={`clickable stats-row ${open === p.id ? "open" : ""}`} onClick={() => setOpen(open === p.id ? null : p.id)}>
                    <td><div className="stats-name"><PlayerAvatar playerId={p.id} name={p.n} team={p.t} size={24} /><span className="player-name-link">{p.n}</span> <span className="stats-muted">{p.pos}</span></div></td>
                    <td>{p.t}</td>
                    {SCOLS.map((c) => <td key={c} className={c === ss.key ? "stats-sorted" : ""}>{fmt(p.line[c], dec(c))}</td>)}
                  </tr>
                  {open === p.id && (
                    <tr className="stats-detail"><td colSpan={SCOLS.length + 2}>
                      <GameLog title={p.n} sub={`${p.pos} · ${p.t}`} games={p.games} cols={LOG_S} bar="pts" barLabel="points"
                        card={poolSk.get(p.id) && <button className="pill-btn" onClick={() => openSkaterSlide(poolSk.get(p.id))}>Tonight&apos;s card</button>} />
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  } else if (view === "goalies") {
    const rows = goalies
      .filter((p) => teamOk(p.t) && hit(p))
      .map((p) => ({ ...p, line: goalieLine(inWindow(p.games, win), perGame) }))
      .filter((p) => p.line.gp >= Math.min(minG, 3))
      .sort((a, b) => gs.cmp(a.line[gs.key], b.line[gs.key]));
    const dec = (c) => (["gp", "w", "l", "otl"].includes(c) ? 0 : ["svpct", "gaa"].includes(c) ? G[c][2] : perGame ? G[c][2] : c === "gsax" || c === "xga" ? 1 : 0);
    const show = (p, c) => (c === "svpct" && p.line.svpct != null ? p.line.svpct.toFixed(3).replace(/^0/, "") : fmt(p.line[c], dec(c)));
    body = (
      <>
        <div className="stats-meta">
          {rows.length} goalies · {winLabel}{perGame ? ", per game" : ", totals"} · decision goes to the goalie with the most ice time · tap a row for his game log
          {csvBtn(() => downloadCsv(`slap-shot-goalies-${book.season}-${win}.csv`, ["Goalie", "Team", ...GCOLS.map((c) => G[c][0])], rows.map((p) => [p.n, p.t, ...GCOLS.map((c) => show(p, c))])))}
        </div>
        <div className="table-wrap">
          <table className="data-table stats-table">
            <thead><tr><th>Goalie</th><th>Team</th>{GCOLS.map((c) => <Th key={c} k={c} def={G[c]} s={gs} />)}</tr></thead>
            <tbody>
              {rows.map((p) => (
                <Fragment key={p.id}>
                  <tr className={`clickable stats-row ${open === p.id ? "open" : ""}`} onClick={() => setOpen(open === p.id ? null : p.id)}>
                    <td><div className="stats-name"><PlayerAvatar playerId={p.id} name={p.n} team={p.t} size={24} /><span className="player-name-link">{p.n}</span></div></td>
                    <td>{p.t}</td>
                    {GCOLS.map((c) => <td key={c} className={c === gs.key ? "stats-sorted" : ""}>{show(p, c)}</td>)}
                  </tr>
                  {open === p.id && (
                    <tr className="stats-detail"><td colSpan={GCOLS.length + 2}>
                      <GameLog title={p.n} sub={`G · ${p.t}`} games={p.games.map((g) => ({ ...g, sv: g.sa != null ? g.sa - g.ga : null }))} cols={LOG_G} bar="sv" barLabel="saves"
                        card={poolG.get(p.id) && <button className="pill-btn" onClick={() => openGoalieSlide(poolG.get(p.id))}>Tonight&apos;s card</button>} />
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  } else {
    const rows = teams
      .filter((t) => teamOk(t) && (!q || t.toLowerCase().includes(q)))
      .map((t) => ({ team: t, games: inWindow(teamGames[t], win), line: teamLine(inWindow(teamGames[t], win), perGame) }))
      .sort((a, b) => ts.cmp(ts.key === "rec" ? a.line._w : a.line[ts.key], ts.key === "rec" ? b.line._w : b.line[ts.key]));
    const dec = (c) => (["gp", "pts"].includes(c) ? 0 : c === "svpct" ? 3 : ["xgpct", "shpct"].includes(c) ? 1 : perGame ? T[c][2] : ["xgf", "xga"].includes(c) ? 1 : 0);
    const show = (r, c) => (c === "rec" ? r.line.rec : c === "svpct" && r.line.svpct != null ? r.line.svpct.toFixed(3).replace(/^0/, "") : fmt(r.line[c], dec(c)));
    body = (
      <>
        <div className="stats-meta">
          {winLabel}{perGame ? ", per game" : ", totals"} · tap a team for its game log
          {csvBtn(() => downloadCsv(`slap-shot-teams-${book.season}-${win}.csv`, ["Team", ...TCOLS.map((c) => T[c][0])], rows.map((r) => [r.team, ...TCOLS.map((c) => show(r, c))])))}
        </div>
        <div className="table-wrap">
          <table className="data-table stats-table">
            <thead><tr><th>Team</th>{TCOLS.map((c) => <Th key={c} k={c} def={T[c]} s={ts} />)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <Fragment key={r.team}>
                  <tr className={`clickable stats-row ${open === r.team ? "open" : ""}`} onClick={() => setOpen(open === r.team ? null : r.team)}>
                    <td><b>{r.team}</b></td>
                    {TCOLS.map((c) => <td key={c} className={c === ts.key ? "stats-sorted" : ""}>{show(r, c)}</td>)}
                  </tr>
                  {open === r.team && (
                    <tr className="stats-detail"><td colSpan={TCOLS.length + 1}>
                      <GameLog title={r.team} sub="team" games={r.games} cols={LOG_T} bar="gf" barLabel="goals" />
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  const pills = (opts, value, onChange) => (
    <div className="pill-row stats-pills">
      {opts.map(([k, label]) => <button key={k} className={`pill-btn ${value === k ? "active" : ""}`} onClick={() => onChange(k)}>{label}</button>)}
    </div>
  );
  const seasons = index.seasons.filter((s) => s.n_games || s.season === index.current).map((s) => [s.season, s.season]);

  return (
    <div>
      <div className="section-header">
        <div className="section-title">📊 Stats</div>
        <div className="section-sub">
          Every skater, goalie and team, regular season{book.through ? ` through ${new Date(`${book.through}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric" })}` : ""} — MoneyPuck game files + NHL final scores, updated every pipeline run
        </div>
      </div>
      <div className="stats-controls">
        {pills(seasons, season, (s) => { setSeason(s); setOpen(null); })}
        {pills(VIEWS, view, (v) => { setView(v); setOpen(null); })}
        {pills(WINDOWS, win, setWin)}
        {pills([["t", "Totals"], ["p", "Per game"]], perGame ? "p" : "t", (k) => setPerGame(k === "p"))}
      </div>
      <div className="stats-filters">
        {view === "skaters" && (
          <select value={position || ""} onChange={(e) => setPosition(e.target.value || null)} aria-label="Position">
            {POSITION_OPTIONS.map((o) => <option key={o.label} value={o.key || ""}>{o.label}</option>)}
          </select>
        )}
        {view === "skaters" && <label className="stats-muted">Min GP <input type="number" min={0} max={82} value={minG} onChange={(e) => setMinG(Number(e.target.value) || 0)} /></label>}
      </div>
      {gameKey && <div className="stats-meta">Showing {mAway} @ {mHome} only (matchup filter — clear it on Scouting / the game strip).</div>}
      {body}
      <div className="stats-meta">
        Regular season only. Goals and assists in all situations; PP = 5-on-4. 5v5 ± = on-ice 5-on-5 goals for minus against (not
        the NHL&apos;s official +/-). Team SH% / SV% and xG% from its skaters&apos; shots and the opponent&apos;s. Context only — the grades use
        their own tested inputs.
      </div>
    </div>
  );
}
