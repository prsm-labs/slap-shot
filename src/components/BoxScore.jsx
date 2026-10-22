import { useEffect, useRef, useState } from "react";
import { openSkaterSlide, openGoalieSlide } from "../slideouts.js";
import { batchFromBox, estimateOnIce, sameBatch } from "../lib/onIce.js";
import RinkTracker from "./RinkTracker.jsx";
import LineupsView from "./LineupsView.jsx";
import LiveProjection from "./LiveProjection.jsx";

// Full box score for one game, from /api/boxscore (api/boxscore.js). Refreshes every 15s while
// the game is live (the endpoint is cached 15s at the edge). Skater rows are tinted tan when the
// player is estimated to be on the ice (lib/onIce.js) and dark red when the Live tab's heat scale
// has them Heating Up or On Fire.
const POLL_MS = 15_000;
const HOT = new Set(["Heating Up", "On Fire"]);
const ON_ICE = "#d9b46a";
const rowStyle = (onIce, hot) => ({
  background: hot ? "rgba(150,24,24,.42)" : onIce ? "rgba(217,180,106,.20)" : undefined,
  boxShadow: onIce ? `inset 3px 0 0 ${ON_ICE}` : undefined,
  // the pinned first column (App.css) is opaque, so it repaints the row tint / on-ice bar from these
  "--row-bg": hot ? "rgba(150,24,24,.42)" : onIce ? "rgba(217,180,106,.20)" : undefined,
  "--row-bar": onIce ? ON_ICE : undefined,
});
const LIVE = new Set(["LIVE", "CRIT"]);

const cell = { padding: "5px 8px", textAlign: "right" };
const left = { ...cell, textAlign: "left" };

