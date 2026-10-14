import { useEffect, useMemo, useRef, useState } from "react";
import { useScoredPool } from "../lib/data.js";
import { buildPairs, MAX_PAIRS, MODES, PROPS, relText, toDecimal } from "../lib/pairs.js";
import { filterPlayers, useMatchup } from "../lib/matchupFilter.js";
import { useH2HGrades } from "../lib/h2h.js";
import { fmtAmerican } from "../lib/bookOdds.js";
import { openSkaterSlide } from "../slideouts.js";
import MatchupFilter from "../components/MatchupFilter.jsx";
import PlayerAvatar from "../components/PlayerAvatar.jsx";
import GradeBadge from "../components/GradeBadge.jsx";
import PickButton from "../components/PickButton.jsx";

// 🤝 Pairs (Scouting): up to 10 auto-built 2-leg pairs from the live slate (lib/pairs.js). Rebuilt whenever the
// live pool changes (lineups, goalie news, scratches), and pairs that are new since the last build get a NEW tag.
const BOOSTS = [0, 0.25, 0.5, 1];
const pct = (v) => `${(v * 100).toFixed(1)}%`;
const muted = { color: "var(--muted)" };
const timeOf = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function Chip({ children, title, strong }) {
  return (
    <span className="mono" title={title} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 9, border: `1px solid ${strong ? "var(--accent2)" : "var(--border)"}`, color: strong ? "var(--accent2)" : "var(--muted)", whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function Leg({ leg, h2h }) {
  const { p, prop, chance } = leg;
  const info = PROPS[prop];
  const g = h2h.get(p.playerId);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
      <PlayerAvatar playerId={p.playerId} name={p.name} team={p.team} size={40} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span className="player-name-link" style={{ fontWeight: 700, cursor: "pointer" }} onClick={() => openSkaterSlide(p)}>{p.name}</span>
          <PickButton player={p} />
        </div>
        <div className="mono" style={{ fontSize: 10, ...muted }}>
          {p.team} · {p.position} · {p.isHome ? "vs" : "@"} {p.opponentTeam}{p.opponentGoalie ? ` (${p.opponentGoalie.split(" ").pop()})` : ""}
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
          {p.effectiveGrade?.letter && <GradeBadge grade={p.effectiveGrade} />}
          {p.lineupStatus === "dressed" && <Chip title="In tonight's official lineup">✅ lineup</Chip>}
          {p.oppSoftPct >= 0.67 && <Chip strong title="Opponent in the softest third of tonight's defenses (xGA allowed)">▲ soft D</Chip>}
          {p.oppSoftPct != null && p.oppSoftPct < 0.33 && <Chip title="Opponent in the stingiest third of tonight's defenses">▼ tough D</Chip>}
          {g?.letter && <Chip strong={g.letter.startsWith("A")} title={`H2H (context only, not in the chance): ${g.text}`}>H2H {g.letter}{g.small ? "*" : ""}</Chip>}
          {prop === "goal" && p.dueHeat && <Chip strong title="🔥 Due + heating up (already in the goal chance)">🔥 due</Chip>}
          {prop === "point" && p.pointHeat && <Chip strong title="🍎 Points due (already in the point chance)">🍎 due</Chip>}
          {prop === "goal" && p.edge != null && <Chip strong={p.edge >= 3} title={`Our goal % minus the best book's implied %`}>edge {p.edge > 0 ? "+" : ""}{p.edge.toFixed(1)}</Chip>}
        </div>
      </div>
      <div style={{ textAlign: "right", flex: "0 0 auto" }}>
        <div className="mono" style={{ fontSize: 10, ...muted }}>{info.emoji} {info.label}</div>
        <div className="mono" style={{ fontSize: 16, fontWeight: 700 }}>{pct(chance)}</div>
        {prop === "goal" && leg.book && <div className="mono" style={{ fontSize: 10, ...muted }}>{fmtAmerican(leg.book.best)} {leg.book.bestBook}</div>}
      </div>
    </div>
  );
}

function PriceLine({ pr, boost }) {
  const goalGoal = pr.legs.every((l) => l.prop === "goal");
  if (!goalGoal) {
    return <div className="mono" style={{ fontSize: 10, ...muted }}>No sportsbook prices are pulled for points or shots, so this pair is ranked on the model's chance only.</div>;
  }
  if (pr.sameGame) {
    return <div className="mono" style={{ fontSize: 10, ...muted }}>Same-game parlay: books set their own SGP price. Ours says fair is {fmtAmerican(pr.fair)}; worth it only if the book pays more.</div>;
  }
  if (!pr.parlay) return <div className="mono" style={{ fontSize: 10, ...muted }}>No single book has both legs priced yet. Fair price {fmtAmerican(pr.fair)}.</div>;
  const { parlay } = pr;
  const [a, b] = parlay.legs;
  return (
    <div className="mono" style={{ fontSize: 11, display: "flex", flexWrap: "wrap", gap: "4px 14px", alignItems: "baseline" }}>
      <span title={`${fmtAmerican(a)} = ${toDecimal(a).toFixed(2)} and ${fmtAmerican(b)} = ${toDecimal(b).toFixed(2)} in decimal; a parlay multiplies them`}>
        {parlay.book}: {fmtAmerican(a)} × {fmtAmerican(b)} → <b>{fmtAmerican(parlay.american)}</b>
        <span style={muted}> ({toDecimal(a).toFixed(2)} × {toDecimal(b).toFixed(2)} = {parlay.dec.toFixed(2)})</span>
      </span>
      {boost > 0 && <span>{Math.round(boost * 100)}% boost → <b>{fmtAmerican(parlay.boostedAmerican)}</b></span>}
      <span style={muted}>fair {fmtAmerican(pr.fair)}</span>
      <span style={{ color: pr.ev > 0 ? "var(--accent2)" : "var(--muted)", fontWeight: 700 }} title="Expected return per 1 unit: chance both hit x payout - 1">
        EV {pr.ev > 0 ? "+" : ""}{(pr.ev * 100).toFixed(0)}%
      </span>
    </div>
  );
}

function PairCard({ pr, n, isNew, h2h, boost }) {
  return (
    <div className="card" style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 12, background: "var(--surface)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 700, fontSize: 14 }}>
          #{n} · {pr.section} {isNew && <span className="mono" style={{ fontSize: 9, color: "var(--accent2)", marginLeft: 4 }}>NEW</span>}
        </span>
        <span className="mono" style={{ fontSize: 12 }} title="Chance both legs hit = leg x leg x correlation">
          Both hit <b style={{ fontSize: 15 }}>{pct(pr.chance)}</b>
        </span>
      </div>
      <div className="mono" style={{ fontSize: 10, ...muted }}>
        {relText(pr)} · {pct(pr.legs[0].chance)} × {pct(pr.legs[1].chance)}{pr.corr !== 1 ? ` × ${pr.corr.toFixed(2)}` : ""}
      </div>
      {pr.legs.map((l) => <Leg key={l.p.playerId + l.prop} leg={l} h2h={h2h} />)}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8 }}><PriceLine pr={pr} boost={boost} /></div>
    </div>
  );
}

