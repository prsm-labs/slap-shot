import { useEffect, useState } from "react";
import { openSkaterSlide } from "../slideouts.js";
import PickButton from "./PickButton.jsx";
import PlayerAvatar from "./PlayerAvatar.jsx";
import GamblyButton from "./GamblyButton.jsx";
import { prismPicks } from "../lib/prismPicks.js";

// 💎 PRISM Picks card (top of Cheat Sheets): tonight's props with the highest tested hit rates that aren't the obvious ones
// (lib/prismPicks.js on the live pool; form, hit-rate bands and graded nights from public/data/prism_picks.json). The big
// number is the track record — how often past PRISM Picks at that chance hit — not the raw model chance.
const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const share = (h, n) => (n ? `${Math.round((h / n) * 100)}%` : "—");

export default function PrismPicks({ players }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetch("/data/prism_picks.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).then(setData).catch(() => setData(null));
  }, []);
  if (!data) return null;
  const picks = prismPicks(players, data);
  const bt = data.backtest;
  const live = data.live;
  const past = [...data.nights].reverse();
  return (
    <div className="card prism-card">
      <div className="prism-head">
        <span className="prism-gem" aria-hidden="true">💎</span>
        <div>
          <div className="prism-title">PRISM Picks</div>
          <div className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>Tonight's highest-hitting props that aren't the obvious ones</div>
        </div>
      </div>
      {picks.length === 0 && (
        <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
          No prop clears the bar right now (games under way drop off) — PRISM Picks only shows looks that have hit about {share(bt.hits + live.hits, bt.n + live.n)} of the time.
        </div>
      )}
      {picks.map((c, i) => (
        <div key={`${c.p.playerId}-${c.key}`} className="prism-row" onClick={() => openSkaterSlide(c.p)}>
          <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>{i + 1}.</span>
          <PlayerAvatar playerId={c.p.playerId} name={c.p.name} team={c.p.team} size={30} />
          <div className="prism-main">
            <div className="mono" style={{ fontSize: 12 }}>
              {c.p.name} <span style={{ color: "var(--muted)" }}>({c.p.team} {c.p.isHome === false ? "@" : "vs"} {c.p.opponentTeam})</span>{" "}
              <PickButton player={c.p} /> <GamblyButton text={`${c.p.name} (${c.p.team}) — ${c.label}`} />
            </div>
            <div className="prism-line">{c.label}</div>
            <div className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>had it in {c.last[1]} of his last {c.last[0]}</div>
          </div>
          <div className="prism-stat" title={`Past PRISM Picks at a ${pct(c.chance)} model chance hit ${pct(c.track.rate)} (${c.track.n} picks; small samples lean on the model chance, trimmed by how far past picks fell short of it). The model alone says ${pct(c.chance)}.`}>
            <b>{pct(c.track.rate)}</b>
            <span className="mono">track record</span>
            <span className="mono">model {pct(c.chance)}</span>
          </div>
        </div>
      ))}
      <div className="prism-foot mono">
        Track record: backtest {bt.hits.toLocaleString()} of {bt.n.toLocaleString()} hit ({share(bt.hits, bt.n)}) over {bt.nights} nights, 2023-24 to 2025-26
        {live.n ? ` · this season (from the locked pre-game snapshots since ${live.since.slice(5).replace("-", "/")}): ${live.hits} of ${live.n} (${share(live.hits, live.n)})` : ""}.
        Rule: model chance {pct(data.rule.floor)}+, he had it in {pct(data.rule.last_max)} or fewer of his last {data.rule.last_n} games (the every-night props are left out), and
        the model sees at least {Math.round(data.rule.margin * 100)} points more tonight; one prop per player, {data.rule.per_game} per game. Follows lineup and goalie news until puck drop.
      </div>
      {past.length > 0 && (
        <details className="prism-past">
          <summary>Past nights</summary>
          {past.map((n) => (
            <div key={n.date} className="prism-past-row mono">
              <b>{n.date.slice(5).replace("-", "/")}</b> {n.picks.filter((p) => p.result === "hit").length}/{n.picks.length}{" "}
              <span style={{ color: "var(--muted)" }}>{n.picks.map((p) => `${p.result === "hit" ? "✅" : "✗"} ${p.name} ${p.label} (${p.actual})`).join(" · ")}</span>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
