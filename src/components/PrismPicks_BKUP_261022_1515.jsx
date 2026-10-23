import { useEffect, useState } from "react";
import { openSkaterSlide } from "../slideouts.js";
import PickButton from "./PickButton.jsx";
import PlayerAvatar from "./PlayerAvatar.jsx";
import GamblyButton from "./GamblyButton.jsx";
import { prismPicks } from "../lib/prismPicks.js";

// 💎 PRISM Picks card (top of Cheat Sheets), v2 real lines: tonight's best looks on lines a skater only clears about half
// the time (lib/prismPicks.js on the live pool; form, calibration, bands and graded nights from public/data/prism_picks.json).
// The big number is the track record at that chance. Book lines (public/data/prop_odds.json, 20k Odds API plan) are context
// only, hidden behind a button that greys out when no fresh lines were pulled (safety valve, user 2026-10-20).
const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const share = (h, n) => (n ? `${Math.round((h / n) * 100)}%` : "—");
const amer = (n) => (n > 0 ? `+${n}` : `${n}`);
const BOOK_FRESH_H = 18;
const load = (url, set) => fetch(url, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).then(set).catch(() => set(null));

export default function PrismPicks({ players }) {
  const [data, setData] = useState(null);
  const [odds, setOdds] = useState(null);
  const [showBook, setShowBook] = useState(false);
  useEffect(() => { load("/data/prism_picks.json", setData); load("/data/prop_odds.json", setOdds); }, []);
  if (!data?.knots) return null;
  const picks = prismPicks(players, data, odds);
  const booksOk = Boolean(odds?.fetched_at) && Date.now() - Date.parse(odds.fetched_at) < BOOK_FRESH_H * 3600e3 && picks.some((c) => c.book);
  const bt = data.backtest;
  const live = data.live;
  const past = [...data.nights].reverse();
  return (
    <div className="card prism-card">
      <div className="prism-head">
        <span className="prism-gem" aria-hidden="true">💎</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="prism-title">PRISM Picks</div>
          <div className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>Tonight's best looks on real lines — the kind a book posts</div>
        </div>
        {picks.length > 0 && (
          <button type="button" className={`prism-book-btn ${booksOk ? "" : "off"}`} disabled={!booksOk} onClick={() => setShowBook((v) => !v)}
            title={booksOk ? "Sportsbook lines for these props — context only, never an input" : "No fresh sportsbook lines for tonight (odds feed not pulling, or lines not posted yet)"}>
            {booksOk ? (showBook ? "Hide book lines" : "📖 Show book lines") : "📖 Book lines unavailable"}
          </button>
        )}
      </div>
      {picks.length === 0 && (
        <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
          No real line clears the bar right now (games under way drop off) — PRISM Picks only shows looks that have hit about {share(bt.hits + live.hits, bt.n + live.n)} of the time.
        </div>
      )}
      {picks.map((c, i) => (
        <div key={`${c.p.playerId}-${c.stat}`} className="prism-row" onClick={() => openSkaterSlide(c.p)}>
          <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>{i + 1}.</span>
          <PlayerAvatar playerId={c.p.playerId} name={c.p.name} team={c.p.team} size={30} />
          <div className="prism-main">
            <div className="mono" style={{ fontSize: 12 }}>
              {c.p.name} <span style={{ color: "var(--muted)" }}>({c.p.team} {c.p.isHome === false ? "@" : "vs"} {c.p.opponentTeam})</span>{" "}
              <PickButton player={c.p} /> <GamblyButton text={`${c.p.name} (${c.p.team}) — ${c.label}`} />
            </div>
            <div className="prism-line">{c.label}</div>
            <div className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>had it in {c.last[1]} of his last {c.last[0]}</div>
            {showBook && booksOk && c.book && (
              <div className="mono prism-book" title="Sportsbook line for context only — never an input to the pick">
                📖 {c.book.same ? "Book, same bet" : "Book's line"}: o{c.book.point}{c.book.over != null ? ` ${amer(c.book.over)}` : ""} · {c.book.book}
              </div>
            )}
          </div>
          <div className="prism-stat" title={`Past PRISM Picks at a ${pct(c.chance)} chance hit ${pct(c.track.rate)} (${c.track.n} picks; small samples lean on the chance itself, trimmed by how far past picks fell short of it). The model alone says ${pct(c.chance)}.`}>
            <b>{pct(c.track.rate)}</b>
            <span className="mono">track record</span>
            <span className="mono">model {pct(c.chance)}</span>
          </div>
        </div>
      ))}
      <div className="prism-foot mono">
        Track record: backtest {bt.hits.toLocaleString()} of {bt.n.toLocaleString()} hit ({share(bt.hits, bt.n)}) over {bt.nights} nights, 2023-24 to 2025-26
        {live.n ? ` · this season (rebuilt from the locked pre-game snapshots since ${live.since.slice(5).replace("-", "/")}): ${live.hits} of ${live.n} (${share(live.hits, live.n)})` : ""}.
        Rule: real lines only — shots on goal around his own median, or a point — that he hit in {pct(data.rule.real)} or fewer of his last {data.rule.last_n} games,
        where the model gives him {pct(data.rule.floor)} to {pct(data.rule.cap)}; one prop per player, {data.rule.per_game} per game. Follows lineup and goalie news until puck drop.
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
