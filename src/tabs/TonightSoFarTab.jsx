import { useEffect, useMemo, useState } from "react";
import { useScoredPool } from "../lib/data.js";
import { easternToday, LIVE_POLL_MS } from "../lib/liveGoals.js";
import { useMatchup, inScope } from "../lib/matchupFilter.js";
import { openSkaterSlide } from "../slideouts.js";
import PlayerAvatar from "../components/PlayerAvatar.jsx";
import { TIER_INFO } from "../lib/top3.js";
import LiveThemesTab from "./LiveThemesTab.jsx";

// 📡 Tonight so far (2026-10-25, user: the old "themes" idea -- the slate's common theme), with ⚡ Goal Flurries kept as the
// second view. Context only: goals / points / shots on goal so far vs what our pre-game chances expected, surprise scorers, top
// chances still looking for a goal, how tonight's Top 3 and PRISM Picks stand. Projections are NOT adjusted: the 10/25 backtest
// (2022-26 held out, 26,774 late skater-games) found early games don't predict later ones (goal / SOG nothing; point / assist
// helped 2 of 4 seasons, hurt 2). "Expected so far" = his pre-game expected count x the share of the game played.
const DONE = new Set(["FINAL", "OFF"]);
const STARTED = new Set(["LIVE", "CRIT", "FINAL", "OFF"]);
const mean = (pct) => (pct == null ? 0 : -Math.log(1 - Math.min(0.97, pct / 100))); // P(1+) -> expected count
const signed = (x) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}`;
const share = (a, e) => (e > 0 ? `${a >= e ? "+" : ""}${Math.round((a / e - 1) * 100)}%` : "—");

function played(g) {
  if (!g || !STARTED.has(g.state)) return 0;
  if (DONE.has(g.state) || (g.period || 0) > 3) return 1;
  if (g.clock?.inIntermission) return Math.min(1, (g.period || 1) / 3);
  const [m, s] = String(g.clock?.timeRemaining || "20:00").split(":").map(Number);
  return Math.min(1, Math.max(0, ((g.period - 1) * 20 + (20 - (m + (s || 0) / 60))) / 60));
}

function useLive(date) {
  const [d, setD] = useState(null);
  useEffect(() => {
    let alive = true, timer = null;
    const load = async () => {
      const body = await fetch(`/api/live?date=${date}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (!alive) return;
      if (body) setD(body);
      timer = setTimeout(load, body?.games?.some((g) => STARTED.has(g.state) && !DONE.has(g.state)) ? LIVE_POLL_MS : 3 * 60_000);
    };
    load();
    return () => { alive = false; clearTimeout(timer); };
  }, [date]);
  return d;
}

function useJson(url) {
  const [d, setD] = useState(null);
  useEffect(() => { let alive = true; fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((x) => alive && setD(x)); return () => { alive = false; }; }, [url]);
  return d;
}

function Row({ p, right, sub, color }) {
  return (
    <div className="mono clickable" onClick={() => openSkaterSlide(p)}
      style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--line)", fontSize: 12, cursor: "pointer" }}>
      <PlayerAvatar playerId={p.playerId} name={p.name} team={p.team} size={22} />
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        <span className="player-name-link">{p.name}</span> <span style={{ color: "var(--muted)" }}>{p.team}</span>
        {sub && <span style={{ display: "block", color: "var(--muted)", fontSize: 11 }}>{sub}</span>}
      </span>
      <b style={{ whiteSpace: "nowrap", color }}>{right}</b>
    </div>
  );
}

