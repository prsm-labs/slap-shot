import { useEffect, useState } from "react";
import { openSkaterSlide } from "../slideouts.js";
import PickButton from "./PickButton.jsx";
import PlayerAvatar from "./PlayerAvatar.jsx";
import GamblyButton from "./GamblyButton.jsx";
import { prismPicks, tierPicks } from "../lib/prismPicks.js";

// 💎 PRISM Picks card (top of Cheat Sheets), v2 real lines: tonight's best looks on lines a skater only clears about half
// the time (lib/prismPicks.js on the live pool; form, calibration, bands and graded nights from public/data/prism_picks.json).
// The big number is the track record at that chance. Book lines (public/data/prop_odds.json, 20k Odds API plan) are context
// only, hidden behind a button that greys out when no fresh lines were pulled (safety valve, user 2026-10-20).
const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const share = (h, n) => (n ? `${Math.round((h / n) * 100)}%` : "—");
const amer = (n) => (n > 0 ? `+${n}` : `${n}`);
const BOOK_FRESH_H = 18;
// 2026-10-23 pick levels (user: mid-range + long shots, all data-backed) -- lib/prismPicks.js tierPicks; nobody in two levels.
const LEVELS = [
  { key: "safe", label: "💎 PRISM Picks", sub: "Tonight's best looks on real lines — the kind a book posts" },
  { key: "mid", label: "⚖️ Mid-range", sub: "Not too safe, not too risky" },
  { key: "long", label: "🌠 Long shots", sub: "If the stars align — about 1 in 7" },
];
const fair = (p) => (p >= 0.5 ? Math.round((-100 * p) / (1 - p)) : `+${Math.round((100 * (1 - p)) / p)}`);
const load = (url, set) => fetch(url, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).then(set).catch(() => set(null));

