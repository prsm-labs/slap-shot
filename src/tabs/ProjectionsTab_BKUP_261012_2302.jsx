import { useMemo, useState } from "react";
import { useScoredPool } from "../lib/data.js";
import { expectedGoals, fairOdds, projectGame, useTeamRatings } from "../lib/gameModel.js";
import { projectGoalie } from "../lib/crease.js";
import { matchupKey, useMatchup } from "../lib/matchupFilter.js";
import { useSort } from "../lib/useSort.js";
import { openGoalieSlide, openSkaterSlide } from "../slideouts.js";
import MatchupFilter from "../components/MatchupFilter.jsx";
import PlayerAvatar from "../components/PlayerAvatar.jsx";
import PickButton from "../components/PickButton.jsx";

// Projections — game winner, likely final score and a projected box score for every game tonight
// (lib/gameModel.js), plus a "Model" view that opens the model up: team ratings, inputs, backtest.
const pct = (v, d = 0) => (v == null ? "—" : `${(v * 100).toFixed(d)}%`);
const f1 = (v) => (v == null ? "—" : v.toFixed(1));
const f2 = (v) => (v == null ? "—" : v.toFixed(2));
const sv = (v) => (v == null ? "—" : v.toFixed(3).replace(/^0/, ""));
const rec = (r) => (r ? `${r.w}-${r.l}-${r.otl}` : "");
const timeEt = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET";
const muted = { color: "var(--muted)" };
const big = { fontFamily: "'Oswald',sans-serif", fontWeight: 800 };

function WinBar({ away, home, pAway }) {
  return (
    <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", background: "var(--surface2)", margin: "6px 0" }}>
      <div title={`${away} ${pct(pAway, 1)}`} style={{ width: `${pAway * 100}%`, background: pAway >= 0.5 ? "var(--accent)" : "var(--border)" }} />
      <div title={`${home} ${pct(1 - pAway, 1)}`} style={{ flex: 1, background: pAway < 0.5 ? "var(--accent)" : "var(--border)" }} />
    </div>
  );
}

function SkaterLines({ players, team }) {
  const rows = players.filter((p) => p.team === team).sort((a, b) => (b.anytimeGoalPct ?? 0) - (a.anytimeGoalPct ?? 0)).slice(0, 6);
  return (
    <table className="data-table" style={{ fontSize: 11 }}>
      <thead><tr><th>{team} skaters</th><th title="Model chance to score (matchup-adjusted)">Goal</th><th title="Chance of 1+ point">Point</th><th title="Chance of 3+ shots on goal">3+ SOG</th><th title="Season shots on goal per game">SOG/gm</th><th title="Shots on goal per 60 minutes of ice time">SOG/60</th><th /></tr></thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.playerId}>
            <td className="clickable" onClick={() => openSkaterSlide(p)}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <PlayerAvatar playerId={p.playerId} name={p.name} team={p.team} size={22} />
                <span className="player-name-link">{p.name}</span>
                <span className="mono" style={{ fontSize: 9, ...muted }}>{p.position}</span>
              </div>
            </td>
            <td style={{ fontWeight: 700 }}>{p.anytimeGoalPct != null ? `${p.anytimeGoalPct}%` : "—"}</td>
            <td>{p.anytimePointPct != null ? `${p.anytimePointPct}%` : "—"}</td>
            <td>{p.modelProbs ? pct(p.modelProbs.sog3) : "—"}</td>
            <td>{f1(p.ShotsOnGoalPerGame)}</td>
            <td>{f1(p.sog60)}</td>
            <td><PickButton player={p} /></td>
          </tr>
        ))}
        {!rows.length && <tr><td colSpan={7} style={muted}>No skaters in tonight's pool.</td></tr>}
      </tbody>
    </table>
  );
}