function SoFar() {
  const date = easternToday();
  const pool = useScoredPool({ includeStarted: true });
  const live = useLive(date);
  const top3 = useJson(`/data/top3/${date}.json`);
  const pp = useJson("/data/prism_picks.json");
  const selected = useMatchup();
  const games = (live?.games || []).filter((g) => !selected || inScope(`${g.away.abbrev}@${g.home.abbrev}`, selected));
  const gameOfTeam = new Map(games.flatMap((g) => [[g.home.abbrev, g], [g.away.abbrev, g]]));
  const lines = new Map((live?.skaters || []).map((s) => [s.playerId, s]));

  const rows = useMemo(() => (pool?.players || []).flatMap((p) => {
    const g = gameOfTeam.get(p.team);
    const f = played(g);
    if (!f) return [];
    // the pool carries ~22 skaters a team (18 dress) and a started game drops its scratch info: past the 1st period count only
    // skaters seen in that game's play-by-play (a shot attempt or a point); before that, everyone not marked scratched / out
    const seen = lines.get(p.playerId);
    if (!seen && (f >= 1 / 3 || p.lineupStatus === "scratched" || p.lineupStatus === "out")) return [];
    const l = seen || { goals: 0, assists: 0, sog: 0 };
    return [{ p, g, f, l, eG: mean(p.anytimeGoalPct) * f, eP: mean(p.anytimePointPct) * f, eS: (p.sogPg ?? p.ShotsOnGoalPerGame ?? 0) * f }];
  }), [pool, live, selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const n = { done: games.filter((g) => DONE.has(g.state)).length, live: games.filter((g) => STARTED.has(g.state) && !DONE.has(g.state)).length };
  n.pre = games.length - n.done - n.live;
  const tot = (k) => rows.reduce((s, r) => s + (r.l[k] || 0), 0);
  const totE = (k) => rows.reduce((s, r) => s + r[k], 0);
  const tiles = [["Goals", tot("goals"), totE("eG")], ["Points", tot("goals") + tot("assists"), totE("eP")], ["Shots on goal", tot("sog"), totE("eS")]];
  const scorers = rows.filter((r) => r.l.goals > 0).sort((a, b) => (a.p.anytimeGoalPct ?? 0) - (b.p.anytimeGoalPct ?? 0));
  const surprise = scorers.filter((r) => (r.p.anytimeGoalPct ?? 0) < 15);
  const top20 = [...(pool?.players || [])].filter((p) => gameOfTeam.has(p.team)).sort((a, b) => (b.anytimeGoalPct ?? 0) - (a.anytimeGoalPct ?? 0)).slice(0, 20);
  const top20Played = top20.filter((p) => played(gameOfTeam.get(p.team)) > 0);
  const top20Scored = top20Played.filter((p) => (lines.get(p.playerId)?.goals || 0) > 0);
  const searching = rows.filter((r) => r.l.goals === 0 && !DONE.has(r.g.state)).sort((a, b) => (b.p.anytimeGoalPct ?? 0) - (a.p.anytimeGoalPct ?? 0)).slice(0, 8);
  const shooters = rows.filter((r) => r.f >= 0.25).map((r) => ({ ...r, d: r.l.sog - r.eS })).sort((a, b) => b.d - a.d).slice(0, 8);

  const byId = new Map((pool?.players || []).map((p) => [p.playerId, p]));
  const status = (pick, value, line) => {
    const g = gameOfTeam.get(pick.team);
    if (value >= line) return ["✅", "var(--good, #3fcf7a)"];
    if (g && DONE.has(g.state)) return ["❌", "var(--red, #e5584b)"];
    return [g && STARTED.has(g.state) ? "⏳" : "🕒", "var(--muted)"];
  };
  const valueOf = (id, stat) => { const l = lines.get(id) || { goals: 0, assists: 0, sog: 0 }; return stat === "G" ? l.goals : stat === "SOG" ? l.sog : l.goals + l.assists; };
  const tonight = pp?.tonight?.date === date ? pp.tonight : null;
  const prism = tonight ? [["💎", tonight.picks || []], ["⚖️", tonight.tiers?.mid || []], ["🌠", tonight.tiers?.long || []]].flatMap(([e, l]) => l.map((x) => ({ ...x, e }))) : [];
  const card = { padding: 12 };
  const h = { fontFamily: "inherit", fontWeight: 700, fontSize: 14, marginBottom: 6 };

  return (
    <div>
      <div className="note">
        {n.done} final · {n.live} live · {n.pre} still to start{selected ? " (selected games only)" : ""}. Refreshes every {LIVE_POLL_MS / 1000}s while games are on.
        {" "}We tested reacting to this (10/25, four seasons held out): early games don't tell us how the later ones go, so it's shown, not used.
      </div>
      {!live && <div className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>Loading tonight's games…</div>}
      {live && rows.length === 0 && <div className="note">Nothing has started yet.</div>}

      {rows.length > 0 && (
        <>
          <div className="grid-cards" style={{ marginBottom: 10 }}>
            {tiles.map(([label, a, e]) => (
              <div key={label} className="card" style={card}>
                <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: a >= e ? "var(--good, #3fcf7a)" : "var(--red, #e5584b)" }}>{share(a, e)}</div>
                <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{a} so far vs {e.toFixed(1)} expected</div>
              </div>
            ))}
          </div>
          <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginBottom: 12 }}>
            Our top 20 goal chances: {top20Scored.length} of {top20Played.length} who have played have scored · {surprise.length} goal{surprise.length === 1 ? "" : "s"} from players we gave under 15%.
          </div>

          <div className="grid-cards" style={{ marginBottom: 12 }}>
            <div className="card" style={card}>
              <div style={h}>🚨 Scored tonight <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>lowest chance first</span></div>
              {scorers.slice(0, 12).map((r) => <Row key={r.p.playerId} p={r.p} sub={`${r.l.goals} G · ${r.l.assists} A · ${r.l.sog} SOG`} right={`${(r.p.anytimeGoalPct ?? 0).toFixed(0)}% to score`} color={(r.p.anytimeGoalPct ?? 0) < 15 ? "var(--accent2, var(--accent))" : undefined} />)}
              {!scorers.length && <div className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>No goals yet.</div>}
            </div>
            <div className="card" style={card}>
              <div style={h}>🔎 Top chances still looking <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>games still on</span></div>
              {searching.map((r) => <Row key={r.p.playerId} p={r.p} sub={`${r.l.sog} SOG · ${r.l.assists} A · ${Math.round(r.f * 100)}% of the game played`} right={`${(r.p.anytimeGoalPct ?? 0).toFixed(0)}%`} />)}
              {!searching.length && <div className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>No games on right now.</div>}
            </div>
            <div className="card" style={card}>
              <div style={h}>🏒 Shooting more than usual <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>SOG vs expected so far</span></div>
              {shooters.map((r) => <Row key={r.p.playerId} p={r.p} sub={`${r.l.sog} SOG vs ${r.eS.toFixed(1)} expected`} right={signed(r.d)} color="var(--good, #3fcf7a)" />)}
            </div>
          </div>
        </>
      )}

      {((top3?.picks || []).length > 0 || prism.length > 0) && (
        <div className="grid-cards">
          {(top3?.picks || []).length > 0 && (
            <div className="card" style={card}>
              <div style={h}>🎯 Top 3 Tonight <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>locked · anytime goal</span></div>
              {top3.picks.filter((t) => t.playerId).map((t) => {
                const v = valueOf(t.playerId, "G");
                const [icon, color] = status(t, v, 1);
                return <Row key={t.tier} p={byId.get(t.playerId) || t} sub={`${TIER_INFO[t.tier]?.label || t.tier} · ${v} G so far`} right={icon} color={color} />;
              })}
            </div>
          )}
          {prism.length > 0 && (
            <div className="card" style={card}>
              <div style={h}>💎 PRISM Picks <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>💎 safe · ⚖️ mid · 🌠 long</span></div>
              {prism.map((x) => {
                const v = valueOf(x.playerId, x.stat);
                const [icon, color] = status(x, v, Number(x.line));
                return <Row key={`${x.e}${x.playerId}${x.stat}`} p={byId.get(x.playerId) || x} sub={`${x.e} ${x.label} · ${v} so far`} right={icon} color={color} />;
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TonightSoFarTab() {
  const [view, setView] = useState("sofar");
  return (
    <div>
      <div className="section-header">
        <div className="section-title">📡 Tonight so far</div>
        <div className="section-sub">How tonight's games are running against our pre-game chances — context only, projections stay as they are</div>
      </div>
      <div className="pill-row" style={{ marginBottom: 10 }}>
        {[["sofar", "📡 Tonight so far"], ["flurries", "⚡ Goal Flurries"]].map(([k, l]) => (
          <button key={k} className={`pill-btn ${view === k ? "active" : ""}`} onClick={() => setView(k)}>{l}</button>
        ))}
      </div>
      {view === "sofar" ? <SoFar /> : <LiveThemesTab />}
    </div>
  );
}
