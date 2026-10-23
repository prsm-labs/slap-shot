import { useEffect, useMemo, useRef, useState } from "react";
import { useScoredPool } from "../lib/data.js";
import { buildPairs, MAX_PAIRS, MODES, notInPairs, PROPS, relText, toAmerican, toDecimal } from "../lib/pairs.js";
import { filterPlayers, useMatchup } from "../lib/matchupFilter.js";
import { useH2HGrades } from "../lib/h2h.js";
import { booksText, fmtAmerican } from "../lib/bookOdds.js";
import { fmtToi } from "../lib/toi.js";
import { dueHeatText } from "../lib/dueHeat.js";
import { pointHeatText } from "../lib/pointHeat.js";
import { openSkaterSlide } from "../slideouts.js";
import MatchupFilter from "../components/MatchupFilter.jsx";
import PlayerAvatar from "../components/PlayerAvatar.jsx";
import GradeBadge from "../components/GradeBadge.jsx";
import PickButton from "../components/PickButton.jsx";

// 🤝 Pairs (Scouting): up to 10 auto-built 2-leg pairs from the live slate (lib/pairs.js). Rebuilt whenever the
// live pool changes (lineups, goalie news, scratches), and pairs that are new since the last build get a NEW tag.
// About 20-45 min before the first puck drop the board is frozen (scripts/lock_pairs.mjs -> public/data/pairs/<date>.json);
// from then on the page opens on the locked pairs (what Track Record > Pairs grades), with the live board one tap away.
const BOOSTS = [0, 0.25, 0.5, 1];
const pct = (v) => `${(v * 100).toFixed(1)}%`;
const muted = { color: "var(--muted)" };
const timeOf = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const LOCK_CHECK_MS = 5 * 60_000;

// A locked record (lib/pairs.js pairRecord) in the shape PairCard renders. Chances / prices are the locked ones;
// the chips use the skater's live record when he's still on the slate.
function fromRecord(r, byId, boost) {
  const legs = r.legs.map((l) => ({
    prop: l.prop, chance: l.chancePct / 100, book: l.book,
    p: byId.get(l.playerId) || { playerId: l.playerId, name: l.name, team: l.team, position: l.position, opponentTeam: l.opp, isHome: l.isHome, effectiveGrade: l.grade ? { letter: l.grade } : null, edge: l.edge },
  }));
  const chance = r.chancePct / 100;
  let parlay = null;
  if (r.parlay) {
    const boostedDec = 1 + (r.parlay.dec - 1) * (1 + boost);
    parlay = { ...r.parlay, boostedDec, boostedAmerican: toAmerican(boostedDec) };
  }
  return { key: r.key, section: r.section, rel: r.rel, corr: r.corr, chance, fair: r.fair, sameGame: r.rel !== "diff", legs, parlay, ev: parlay ? chance * parlay.boostedDec - 1 : null };
}

function BlindSpots({ list }) {
  const [open, setOpen] = useState(false);
  if (!list.length) return null;
  const shown = open ? list : list.slice(0, 8);
  const pc = (v) => (v == null ? "—" : `${v.toFixed(1)}%`);
  return (
    <div style={{ marginTop: 16, border: "1px dashed var(--border)", borderRadius: 12, padding: 12 }}>
      <div className="section-title" style={{ fontSize: 14, marginBottom: 4 }}>👀 Notable tonight, not in a pair ({list.length})</div>
      <div className="mono" style={{ fontSize: 10, ...muted, marginBottom: 8 }}>
        A/A+ grades, 🔥 due, 🍎 points due, 🚀 Breakout Watch, value vs book, or a B+ grade vs a soft defense that didn't make the {MAX_PAIRS}
        (each player is in at most one Balanced pair). Try another mode, or build your own from these.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))", gap: 6 }}>
        {shown.map(({ p, why, goal, point, sog3 }) => (
          <div key={p.playerId} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <PlayerAvatar playerId={p.playerId} name={p.name} team={p.team} size={28} />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <span className="player-name-link" style={{ fontWeight: 700, fontSize: 12, cursor: "pointer" }} onClick={() => openSkaterSlide(p)}>{p.name}</span>
                <span className="mono" style={{ fontSize: 9, ...muted }}>{p.team} {p.isHome ? "vs" : "@"} {p.opponentTeam}</span>
                <PickButton player={p} />
              </div>
              <div className="mono" style={{ fontSize: 9, color: "var(--accent2)" }}>{why.join(" · ")}</div>
              <div className="mono" style={{ fontSize: 9, ...muted }}>🚨 {pc(goal)} · 🍎 {pc(point)} · 🏒 {pc(sog3)}</div>
            </div>
          </div>
        ))}
      </div>
      {list.length > 8 && <button className="pill-btn" style={{ marginTop: 8 }} onClick={() => setOpen(!open)}>{open ? "Show fewer" : `Show all ${list.length}`}</button>}
    </div>
  );
}