export default function PairsTab() {
  const pool = useScoredPool();
  const selected = useMatchup();
  const h2hGrades = useH2HGrades();
  const [mode, setMode] = useState("balanced");
  const [boost, setBoost] = useState(0);

  const pairs = useMemo(() => {
    if (!pool) return [];
    return buildPairs(filterPlayers(pool.players, selected), { mode, boost });
  }, [pool, selected, mode, boost]);

  // Reshuffle tracking: same mode + game filter, different pairs = the live slate changed underneath.
  const prev = useRef({ ctx: null, keys: null });
  const [news, setNews] = useState({ at: null, keys: new Set() });
  const keyStr = pairs.map((p) => p.key).join(",");
  useEffect(() => {
    const ctx = `${mode}|${selected}|${boost}`;
    const last = prev.current;
    if (last.ctx === ctx && last.keys != null && last.keys !== keyStr) {
      const old = new Set(last.keys.split(","));
      setNews({ at: new Date(), keys: new Set(pairs.map((p) => p.key).filter((k) => !old.has(k))) });
    } else if (last.ctx !== ctx) {
      setNews({ at: null, keys: new Set() });
    }
    prev.current = { ctx, keys: keyStr };
  }, [keyStr, mode, selected, boost, pairs]);

  if (!pool) return <div className="mono" style={muted}>Loading tonight's slate…</div>;
  const modeInfo = MODES.find((m) => m.key === mode);
  const games = new Set(pool.players.filter((p) => !p.gameStarted).map((p) => p.team)).size / 2;

  return (
    <div>
      <div className="section-title" style={{ marginBottom: 4 }}>🤝 Pairs</div>
      <div className="mono" style={{ fontSize: 11, ...muted, marginBottom: 10 }}>
        Up to {MAX_PAIRS} two-leg pairs built from tonight's upcoming games ({games} game{games === 1 ? "" : "s"}). They rebuild on their own
        when lineups, starting goalies or scratches change.
        {news.at && <> · <span style={{ color: "var(--accent2)" }}>🔄 Reshuffled {timeOf(news.at)} after lineup news</span></>}
      </div>
      <MatchupFilter />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", margin: "10px 0" }}>
        <div className="pill-row">
          {MODES.map((m) => (
            <button key={m.key} className={`pill-btn ${mode === m.key ? "active" : ""}`} onClick={() => setMode(m.key)} title={m.blurb}>{m.label}</button>
          ))}
        </div>
        <div className="pill-row" title="Profit boost on the parlay (only changes goal + goal pairs with a book price)">
          <span className="mono" style={{ fontSize: 10, ...muted, alignSelf: "center", marginRight: 4 }}>Boost</span>
          {BOOSTS.map((b) => (
            <button key={b} className={`pill-btn ${boost === b ? "active" : ""}`} onClick={() => setBoost(b)}>{b ? `${b * 100}%` : "None"}</button>
          ))}
        </div>
      </div>
      <div className="mono" style={{ fontSize: 10, ...muted, marginBottom: 10 }}>{modeInfo.blurb}.</div>

      {pairs.length === 0 ? (
        <div className="mono" style={muted}>
          {mode === "value" ? "No goal + goal pair with a positive expected return at one book right now." : "No pairs — every game has started or no skaters qualify."}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))", gap: 12 }}>
          {pairs.map((pr, i) => <PairCard key={pr.key} pr={pr} n={i + 1} isNew={news.keys.has(pr.key)} h2h={h2hGrades.skaters} boost={boost} />)}
        </div>
      )}

      <div className="mono" style={{ fontSize: 10, ...muted, marginTop: 14, lineHeight: 1.6 }}>
        How it's calculated: each leg is the model's own chance (goal and point % with matchup, form and calibration; 3+ SOG from the grade model).
        Both-hit chance = leg × leg × a correlation measured on four seasons: different games 1.00, teammates 1.12 for goal + point or point + point
        (one can assist the other) and 0.99 for two goals, opponents 0.96–0.98. Book parlay price = the two decimal prices multiplied at the same book
        (e.g. +380 and +200 → 4.80 × 3.00 = 14.40 → +1340); a profit boost multiplies the profit part. Sportsbook prices exist only for anytime goals, so
        point and shot pairs carry no odds and are ranked on chance alone. Only "Value vs book" ranks by price. H2H and the 🔥 / soft-D tags are shown as context;
        H2H is not part of any chance. Max {MAX_PAIRS} pairs, a player appears in at most 2.
      </div>
    </div>
  );
}