function Linescore({ box }) {
  const cols = box.periods.length ? box.periods : [{ period: "1", away: 0, home: 0 }];
  return (
    <table className="data-table" style={{ width: "auto", minWidth: 320 }}>
      <thead>
        <tr>
          <th style={left}>Team</th>
          {cols.map((p) => <th key={p.period} style={cell}>{p.period}</th>)}
          <th style={cell}>T</th>
          <th style={cell}>SOG</th>
        </tr>
      </thead>
      <tbody>
        {["away", "home"].map((side) => (
          <tr key={side}>
            <td style={{ ...left, fontWeight: 700 }}>{box[side].abbrev}</td>
            {cols.map((p) => <td key={p.period} style={cell}>{p[side]}</td>)}
            <td style={{ ...cell, fontWeight: 700 }}>{box[side].score ?? "—"}</td>
            <td style={cell}>{box[side].sog ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SkaterTable({ t, poolById, onIce, heatById, live }) {
  const rows = [...t.skaters].sort((a, b) => b.points - a.points || b.goals - a.goals || b.sog - a.sog);
  return (
    <div className="table-wrap" style={{ marginTop: 6 }}>
      <table className="data-table">
        <thead>
          <tr>
            <th style={left}>{t.abbrev} skaters</th>
            {["G", "A", "P", "+/-", "SOG", "HIT", "BLK", "PIM", "TOI"].map((h) => <th key={h} style={cell}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const on = onIce?.has(p.playerId);
            const heat = heatById?.get(p.playerId);
            return (
            <tr key={p.playerId} style={rowStyle(on, HOT.has(heat))}>
              <td
                className="clickable"
                style={left}
                onClick={() => openSkaterSlide(poolById?.get(p.playerId) || { playerId: p.playerId, name: p.name, team: t.abbrev })}
              >
                {on && <span title="On the ice now (estimated)" style={{ color: ON_ICE }}>● </span>}
                <span className="mono" style={{ color: "var(--muted)", fontSize: 10 }}>#{p.number} {p.position} </span>
                <span className="player-name-link">{p.name}</span>
                {p.goals >= 3 && <span className="mono" style={{ fontSize: 9, marginLeft: 6, fontWeight: 800 }}>🎩 HAT TRICK</span>}
                {p.goals === 2 && live && <span className="mono" style={{ fontSize: 9, marginLeft: 6, fontWeight: 800, color: "#ffb020" }}>👀 HAT WATCH</span>}
                {HOT.has(heat) && <span className="mono" style={{ fontSize: 9, marginLeft: 6, color: "#ff8a7a" }}>{heat === "On Fire" ? "🔥 ON FIRE" : "HEATING UP"}</span>}
              </td>
              <td style={cell}>{p.goals}</td>
              <td style={cell}>{p.assists}</td>
              <td style={{ ...cell, fontWeight: p.points ? 700 : 400 }}>{p.points}</td>
              <td style={cell}>{p.plusMinus > 0 ? `+${p.plusMinus}` : p.plusMinus}</td>
              <td style={cell}>{p.sog}</td>
              <td style={cell}>{p.hits}</td>
              <td style={cell}>{p.blocks}</td>
              <td style={cell}>{p.pim}</td>
              <td style={cell} className="mono">{p.toi}</td>
            </tr>
            );
          })}
          <tr className="box-total-row">
            <td style={{ ...left, fontWeight: 700 }}>{t.abbrev} total</td>
            {["goals", "assists", "points"].map((k) => <td key={k} style={{ ...cell, fontWeight: 700 }}>{t.skaters.reduce((s, p) => s + (p[k] || 0), 0)}</td>)}
            <td style={cell} />
            {["sog", "hits", "blocks", "pim"].map((k) => <td key={k} style={{ ...cell, fontWeight: 700 }}>{t.skaters.reduce((s, p) => s + (p[k] || 0), 0)}</td>)}
            <td style={cell} />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// 2026-10-20 (user): team-vs-team comparison from the NHL right rail, a bar for who leads each line
const CMP = [
  ["sog", "Shots on goal"], ["faceoffWins", "Faceoffs won", "", false, "faceoffWinningPctg"], ["powerPlay", "Power play", "", false, "powerPlayPctg"],
  ["pim", "Penalty minutes", "", true], ["hits", "Hits"], ["blockedShots", "Blocked shots"], ["giveaways", "Giveaways", "", true], ["takeaways", "Takeaways"],
];
function TeamCompare({ box }) {
  const st = new Map((box.teamStats || []).map((s) => [s.key, s]));
  if (!st.size) return <div className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>Team totals aren't posted yet.</div>;
  const num = (v) => (typeof v === "string" && v.includes("/") ? Number(v.split("/")[0]) : Number(v) || 0);
  const pctOf = (k, side) => (st.get(k) ? `${Math.round(Number(st.get(k)[side]) * 100)}%` : null);
  return (
    <div className="cmp-card">
      <div className="cmp-head mono"><b>{box.away.abbrev}</b> {box.away.score ?? ""}<span style={{ color: "var(--muted)", fontSize: 10 }}>{box.state === "OFF" || box.state === "FINAL" ? "Final" : box.period ? `P${box.period}` : ""}</span>{box.home.score ?? ""} <b>{box.home.abbrev}</b></div>
      {CMP.map(([k, label, , lowerBetter, pctKey]) => {
        const s = st.get(k);
        if (!s) return null;
        const a = num(s.away), h = num(s.home), tot = a + h || 1;
        const lead = a === h ? 0 : (a > h) !== !!lowerBetter ? -1 : 1;
        return (
          <div key={k} className="cmp-row">
            <span className={`cmp-val mono ${lead < 0 ? "lead" : ""}`}>{s.away}{pctKey && pctOf(pctKey, "away") ? <span className="cmp-sub"> {pctOf(pctKey, "away")}</span> : null}</span>
            <div><div className="cmp-label mono">{label}{lowerBetter ? " (fewer is better)" : ""}</div>
              <div className="cmp-bar"><span style={{ width: `${(a / tot) * 100}%` }} className={lead < 0 ? "lead" : ""} /><span style={{ width: `${(h / tot) * 100}%` }} className={lead > 0 ? "lead" : ""} /></div></div>
            <span className={`cmp-val mono r ${lead > 0 ? "lead" : ""}`}>{pctKey && pctOf(pctKey, "home") ? <span className="cmp-sub">{pctOf(pctKey, "home")} </span> : null}{s.home}</span>
          </div>
        );
      })}
    </div>
  );
}

// 2026-10-20 (user): play-by-play (NHL feed, /api/boxscore?plays=1), filter by period, goals / shots / penalties, team
const KINDS = [["all", "Every play"], ["goal", "Goals"], ["shots", "Shots"], ["penalty", "Penalties"]];
const SHOT_KINDS = new Set(["goal", "shot-on-goal", "missed-shot", "blocked-shot"]);
function PlayByPlay({ box, live }) {
  const [per, setPer] = useState("all");
  const [kind, setKind] = useState("all");
  const [tm, setTm] = useState("all");
  const plays = box.plays || [];
  if (!plays.length) return <div className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>No plays yet.</div>;
  const periods = [...new Set(plays.map((p) => p.period).filter(Boolean))];
  const list = plays.filter((p) => (per === "all" || p.period === per) && (tm === "all" || p.team === tm)
    && (kind === "all" || (kind === "goal" ? p.goal : kind === "shots" ? SHOT_KINDS.has(p.kind) : p.kind === kind)));
  const shown = live ? [...list].reverse() : list;
  const pl = (opts, v, set) => opts.map(([k, l]) => <button key={k} className={`pill-btn ${v === k ? "active" : ""}`} onClick={() => set(k)}>{l}</button>);
  return (
    <div>
      <div className="pill-row" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
        {pl([["all", "All periods"], ...periods.map((p) => [p, /^\d$/.test(p) ? `P${p}` : p])], per, setPer)}
      </div>
      <div className="pill-row" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {pl(KINDS, kind, setKind)}{pl([["all", "Both teams"], [box.away.abbrev, box.away.abbrev], [box.home.abbrev, box.home.abbrev]], tm, setTm)}
      </div>
      <div className="pbp">
        {shown.length === 0 && <div className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>No plays match.</div>}
        {shown.map((p, i) => (
          <div key={p.id ?? i}>
            {(i === 0 || shown[i - 1].period !== p.period) && <div className="pbp-q mono">{/^\d$/.test(p.period) ? `Period ${p.period}` : p.period}</div>}
            <div className={`pbp-row mono ${p.goal ? "goal" : ""} ${p.kind === "penalty" ? "pen" : ""}`}>
              <span className="pbp-clock">{p.time}</span>
              <span className="pbp-team">{p.team || ""}</span>
              <span className="pbp-text">{p.text}</span>
              <span className="pbp-score">{p.goal ? <b>{p.score}</b> : p.score}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mono" style={{ color: "var(--muted)", fontSize: 10, marginTop: 6 }}>{live ? "Newest first, refreshes with the box score (15 s). " : ""}Score {box.away.abbrev}-{box.home.abbrev}. Source: NHL play-by-play.</div>
    </div>
  );
}

function GoalieTable({ t }) {
  if (!t.goalies.length) return null;
  return (
    <div className="table-wrap" style={{ marginTop: 6 }}>
      <table className="data-table">
        <thead>
          <tr>
            <th style={left}>{t.abbrev} goalies</th>
            {["SA", "SV", "GA", "SV%", "TOI"].map((h) => <th key={h} style={cell}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {t.goalies.map((g) => (
            <tr key={g.playerId}>
              <td className="clickable" style={left} onClick={() => openGoalieSlide({ playerId: g.playerId, name: g.name, team: t.abbrev })}>
                <span className="player-name-link">{g.name}</span>
              </td>
              <td style={cell}>{g.shotsAgainst}</td>
              <td style={cell}>{g.saves}</td>
              <td style={cell}>{g.goalsAgainst}</td>
              <td style={cell}>{g.savePct != null ? g.savePct.toFixed(3).replace(/^0/, "") : "—"}</td>
              <td style={cell} className="mono">{g.toi}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function BoxScore({ gameId, poolById, onClose, refreshKey = 0, heatById, date, startOn = "box" }) {
  const [box, setBox] = useState(null);
  const [error, setError] = useState(null);
  const shownGame = useRef(null);
  // The last two distinct batches of skater ice time, for the on-ice estimate.
  const batches = useRef({ prev: null, cur: null });
  const [onIce, setOnIce] = useState(null);
  const [view, setView] = useState(startOn); // "box" | "proj" (📈 Live projection) | "compare" | "pbp" | "tracker" (Game Tracker: rink + recent plays) | "lineups"
  // 2026-10-20: before puck drop only the lineups view has anything in it
  const pre = box && !LIVE.has(box.state) && !["OFF", "FINAL"].includes(box.state);
  const shown = pre ? "lineups" : view;

  useEffect(() => {
    let cancelled = false;
    let timer = null;
    async function load() {
      try {
        const res = await fetch(`/api/boxscore?gameId=${gameId}&plays=1`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || res.status);
        if (cancelled) return;
        setBox(body);
        setError(null);
        trackOnIce(body);
        if (LIVE.has(body.state)) timer = setTimeout(load, POLL_MS);
      } catch (e) {
        if (!cancelled) setError(String(e.message || e));
      }
    }
    function trackOnIce(body) {
      if (!LIVE.has(body.state) || body.clock?.inIntermission) {
        setOnIce(null);
        return;
      }
      const b = batchFromBox(body);
      const { cur } = batches.current;
      if (cur && sameBatch(cur, b)) return;
      batches.current = { prev: cur, cur: b };
      if (!cur) return;
      const skaters = body.situation ? { [body.away.abbrev]: body.situation.away, [body.home.abbrev]: body.situation.home } : {};
      setOnIce(estimateOnIce(cur, b, skaters));
    }
    // A different game starts blank; the Live tab's ⟳ Refresh (refreshKey) reloads in place.
    if (shownGame.current !== gameId) {
      shownGame.current = gameId;
      batches.current = { prev: null, cur: null };
      setOnIce(null);
      setBox(null);
    }
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [gameId, refreshKey]);

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div className="section-title" style={{ fontSize: 18 }}>
          {pre ? "👥 Lineups" : "📋 Box Score"}{box ? ` — ${box.away.abbrev} @ ${box.home.abbrev}` : ""}
        </div>
        <button className="btn" onClick={onClose}>✕ Close</button>
      </div>
      {error && <div className="note" style={{ borderColor: "var(--red)", color: "var(--red)" }}>Box score error: {error}</div>}
      {!box && !error && <div className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>Loading box score…</div>}
      {box && !pre && (
        <div className="pill-row" style={{ marginBottom: 10 }}>
          <button className={`pill-btn ${view === "box" ? "active" : ""}`} onClick={() => setView("box")}>📋 Box score</button>
          <button className={`pill-btn ${view === "proj" ? "active" : ""}`} onClick={() => setView("proj")}>📈 Live projection</button>
          <button className={`pill-btn ${view === "lineups" ? "active" : ""}`} onClick={() => setView("lineups")}>👥 Lineups</button>
          <button className={`pill-btn ${view === "compare" ? "active" : ""}`} onClick={() => setView("compare")}>⚖️ Team comparison</button>
          <button className={`pill-btn ${view === "pbp" ? "active" : ""}`} onClick={() => setView("pbp")}>📜 Play-by-play</button>
          <button className={`pill-btn ${view === "tracker" ? "active" : ""}`} onClick={() => setView("tracker")}>🏒 Game Tracker</button>
        </div>
      )}
      {box && shown === "lineups" && <LineupsView date={date} gameId={gameId} />}
      {box && shown === "proj" && <LiveProjection box={box} poolById={poolById} date={date} />}
      {box && shown === "tracker" && <RinkTracker box={box} />}
      {box && shown === "compare" && <TeamCompare box={box} />}
      {box && shown === "pbp" && <PlayByPlay box={box} live={LIVE.has(box.state)} />}
      {box && shown === "box" && (
        <>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
            <Linescore box={box} />
            {box.threeStars.length > 0 && (
              <div className="mono" style={{ fontSize: 11 }}>
                <div style={{ color: "var(--muted)", fontSize: 9, marginBottom: 4 }}>THREE STARS</div>
                {box.threeStars.map((s) => (
                  <div key={s.star}>{"★".repeat(s.star)} {s.name} ({s.team}) {s.goals}G {s.assists}A</div>
                ))}
              </div>
            )}
          </div>

          {box.scoring.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="mono" style={{ color: "var(--muted)", fontSize: 9, marginBottom: 4 }}>SCORING</div>
              {box.scoring.map((g, i) => (
                <div key={i} className="mono" style={{ fontSize: 11, padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                  <span style={{ color: "var(--muted)" }}>P{g.period} {g.time} </span>
                  <b>{g.team}</b> {g.scorer} ({g.goalsToDate})
                  {g.strength && g.strength !== "ev" ? <span style={{ color: "var(--accent2)" }}> {g.strength.toUpperCase()}</span> : null}
                  <span style={{ color: "var(--muted)" }}> {g.assists.length ? `from ${g.assists.join(", ")}` : "unassisted"} · {g.score}</span>
                </div>
              ))}
            </div>
          )}

          {LIVE.has(box.state) && (
            <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginTop: 12, display: "flex", gap: 14, flexWrap: "wrap" }}>
              <span><span style={{ color: ON_ICE }}>●</span> tan row = on the ice now {onIce ? "" : "(appears after the next box score update)"}</span>
              <span><span style={{ color: "#ff8a7a" }}>■</span> dark red = Heating Up / On Fire</span>
              <span>On-ice is estimated from the live box score's ice time and can trail a line change by ~30s.</span>
            </div>
          )}
          {/* 2026-10-22 (user: CourtIQ's box score is the standard): the two teams side by side, stacked on a phone */}
          <div className="box-grid">
            {["away", "home"].map((side) => (
              <div key={side} className="card box-card">
                <div className="box-title"><img src={`https://assets.nhle.com/logos/nhl/svg/${box[side].abbrev}_dark.svg`} alt="" width="22" height="22" /> <b>{box[side].abbrev}</b> <span className="mono" style={{ color: "var(--muted)", fontSize: 10 }}>{side}</span></div>
                <SkaterTable t={box[side]} poolById={poolById} onIce={onIce} heatById={heatById} live={LIVE.has(box.state)} />
                <GoalieTable t={box[side]} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
