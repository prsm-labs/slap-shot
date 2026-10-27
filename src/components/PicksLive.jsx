import { useEffect, useState } from "react";
import { openSkaterSlide } from "../slideouts.js";
import { PICK_TYPE } from "../lib/picks.js";
import { restOfGame } from "../lib/liveModel.js";
import { gameFraction, projSkater, scoreZ } from "./LiveProjection.jsx";
import PlayerAvatar from "./PlayerAvatar.jsx";

// 📡 My Picks live (2026-10-26, user: a "my players" box score inside My Picks -- how my picks are doing live, measured
// against OUR projections, not the pick category's line). One row per picked skater on tonight's slate, box-score style:
// each stat cell = what he has now (big) and pre-game projection → live projected final (small, ▲ / ▼ when the live
// projection is 10%+ above / below pre-game). Live projection = the 📈 Live projection model (lib/liveModel.js, held out by
// season): now + a normal rest of the game from his pre-game rate, nudged by his shots and the score; finishing luck is not
// carried forward. Pre-game G / A / P = expected counts from tonight's goal / assist / point chances. Box scores every 15 s.
const LIVE = new Set(["LIVE", "CRIT"]);
const DONE = new Set(["OFF", "FINAL"]);
const lam = (p) => (p == null ? null : -Math.log(Math.max(1e-6, 1 - Math.min(p, 0.999))));
const toiMin = (t) => {
  const [m, s] = String(t || "0:00").split(":").map(Number);
  return (m || 0) + (s || 0) / 60;
};
const fx = (v, d) => (v == null || Number.isNaN(v) ? "—" : v.toFixed(d));
const mmss = (m) => (m == null ? "—" : `${Math.floor(m)}:${String(Math.round((m % 1) * 60)).padStart(2, "0")}`);
const gameTime = (utc) => (utc ? new Date(utc).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET" : "");
const STATS = [["toi", "TOI"], ["sog", "SOG"], ["g", "G"], ["a", "A"], ["p", "P"]];
const DEC = { toi: 0, sog: 1, g: 2, a: 2, p: 2 };

// every picked game's box score; polls while any is live or due to start
function useBoxes(ids) {
  const [boxes, setBoxes] = useState({});
  const key = ids.join(",");
  useEffect(() => {
    if (!key) return undefined;
    let alive = true, timer = null;
    const load = async () => {
      const list = key.split(",");
      const res = await Promise.all(list.map((id) => fetch(`/api/boxscore?gameId=${id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)));
      if (!alive) return;
      const out = {};
      list.forEach((id, i) => { if (res[i]) out[id] = res[i]; });
      setBoxes(out);
      const states = Object.values(out).map((b) => b.state);
      if (states.some((s) => LIVE.has(s))) timer = setTimeout(load, 15000);
      else if (states.length < list.length || states.some((s) => !DONE.has(s))) timer = setTimeout(load, 60000);
    };
    load();
    return () => { alive = false; clearTimeout(timer); };
  }, [key]);
  return boxes;
}

function Cell({ r, k }) {
  const d = DEC[k], pre = r.pre[k];
  const show = (v) => (k === "toi" ? mmss(v) : fx(v, d));
  if (!r.j) return <td className="num pl-cell"><b style={{ color: "var(--muted)" }}>—</b><span className="pl-sub">{show(pre)}</span></td>;
  const now = r.now[k], proj = r.j[k];
  const up = pre > 0 && proj >= pre * 1.1, down = pre > 0 && proj <= pre * 0.9;
  return (
    <td className="num pl-cell">
      <b>{k === "toi" ? mmss(now) : now}</b>
      <span className="pl-sub">{show(pre)} → <span className={up ? "pl-up" : down ? "pl-down" : ""}>{show(proj)}{up ? " ▲" : down ? " ▼" : ""}</span></span>
    </td>
  );
}

export default function PicksLive({ pool, picks }) {
  const byId = new Map((pool?.players || []).map((p) => [p.playerId, p]));
  const slate = pool?.meta?.slate || [];
  const gameOf = (team) => slate.find((g) => g.away === team || g.home === team);
  const mine = picks.map((k) => ({ k, p: byId.get(k.pid) })).filter((x) => x.p);
  const off = picks.length - mine.length;
  const ids = [...new Set(mine.map(({ p }) => String(p.gameId || gameOf(p.team)?.gameId || "")).filter(Boolean))].sort();
  const boxes = useBoxes(ids);

  const rows = mine.map(({ k, p }) => {
    const g = gameOf(p.team);
    const box = boxes[String(p.gameId || g?.gameId)];
    const side = box ? (box.away.abbrev === p.team ? "away" : box.home.abbrev === p.team ? "home" : null) : null;
    const s = side ? box[side].skaters.find((x) => x.playerId === p.playerId) : null;
    const state = box?.state || g?.gameState || "FUT";
    const started = LIVE.has(state) || DONE.has(state);
    const gPre = lam(p.anytimeGoalPct != null ? p.anytimeGoalPct / 100 : null);
    const pPre = lam(p.anytimePointPct != null ? p.anytimePointPct / 100 : null);
    const aPre = lam(p.modelProbs?.assist);
    const pre = { toi: p.estToi ?? null, sog: p.sogPg ?? p.ShotsOnGoalPerGame ?? null, g: gPre, a: aPre, p: pPre };
    let j = null, now = null;
    if (started && s) {
      const f = gameFraction(box);
      const margin = side === "away" ? (box.away.score ?? 0) - (box.home.score ?? 0) : (box.home.score ?? 0) - (box.away.score ?? 0);
      const base = projSkater(s, p, f, margin);
      const toi = toiMin(s.toi);
      now = { toi, sog: s.sog, g: s.goals, a: s.assists, p: s.points };
      j = {
        toi: pre.toi != null ? toi + (1 - f) * pre.toi : toi, sog: base.sog, g: base.goals, p: base.points,
        a: s.assists + restOfGame("team_goals", aPre, f, scoreZ(margin)).mean,
      };
    }
    return { k, p, g, box, side, s, state, started, pre, now, j };
  });
  const order = (r) => (LIVE.has(r.state) ? 0 : !r.started ? 1 : 2);
  rows.sort((a, b) => order(a) - order(b) || String(a.p.gameId).localeCompare(String(b.p.gameId)) || (b.pre.p || 0) - (a.pre.p || 0));
  const withJ = rows.filter((r) => r.j);
  const ahead = withJ.filter((r) => r.j.p >= r.pre.p * 1.05).length;
  const behind = withJ.filter((r) => r.j.p <= r.pre.p * 0.95).length;
  const n = (f) => rows.filter(f).length;

  if (!rows.length) return <div className="note">None of your picks are on this night's slate.{off ? ` (${off} from other nights — see By category.)` : ""}</div>;
  return (
    <div className="card pl-card">
      <div className="pl-summary">
        <span><b>{n((r) => LIVE.has(r.state))}</b> live</span><span><b>{n((r) => !r.started)}</b> to puck drop</span><span><b>{n((r) => DONE.has(r.state))}</b> final</span>
        {withJ.length > 0 && <><span className="pl-up"><b>{ahead}</b> ▲ ahead</span><span><b>{withJ.length - ahead - behind}</b> on track</span><span className="pl-down"><b>{behind}</b> ▼ behind</span></>}
      </div>
      <div className="table-wrap">
        <table className="data-table pl-table">
          <thead>
            <tr><th style={{ textAlign: "left" }}>Player</th>{STATS.map(([k, l]) => <th key={k}>{l}</th>)}<th title="Penalty minutes">PIM</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const t = PICK_TYPE[r.k.type];
              const b = r.box;
              return (
                <tr key={r.k.pid}>
                  <td className="clickable" onClick={() => openSkaterSlide(r.p)}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <PlayerAvatar playerId={r.p.playerId} name={r.p.name} team={r.p.team} size={24} />
                      <span className="pl-name"><span className="player-name-link">{r.p.name}</span>
                        <span className="pl-sub">{r.p.team} {r.p.isHome ? "vs" : "@"} {r.p.opponentTeam}{t ? ` · ${t.emoji} ${t.label}` : ""}</span>
                        <span className="pl-sub pl-gameline">{!r.started ? gameTime(r.g?.startTimeUTC) || "tonight"
                          : <><b>{b.away.abbrev} {b.away.score}–{b.home.score} {b.home.abbrev}</b> · {DONE.has(r.state) ? "Final" : b.clock?.inIntermission ? `End ${b.period}` : `${/^\d$/.test(b.period) ? `P${b.period}` : b.period} ${b.clock?.timeRemaining || ""}`}</>}</span>
                        {r.started && !r.s && <span className="pl-sub pl-down">not in the lineup</span>}</span>
                    </div>
                  </td>
                  {STATS.map(([k]) => <Cell key={k} r={r} k={k} />)}
                  <td className="num">{r.s ? r.s.pim : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginTop: 6 }}>
        Each stat: <b>now</b>, then pre-game projection → live projected final (▲ / ▼ = live 10%+ above / below pre-game). Pre-game G / A / P are
        expected counts from tonight's goal / assist / point chances. Ahead / behind counts use points (5%). The live projection is what he has +
        a normal rest of the game, nudged by his shots and the score; hot or cold finishing isn't carried forward.
        {off > 0 && ` ${off} pick${off === 1 ? "" : "s"} not on this night's slate (see By category).`}
      </div>
    </div>
  );
}