function GameCard({ g, open, onToggle, players, goaliesById, meta }) {
  const { proj } = g;
  const fav = proj.winHome >= proj.winAway ? g.home : g.away;
  const favP = Math.max(proj.winHome, proj.winAway);
  const top = proj.scores[0];
  const state = g.state && g.state !== "FUT" && g.state !== "PRE" ? g.state : null;
  const goalieLine = (side) => {
    const id = g[`${side}GoalieId`];
    const team = g[side];
    const opp = side === "away" ? g.home : g.away;
    const stats = goaliesById.get(id);
    const cp = projectGoalie(stats, team, opp, meta);
    const gs = proj.gsax[side];
    return { id, team, name: g[`${side}Goalie`] || "TBD", status: g[`${side}GoalieStatus`], stats, cp, gs };
  };
  const gl = { away: goalieLine("away"), home: goalieLine("home") };
  // SOG for a team = shots its opponent's goalie is projected to face (Crease Lab).
  const sog = { away: gl.home.cp.shots, home: gl.away.cp.shots };
  const xg = { away: proj.xgAway, home: proj.xgHome };
  const win = { away: proj.winAway, home: proj.winHome };
  const reg = { away: proj.regAway, home: proj.regHome };
  const pl = proj.puckLine;

  return (
    <div className="card" style={{ padding: 12, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div className="mono" style={{ fontSize: 10, ...muted }}>
          {timeEt(g.startTimeUTC)}{state ? ` · ${state === "OFF" || state === "FINAL" ? "FINAL" : "LIVE"}` : ""}
        </div>
        <div className="mono" style={{ fontSize: 10, ...muted }}>OT chance {pct(proj.ot)} · total {f1(proj.expTotal)}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 8, marginTop: 6 }}>
        {["away", "home"].map((side, i) => (
          <div key={side} style={{ textAlign: i ? "right" : "left", order: i ? 3 : 1 }}>
            <div style={{ ...big, fontSize: 22 }}>{g[side]}</div>
            <div className="mono" style={{ fontSize: 10, ...muted }}>{rec(g.ratings[side]?.record)} · {side === "home" ? "home" : "away"}</div>
            <div style={{ ...big, fontSize: 26, color: win[side] >= 0.5 ? "var(--accent2)" : "var(--text)" }}>{pct(win[side])}</div>
            <div className="mono" style={{ fontSize: 9, ...muted }}>fair {fairOdds(win[side])}</div>
          </div>
        ))}
        <div style={{ order: 2, textAlign: "center" }}>
          <div className="mono" style={{ fontSize: 9, ...muted }}>MOST LIKELY</div>
          <div style={{ ...big, fontSize: 20 }}>{top.away}-{top.home}</div>
          <div className="mono" style={{ fontSize: 9, ...muted }}>{pct(top.p, 1)} · proj {f1(xg.away)}-{f1(xg.home)}</div>
        </div>
      </div>
      <WinBar away={g.away} home={g.home} pAway={proj.winAway} />
      <div className="mono" style={{ fontSize: 10, ...muted, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
        <span>{fav} favored · {pct(favP)}</span>
        <span>Goalies: {gl.away.name} vs {gl.home.name}</span>
      </div>
      <button className="btn" style={{ marginTop: 8 }} onClick={onToggle}>{open ? "▲ Hide projected box score" : "▼ Projected box score"}</button>

      {open && (
        <div style={{ marginTop: 10, display: "grid", gap: 12 }}>
          <div className="table-wrap">
            <table className="data-table" style={{ fontSize: 11 }}>
              <thead><tr><th>Team</th><th title="Expected regulation goals (incl. empty net) + OT">Proj goals</th><th>Proj SOG</th><th>Win</th><th>Reg win</th><th title="Win in OT / shootout">OT/SO win</th><th title="Win by 2+ goals">-1.5</th><th>Fair ML</th></tr></thead>
              <tbody>
                {["away", "home"].map((side) => (
                  <tr key={side}>
                    <td style={{ fontWeight: 700 }}>{g[side]}</td>
                    <td>{f2(xg[side])}</td>
                    <td>{f1(sog[side])}</td>
                    <td style={{ fontWeight: 700 }}>{pct(win[side], 1)}</td>
                    <td>{pct(reg[side], 1)}</td>
                    <td>{pct(proj.ot * (side === "home" ? proj.otWinHome : 1 - proj.otWinHome), 1)}</td>
                    <td>{pct(pl[side], 1)}</td>
                    <td>{fairOdds(win[side])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="table-wrap">
            <table className="data-table" style={{ fontSize: 11 }}>
              <thead><tr><th>Goalie</th><th>Status</th><th>Proj saves</th><th>Shots against</th><th>Proj GA</th><th>Proj SV%</th><th title="Goals saved above expected per 100 shots since 2022-23 (feeds the model)">GSAx/100</th></tr></thead>
              <tbody>
                {["away", "home"].map((side) => {
                  const x = gl[side];
                  return (
                    <tr key={side}>
                      <td className="clickable" onClick={() => x.id && openGoalieSlide(x.stats || { playerId: x.id, name: x.name, team: x.team })}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <PlayerAvatar playerId={x.id} name={x.name} team={x.team} size={22} />
                          <span className="player-name-link">{x.name}</span> <span className="mono" style={{ fontSize: 9, ...muted }}>{x.team}</span>
                        </div>
                      </td>
                      <td>{x.status || "projected"}</td>
                      <td style={{ fontWeight: 700 }}>{x.cp.saves}</td>
                      <td>{x.cp.shots}</td>
                      <td>{x.cp.goalsAllowed}</td>
                      <td>{sv(x.cp.savePct)}</td>
                      <td>{x.gs ? `${(x.gs.gsax * 100).toFixed(2)} (${x.gs.shots} sh)` : "no NHL history"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div>
            <div className="mono" style={{ fontSize: 10, ...muted, marginBottom: 4 }}>MOST LIKELY FINAL SCORES ({g.away}-{g.home})</div>
            <div className="pill-row" style={{ flexWrap: "wrap" }}>
              {proj.scores.slice(0, 8).map((s) => (
                <span key={`${s.away}-${s.home}`} className="pill-btn" style={{ cursor: "default" }}>{s.away}-{s.home} · {pct(s.p, 1)}</span>
              ))}
            </div>
            <div className="mono" style={{ fontSize: 10, ...muted, marginTop: 6 }}>
              Total goals (OT winner counts 1): over 4.5 {pct(proj.overs[4.5])} · over 5.5 {pct(proj.overs[5.5])} · over 6.5 {pct(proj.overs[6.5])}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>
            <div className="table-wrap"><SkaterLines players={players} team={g.away} /></div>
            <div className="table-wrap"><SkaterLines players={players} team={g.home} /></div>
          </div>
        </div>
      )}
    </div>
  );
}

function ModelView({ ratings, slateTeams }) {
  const meta = ratings._meta;
  const m = meta.model;
  const bt = meta.backtest;
  const rows = useMemo(() => Object.entries(ratings.teams).map(([team, t]) => {
    // vs a league-average team on neutral ice: expected goals for and against
    const avg = { gf: meta.league.goalsPerTeamGame, ga: meta.league.goalsPerTeamGame, xgf: meta.league.xgPerTeamGame, xga: meta.league.xgPerTeamGame };
    const r = { ...ratings, teams: { ...ratings.teams, AVG: avg } };
    const forG = (expectedGoals(r, team, "AVG", true, null) + expectedGoals(r, team, "AVG", false, null)) / 2;
    const agG = (expectedGoals(r, "AVG", team, true, null) + expectedGoals(r, "AVG", team, false, null)) / 2;
    return { team, ...t, recStr: rec(t.record), pts: t.record.w * 2 + t.record.otl, forG, agG, net: forG - agG, tonight: slateTeams.has(team) };
  }), [ratings, meta, slateTeams]);
  const { sorted, sortKey, sortDir, toggleSort } = useSort(rows, "net", "desc");
  const th = (k, label, title) => (
    <th key={k} title={title} className={sortKey === k ? "sorted" : ""} onClick={() => toggleSort(k)}>{label}{sortKey === k ? (sortDir === "desc" ? " ↓" : " ↑") : ""}</th>
  );
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="card" style={{ padding: 12 }}>
        <div style={{ ...big, fontSize: 16, marginBottom: 6 }}>How the model works</div>
        <div style={{ fontSize: 12, lineHeight: 1.6 }}>
          <div>1. <b>Team ratings.</b> Every team's goals for / against and expected goals (xG) for / against per game, from every game since 2022-23, weighted toward recent games (a game 20 games ago counts half). Each new season starts with last season at 30% weight. 15 games of league average are mixed in so a hot week doesn't swing things.</div>
          <div>2. <b>Starting goalie.</b> Goals saved above expected per shot since 2022-23 (with 600 shots of "average" mixed in), for tonight's expected or confirmed starter.</div>
          <div>3. <b>Expected goals tonight</b> for each side = own offense (goals {m.gf}, xG {m.xgf}) × opponent defense (goals allowed {m.oga}, xG allowed {m.oxga}) × home ice (+{((Math.exp(m.home) - 1) * 100).toFixed(1)}%) × opposing goalie (each +1 goal saved per 100 shots ≈ −{((1 - Math.exp(m.ogsax * 0.01)) * 100).toFixed(1)}%). Weights are exponents on each rate, fitted on {bt.games.toLocaleString()} games.</div>
          <div>4. <b>Score grid.</b> Each side's regulation goals follow a Poisson distribution. Ties are bumped up ×{m.tieMult} to match how often NHL games really go to OT ({pct(bt.regTieRate)}); the OT / shootout winner follows each team's share of expected goals. Win %, likely scores, totals and -1.5 all come from that grid.</div>
          <div>5. <b>Box score.</b> Shots and saves come from Crease Lab; skater goal / point / 3+ SOG chances from the grade model (same numbers as Scouting).</div>
        </div>
        <div className="mono" style={{ fontSize: 10, ...muted, marginTop: 8 }}>
          Ratings through {meta.gamesThrough.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")} ({meta.games.toLocaleString()} games) · built {meta.generated}
        </div>
      </div>

      <div className="card" style={{ padding: 12 }}>
        <div style={{ ...big, fontSize: 16, marginBottom: 6 }}>Backtest</div>
        <div className="mono" style={{ fontSize: 11, marginBottom: 8 }}>
          {bt.seasons}. Picked the winner {pct(bt.accuracy, 1)} (always picking the home team: {pct(bt.homeOnlyAccuracy, 1)}). Log loss {bt.logLoss} (home team only {bt.homeOnlyLogLoss}; lower is better).
          Inputs tried: {bt.inputsTested}.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
          <table className="data-table" style={{ fontSize: 11 }}>
            <thead><tr><th>Home win chance said</th><th>Games</th><th>Avg said</th><th>Happened</th></tr></thead>
            <tbody>{bt.calibration.map((c) => <tr key={c.bucket}><td>{c.bucket}</td><td>{c.n}</td><td>{pct(c.said, 1)}</td><td style={{ fontWeight: 700 }}>{pct(c.act, 1)}</td></tr>)}</tbody>
          </table>
          <table className="data-table" style={{ fontSize: 11 }}>
            <thead><tr><th>Regulation goals</th><th>Said</th><th>Happened</th></tr></thead>
            <tbody>{bt.totals.map((c) => <tr key={c.line}><td>Over {c.line}</td><td>{pct(c.said, 1)}</td><td style={{ fontWeight: 700 }}>{pct(c.act, 1)}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="note" style={{ marginTop: 8 }}>
          Honest read: NHL games are close to coin flips — even betting markets pick the winner only about 60% of the time. The model is
          well calibrated from 35% to 65%; its rare big favorites (65%+) won more often than it said (78% vs 68%), so it's a little too cautious there.
          Early in a season the ratings lean on last season.
        </div>
      </div>

      <div className="card" style={{ padding: 12 }}>
        <div style={{ ...big, fontSize: 16, marginBottom: 6 }}>Team ratings</div>
        <div className="mono" style={{ fontSize: 10, ...muted, marginBottom: 6 }}>
          Per-game rates the model uses (recent games weighted more). "vs avg" = expected goals for / against against a league-average team; ★ = playing tonight.
        </div>
        <div className="table-wrap">
          <table className="data-table" style={{ fontSize: 11 }}>
            <thead><tr>
              {th("team", "Team")}{th("pts", "Record", "This season W-L-OTL")}
              {th("gf", "GF/gm")}{th("ga", "GA/gm")}{th("xgf", "xGF/gm")}{th("xga", "xGA/gm")}
              {th("forG", "Goals for vs avg")}{th("agG", "Goals against vs avg")}{th("net", "Net")}
            </tr></thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.team}>
                  <td style={{ fontWeight: 700 }}>{r.tonight ? "★ " : ""}{r.team}</td>
                  <td>{r.recStr}</td>
                  <td>{f2(r.gf)}</td><td>{f2(r.ga)}</td><td>{f2(r.xgf)}</td><td>{f2(r.xga)}</td>
                  <td>{f2(r.forG)}</td><td>{f2(r.agG)}</td>
                  <td style={{ fontWeight: 700 }}>{r.net >= 0.005 ? "+" : ""}{f2(Math.abs(r.net) < 0.005 ? 0 : r.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function ProjectionsTab() {
  const pool = useScoredPool({ includeStarted: true });
  const ratings = useTeamRatings();
  const selected = useMatchup();
  const [view, setView] = useState("games");
  const [open, setOpen] = useState(() => new Set());

  const games = useMemo(() => {
    if (!pool || !ratings) return [];
    return (pool.meta.slate || []).map((g) => ({
      ...g,
      matchup: matchupKey(g.away, g.home),
      ratings: { away: ratings.teams[g.away], home: ratings.teams[g.home] },
      proj: projectGame(ratings, g),
    }));
  }, [pool, ratings]);
  const goaliesById = useMemo(() => new Map((pool?.goalies || []).map((g) => [g.playerId, g])), [pool]);
  const slateTeams = useMemo(() => new Set(games.flatMap((g) => [g.away, g.home])), [games]);

  if (!pool || !ratings) {
    return <div className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>{pool && ratings === null ? "Loading team ratings…" : "Loading…"}</div>;
  }
  const shown = games.filter((g) => !selected || g.matchup === selected);
  const toggle = (k) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <div>
      <div className="section-header">
        <div className="section-title">🔮 Projections</div>
        <div className="section-sub">Who wins, the likely score and a projected box score for every game on the {pool.meta.slateDate} slate</div>
      </div>
      <div className="pill-row" style={{ display: "inline-flex", marginBottom: 12 }}>
        <button className={`pill-btn ${view === "games" ? "active" : ""}`} onClick={() => setView("games")}>🏒 Tonight's games</button>
        <button className={`pill-btn ${view === "model" ? "active" : ""}`} onClick={() => setView("model")}>🧠 The model</button>
      </div>

      {view === "model" ? <ModelView ratings={ratings} slateTeams={slateTeams} /> : <>
        <div className="note">
          ℹ️ Win % and scores come from team goal / expected-goal rates since 2022-23 (recent games weighted more), home ice and tonight's
          starting goalies (updated as starters are confirmed). Backtested: picked the winner {pct(ratings._meta.backtest.accuracy, 1)} of
          games vs {pct(ratings._meta.backtest.homeOnlyAccuracy, 1)} for "always the home team". Fair odds have no vig. Open "🧠 The model" for the details.
        </div>
        <MatchupFilter />
        {shown.length > 1 && (
          <div className="top-reads">
            {[...shown].sort((a, b) => Math.max(b.proj.winHome, b.proj.winAway) - Math.max(a.proj.winHome, a.proj.winAway)).slice(0, 3).map((g) => {
              const homeFav = g.proj.winHome >= g.proj.winAway;
              return (
                <div key={g.gameId} className="read-card" onClick={() => toggle(g.gameId)}>
                  <div className="mono" style={{ fontSize: 9, ...muted }}>FAVORITE · {g.away} @ {g.home}</div>
                  <div style={{ ...big, fontSize: 22 }}>{homeFav ? g.home : g.away} {pct(homeFav ? g.proj.winHome : g.proj.winAway)}</div>
                  <div className="mono" style={{ fontSize: 9, ...muted }}>likely {g.proj.scores[0].away}-{g.proj.scores[0].home} · fair {fairOdds(Math.max(g.proj.winHome, g.proj.winAway))}</div>
                </div>
              );
            })}
          </div>
        )}
        {shown.map((g) => (
          <GameCard key={g.gameId} g={g} open={open.has(g.gameId)} onToggle={() => toggle(g.gameId)}
            players={pool.players} goaliesById={goaliesById} meta={pool.meta} />
        ))}
        {!shown.length && <div className="mono" style={{ ...muted, fontSize: 12 }}>No games on this slate.</div>}
      </>}
    </div>
  );
}