// 2026-10-23: `date` (the date picker's past night) -> that night's saved picks and results instead of tonight's; tonight's
// view keeps only last night under "Last night" (older nights are one pick away in the date picker).
export default function PrismPicks({ players, date }) {
  const [data, setData] = useState(null);
  const [odds, setOdds] = useState(null);
  const [showBook, setShowBook] = useState(false);
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState("safe");
  useEffect(() => { load("/data/prism_picks.json", setData); load("/data/prop_odds.json", setOdds); }, []);
  if (!data?.knots) return null;
  const pastNight = date ? data.nights.find((n) => n.date === date) || { date, picks: [] } : null;
  if (pastNight) return <PastNight night={pastNight} />;
  const safe = prismPicks(players, data, odds);
  const mid = tierPicks(players, data, odds, "mid", new Set(safe.map((c) => c.p.playerId)));
  const long = tierPicks(players, data, odds, "long", new Set([...safe, ...mid].map((c) => c.p.playerId)));
  const byLevel = { safe, mid, long };
  const picks = byLevel[level];
  const tier = level === "safe" ? null : data.tiers?.[level];
  const L = LEVELS.find((x) => x.key === level);
  const booksOk = Boolean(odds?.fetched_at) && Date.now() - Date.parse(odds.fetched_at) < BOOK_FRESH_H * 3600e3 && picks.some((c) => c.book);
  const bt = data.backtest;
  const live = data.live;
  const past = [...data.nights].slice(-1);
  return (
    <div className={`card prism-card ${open ? 'open' : 'collapsed'}`}>
      <div className="prism-head">
        <span className="prism-gem" aria-hidden="true">💎</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="prism-title">PRISM Picks</div>
          <div className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>{L.sub}</div>
        </div>
        {/* 2026-10-22 (user): collapsed by default -- tap to expand */}
        <button type="button" className="prism-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{open ? '▴ Hide' : `▾ Show${safe.length + mid.length + long.length ? ` ${safe.length + mid.length + long.length} picks` : ''}`}</button>
        {picks.length > 0 && (
          <button type="button" className={`prism-book-btn ${booksOk ? "" : "off"}`} disabled={!booksOk} onClick={() => setShowBook((v) => !v)}
            title={booksOk ? "Sportsbook lines for these props — context only, never an input" : "No fresh sportsbook lines for tonight (odds feed not pulling, or lines not posted yet)"}>
            {booksOk ? (showBook ? "Hide book lines" : "📖 Show book lines") : "📖 Book lines unavailable"}
          </button>
        )}
      </div>
      {data.tiers && (
        <div className="pill-row prism-levels">
          {LEVELS.map((x) => (
            <button key={x.key} type="button" className={`pill-btn ${level === x.key ? "active" : ""}`} onClick={() => setLevel(x.key)}>
              {x.label}{byLevel[x.key].length ? ` · ${byLevel[x.key].length}` : ""}
            </button>
          ))}
        </div>
      )}
      {picks.length === 0 && (
        <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
          No real line clears the bar right now (games under way drop off) — this level only shows looks that have hit about {tier ? share(tier.backtest.hits + tier.live.hits, tier.backtest.n + tier.live.n) : share(bt.hits + live.hits, bt.n + live.n)} of the time.
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
            <div className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>had it in {c.last[1]} of his last {c.last[0]}{tier ? ` · fair ${fair(c.chance)} · about 1 in ${Math.round(1 / c.track.rate)}` : ""}</div>
            {showBook && booksOk && c.book && (
              <div className="mono prism-book" title="Sportsbook line for context only — never an input to the pick">
                📖 {c.book.same ? "Book, same bet" : "Book's line"}: o{c.book.point}{c.book.over != null ? ` ${amer(c.book.over)}` : ""} · {c.book.book}
              </div>
            )}
          </div>
          <div className="prism-stat" title={`Past ${tier ? tier.label.toLowerCase() : "PRISM Picks"} at a ${pct(c.chance)} chance hit ${pct(c.track.rate)} (${c.track.n} picks; small samples lean on the chance itself, trimmed by how far past picks fell short of it). The model alone says ${pct(c.chance)}.`}>
            <b>{pct(c.track.rate)}</b>
            <span className="mono">track record</span>
            <span className="mono">model {pct(c.chance)}</span>
          </div>
        </div>
      ))}
      {tier && (
        <div className="prism-foot mono">
          Track record: backtest {tier.backtest.hits.toLocaleString()} of {tier.backtest.n.toLocaleString()} hit ({share(tier.backtest.hits, tier.backtest.n)}, the model said {pct(tier.backtest.said)}) over {tier.backtest.nights} nights, 2023-24 to 2025-26
          {tier.live.n ? ` · this season (rebuilt from the locked pre-game snapshots since ${live.since.slice(5).replace("-", "/")}): ${tier.live.hits} of ${tier.live.n} (${share(tier.live.hits, tier.live.n)})` : ""}.
          {" "}On those same lines the skaters' own last-20 rate was {Math.round(tier.backtest.own * 1000) / 10}%{level === "long" ? " — lines they had barely touched lately, and still about 1 in 7 came in." : "."}
          {" "}Rule: shots on goal (at least {tier.rule.min_line.SOG}), points (at least {tier.rule.min_line.PTS}) or goals he hit in {pct(tier.rule.real)} or fewer of his last {data.rule.last_n} games, where the model gives him {pct(tier.rule.floor)} to {pct(tier.rule.cap)}
          {level === "long" ? ", ranked by how far the model sits above his own recent rate" : ", highest chance first"}; one prop per player, {data.rule.per_game} per game, {tier.rule.stat_cap} per stat, nobody in two levels. The chance is calibrated on held-out games against how often he hit the line lately. Follows lineup and goalie news until puck drop.
        </div>
      )}
      {!tier && <div className="prism-foot mono">
        Track record: backtest {bt.hits.toLocaleString()} of {bt.n.toLocaleString()} hit ({share(bt.hits, bt.n)}) over {bt.nights} nights, 2023-24 to 2025-26
        {live.n ? ` · this season (rebuilt from the locked pre-game snapshots since ${live.since.slice(5).replace("-", "/")}): ${live.hits} of ${live.n} (${share(live.hits, live.n)})` : ""}.
        Rule: real lines only — shots on goal around his own median, or a point — that he hit in {pct(data.rule.real)} or fewer of his last {data.rule.last_n} games,
        where the model gives him {pct(data.rule.floor)} to {pct(data.rule.cap)}; one prop per player, {data.rule.per_game} per game. Follows lineup and goalie news until puck drop.
      </div>}
      {past.length > 0 && level === "safe" && (
        <details className="prism-past">
          <summary>Last night</summary>
          <div className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>Pick any night in the 📅 date picker at the top to see its picks.</div>
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

function PastNight({ night }) {
  const [level, setLevel] = useState("safe");
  const list = level === "safe" ? night.picks : night.tiers?.[level] || [];
  const graded = list.filter((p) => p.result === "hit" || p.result === "miss");
  return (
    <div className="card prism-card open">
      <div className="prism-head">
        <span className="prism-gem" aria-hidden="true">💎</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="prism-title">PRISM Picks</div>
          <div className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>
            {list.length ? `That night's picks (frozen at puck drop) — ${graded.filter((p) => p.result === "hit").length} of ${graded.length} hit` : "No picks at this level that night."}
          </div>
        </div>
      </div>
      {night.tiers && (
        <div className="pill-row prism-levels">
          {LEVELS.map((x) => <button key={x.key} type="button" className={`pill-btn ${level === x.key ? "active" : ""}`} onClick={() => setLevel(x.key)}>{x.label}</button>)}
        </div>
      )}
      {list.map((p, i) => (
        <div key={`${p.playerId}-${p.stat}`} className="prism-row">
          <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>{i + 1}.</span>
          <PlayerAvatar playerId={p.playerId} name={p.name} team={p.team} size={30} />
          <div className="prism-main">
            <div className="mono" style={{ fontSize: 12 }}>{p.name} <span style={{ color: "var(--muted)" }}>({p.team} vs {p.opp})</span></div>
            <div className="prism-line">{p.label} <span className={`hit-mark ${p.result === "hit" ? "hit" : "miss"}`}>{p.result === "hit" ? "✅" : p.result === "miss" ? "✗" : "—"}{p.actual != null ? ` ${p.actual}` : ""}</span></div>
          </div>
          <div className="prism-stat"><b>{pct(p.chance)}</b><span className="mono">model</span></div>
        </div>
      ))}
    </div>
  );
}