function Chip({ children, title, strong }) {
  return (
    <span className="mono" title={title} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 9, border: `1px solid ${strong ? "var(--accent2)" : "var(--border)"}`, color: strong ? "var(--accent2)" : "var(--muted)", whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

// Opponent defenses ranked within tonight's slate by xGA allowed per game (1 = softest).
function defenseRanks(players) {
  const xga = new Map();
  for (const p of players) if (p.opponentTeamxGA60 != null) xga.set(p.opponentTeam, p.opponentTeamxGA60);
  const teams = [...xga.keys()].sort((a, b) => xga.get(b) - xga.get(a));
  return new Map(teams.map((t, i) => [t, { rank: i + 1, of: teams.length, xga: xga.get(t) }]));
}

const f1 = (v, d = 1) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(d));
const pc1 = (v) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);

function Row({ k, children, title }) {
  return (
    <div title={title} style={{ display: "contents" }}>
      <span style={muted}>{k}</span>
      <span>{children}</span>
    </div>
  );
}

// Everything behind one leg: season and recent form, ice time, recent shot volume, tonight's matchup, the model's
// chance before / after the matchup, multi-goal / multi-point chances, H2H, lineup, sportsbook prices.
function LegDetails({ leg, h2h, defRank }) {
  const { p, prop } = leg;
  if (p.games_played == null) return <div className="mono" style={{ fontSize: 10, ...muted }}>Player no longer on tonight's slate — locked numbers only.</div>;
  const gp = p.games_played || 0;
  const last5 = (p.last7 || []).slice(-5);
  const sum = (k) => last5.reduce((s, g) => s + (g[k] || 0), 0);
  const d = defRank.get(p.opponentTeam);
  const h = h2h.get(p.playerId);
  const base = p.modelProbs?.base?.[prop];
  const withMatchup = p.modelProbs?.uncal?.[prop];
  const cur = leg.chance;
  const gameLog = last5.map((g) => `${g.date?.slice(5).replace("-", "/")} ${g.home ? "vs" : "@"}${g.opp}: ${g.goals}G ${g.assists}A ${g.sog}SOG`).join("\n");
  return (
    <div className="mono" style={{ fontSize: 10, display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 10px", padding: "6px 8px", marginBottom: 6, background: "var(--bg)", borderRadius: 8 }}>
      <Row k="Season (2 yrs)" title="Last season + this season, per game played">
        {gp} GP · {f1((p.TotalGoals || 0) / Math.max(gp, 1), 2)} G/GP · {f1((p.I_F_points || 0) / Math.max(gp, 1), 2)} P/GP · {f1(p.ShotsOnGoalPerGame, 2)} SOG/GP
      </Row>
      <Row k={`Last ${last5.length}`} title={gameLog}>
        {sum("goals")} G · {sum("assists")} A · {sum("points")} P · {sum("sog")} SOG · {sum("hd")} HD
      </Row>
      <Row k="Ice time" title="Estimated TOI tonight = average of season and last-5 TOI per game">
        {fmtToi(p.estToi)} est. · PP {fmtToi(p.ppToi)}/gm
      </Row>
      {p.sog120 != null && (
        <Row k={`Last ${p.l120Min} min`} title="Rate per 60 over the most recent ~120 minutes on ice vs season (context only)">
          SOG/60 {f1(p.sog120)} ({f1(p.sog120x, 2)}x) · HD/60 {f1(p.hd120)} ({f1(p.hd120x, 2)}x)
        </Row>
      )}
      <Row k="Matchup" title="Opponent's expected goals allowed per game; rank among tonight's defenses (1 = softest)">
        {p.isHome ? "vs" : "@"} {p.opponentTeam} D {d ? `#${d.rank} softest of ${d.of} (${f1(d.xga, 2)} xGA/gm)` : "—"}
      </Row>
      <Row k="Goalie" title="Tonight's opposing starter and status">
        {p.opponentGoalie || "TBD"} {p.goalieGrade?.letter ? `(${p.goalieGrade.letter})` : ""} · {p.opponentGoalieStatus || "projected"}
      </Row>
      <Row k="Model" title="Grade model alone → with tonight's opponent defense → final (calibrated for the model's known top-end over-confidence, plus 120-min form and due boosts where they apply)">
        {base != null ? `raw ${pc1(base)} → ` : ""}{withMatchup != null ? `matchup ${pc1(withMatchup)} → ` : ""}<b>{pc1(cur)}</b> final
      </Row>
      {prop === "goal" && p.multiGoalPct != null && <Row k="2+ goals">{p.multiGoalPct}%</Row>}
      {prop === "point" && p.multiPoint2Pct != null && <Row k="2+ / 3+ pts">{p.multiPoint2Pct}% / {p.multiPoint3Pct}%</Row>}
      {prop === "goal" && p.dueHeat && <Row k="🔥 Due">{dueHeatText(p.dueHeat)}</Row>}
      {prop === "point" && p.pointHeat && <Row k="🍎 Due">{pointHeatText(p.pointHeat)}</Row>}
      <Row k="H2H" title="Context only — tested as no edge over 4 seasons">{h?.text || "no history vs tonight's opponent"}</Row>
      <Row k="Lineup">
        {p.lineupStatus === "dressed" ? "✅ official lineup" : "not official yet"}
        {p.startingLineup === true ? " · ▶ starting" : ""}
      </Row>
      {prop === "goal" && <Row k="Books">{booksText(p.book)}</Row>}
    </div>
  );
}

function Leg({ leg, h2h, details, defRank }) {
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
        {details && <div style={{ marginTop: 6 }}><LegDetails leg={leg} h2h={h2h} defRank={defRank} /></div>}
      </div>
      <div style={{ textAlign: "right", flex: "0 0 auto", alignSelf: "flex-start" }}>
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

// Plain-language reasons this pair made the board, from what both legs share.
function whyLine(pr, defRank) {
  const [a, b] = pr.legs;
  const out = [];
  const g = (l) => l.p.effectiveGrade?.letter || "";
  if (g(a).startsWith("A") && g(b).startsWith("A")) out.push("both A-grade");
  const soft = pr.legs.filter((l) => l.p.oppSoftPct >= 0.67).length;
  if (soft === 2) out.push("both vs soft defenses");
  else if (soft === 1) out.push(`${pr.legs.find((l) => l.p.oppSoftPct >= 0.67).p.name.split(" ").pop()} vs a soft defense`);
  const hot = pr.legs.filter((l) => (l.prop === "goal" && l.p.dueHeat) || (l.prop === "point" && l.p.pointHeat));
  if (hot.length) out.push(`${hot.map((l) => l.p.name.split(" ").pop()).join(" & ")} due + heating`);
  if (pr.rel === "team" && pr.corr > 1) out.push("teammates — a goal by one is often a point for the other");
  if (pr.legs.every((l) => l.p.lineupStatus === "dressed")) out.push("both in official lineups");
  if (pr.ev != null && pr.ev > 0) out.push(`priced ${Math.round(pr.ev * 100)}% above fair`);
  const tough = pr.legs.filter((l) => { const d = defRank.get(l.p.opponentTeam); return d && d.rank > d.of * 0.67; });
  if (tough.length) out.push(`watch: ${tough.map((l) => l.p.name.split(" ").pop()).join(" & ")} vs a tough defense`);
  return out;
}

function PairCard({ pr, n, isNew, h2h, boost, defRank }) {
  const [details, setDetails] = useState(false);
  const [a, b] = pr.legs;
  const either = Math.min(1, a.chance + b.chance - pr.chance);
  const why = whyLine(pr, defRank);
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
      <div className="mono" style={{ fontSize: 10, ...muted }} title="At least one = A + B - both; exactly one = at least one - both">
        At least one hits {pct(either)} · exactly one {pct(either - pr.chance)} · neither {pct(1 - either)}
      </div>
      {why.length > 0 && <div className="mono" style={{ fontSize: 10, color: "var(--accent2)", marginTop: 2 }}>{why.join(" · ")}</div>}
      {pr.legs.map((l) => <Leg key={l.p.playerId + l.prop} leg={l} h2h={h2h} details={details} defRank={defRank} />)}
      <button className="pill-btn" style={{ fontSize: 10, marginBottom: 6 }} onClick={() => setDetails(!details)}>{details ? "Hide breakdown" : "🔍 Full breakdown"}</button>
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
  const [lock, setLock] = useState(null); // locked record for tonight, if any
  const [showLive, setShowLive] = useState(false);
  const slateDate = pool?.meta?.slateDate;

  useEffect(() => {
    if (!slateDate) return undefined;
    let alive = true;
    let timer = null;
    const check = async () => {
      let data = null;
      try {
        const res = await fetch(`/data/pairs/${slateDate}.json`, { cache: "no-cache" });
        if (res.ok && (res.headers.get("content-type") || "").includes("json")) data = await res.json();
      } catch {
        data = null;
      }
      if (!alive) return;
      setLock(data?._meta?.slateDate === slateDate ? data : null);
      if (!data) timer = setTimeout(check, LOCK_CHECK_MS);
    };
    check();
    return () => { alive = false; clearTimeout(timer); };
  }, [slateDate]);
  const locked = Boolean(lock) && !showLive;

  const livePairs = useMemo(() => {
    if (!pool) return [];
    return buildPairs(filterPlayers(pool.players, selected), { mode, boost });
  }, [pool, selected, mode, boost]);
  const allPlayers = useScoredPool({ includeStarted: true });
  const lockedPairs = useMemo(() => {
    if (!lock) return [];
    const byId = new Map((allPlayers?.players || []).map((p) => [p.playerId, p]));
    const [ta, tb] = selected ? selected.split("@") : [];
    return (lock.modes[mode] || [])
      .filter((r) => !selected || r.legs.some((l) => l.team === ta || l.team === tb))
      .map((r) => fromRecord(r, byId, boost));
  }, [lock, allPlayers, mode, boost, selected]);
  const pairs = locked ? lockedPairs : livePairs;
  const defRank = useMemo(() => defenseRanks(allPlayers?.players || []), [allPlayers]);
  const blind = useMemo(() => (pool ? notInPairs(filterPlayers(pool.players, selected), pairs) : []), [pool, selected, pairs]);

  // Reshuffle tracking: same mode + game filter, different pairs = the live slate changed underneath.
  const prev = useRef({ ctx: null, keys: null });
  const [news, setNews] = useState({ at: null, keys: new Set() });
  const keyStr = pairs.map((p) => p.key).join(",");
  useEffect(() => {
    const ctx = `${mode}|${selected}|${boost}|${locked}`;
    const last = prev.current;
    if (last.ctx === ctx && last.keys != null && last.keys !== keyStr) {
      const old = new Set(last.keys.split(","));
      setNews({ at: new Date(), keys: new Set(pairs.map((p) => p.key).filter((k) => !old.has(k))) });
    } else if (last.ctx !== ctx) {
      setNews({ at: null, keys: new Set() });
    }
    prev.current = { ctx, keys: keyStr };
  }, [keyStr, mode, selected, boost, pairs, locked]);

  if (!pool) return <div className="mono" style={muted}>Loading tonight's slate…</div>;
  const modeInfo = MODES.find((m) => m.key === mode);
  const games = new Set(pool.players.filter((p) => !p.gameStarted).map((p) => p.team)).size / 2;

  return (
    <div>
      <div className="section-title" style={{ marginBottom: 4 }}>🤝 Pairs</div>
      <div className="mono" style={{ fontSize: 11, ...muted, marginBottom: 10 }}>
        Up to {MAX_PAIRS} two-leg pairs built from tonight's upcoming games ({games} game{games === 1 ? "" : "s"}). They rebuild on their own
        when lineups, starting goalies or scratches change.
        {!locked && news.at && <> · <span style={{ color: "var(--accent2)" }}>🔄 Reshuffled {timeOf(news.at)} after lineup news</span></>}
      </div>
      {lock && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <div className="pill-row">
            <button className={`pill-btn ${!showLive ? "active" : ""}`} onClick={() => setShowLive(false)}>🔒 Locked (tracked)</button>
            <button className={`pill-btn ${showLive ? "active" : ""}`} onClick={() => setShowLive(true)}>🔄 Live</button>
          </div>
          <span className="mono" style={{ fontSize: 10, ...muted }}>
            Locked {timeOf(new Date(lock._meta.lockedAt))} before the {lock._meta.firstGame} puck drop
            {lock._meta.teamsOfficial?.length ? ` · official lineups for ${lock._meta.teamsOfficial.length} teams` : ""}
            {lock._meta.late ? " · locked late (after the first game started)" : ""} — graded in Track Record › Pairs.
          </span>
        </div>
      )}
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
          {pairs.map((pr, i) => <PairCard key={pr.key} pr={pr} n={i + 1} isNew={news.keys.has(pr.key)} h2h={h2hGrades.skaters} boost={boost} defRank={defRank} />)}
        </div>
      )}

      <BlindSpots list={blind} />

      <div className="mono" style={{ fontSize: 10, ...muted, marginTop: 14, lineHeight: 1.6 }}>
        How it's calculated: each leg is the model's own chance (goal and point % with matchup, form and calibration; 3+ SOG from the grade model).
        Both-hit chance = leg × leg × a correlation measured on four seasons: different games 1.00, teammates 1.12 for goal + point or point + point
        (one can assist the other) and 0.99 for two goals, opponents 0.96–0.98. Book parlay price = the two decimal prices multiplied at the same book
        (e.g. +380 and +200 → 4.80 × 3.00 = 14.40 → +1340); a profit boost multiplies the profit part. Sportsbook prices exist only for anytime goals, so
        point and shot pairs carry no odds and are ranked on chance alone. Only "Value vs book" ranks by price. H2H and the 🔥 / soft-D tags are shown as context;
        H2H is not part of any chance. Max {MAX_PAIRS} pairs; a player appears in at most 1 Balanced pair (2 in other modes).
        Every mode is locked about 20–45 minutes before the first puck drop (after that game's official lineups) and graded in Track Record.
      </div>
    </div>
  );
}
