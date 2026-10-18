import { useEffect, useMemo, useState } from "react";
import { openSkaterSlide } from "../slideouts.js";
import { MODES, PROPS } from "../lib/pairs.js";

const PROP_LOCKS = [
  { key: "balanced:goal", label: "🚨 Goal pairs" },
  { key: "balanced:point", label: "🍎 Point pairs" },
  { key: "balanced:sog3", label: "🏒 Shots pairs" },
];
import { fmtAmerican } from "../lib/bookOdds.js";

// Track Record — Pairs: every mode's locked pairs (scripts/lock_pairs.mjs, ~20-45 min before the first puck drop)
// against the box scores (build_track_record.py -> track_record_2026.json "pairRows" / "pairLocks").
// A leg whose player didn't play is void (books pay the other leg as a single); "expected" = sum of each pair's
// locked both-hit chance, so hits vs expected says whether the pair math is honest. Units only where a sportsbook
// parlay price existed at lock (goal + goal, different games), 1 unit per pair.
const shortDate = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const muted = { color: "var(--muted)" };
const pctS = (h, n) => (n ? `${Math.round((h / n) * 100)}%` : "—");
const BUCKETS = [[0, 10], [10, 20], [20, 35], [35, 50], [50, 101]];
const bucketLabel = ([lo, hi]) => (hi > 100 ? `${lo}%+` : `${lo}–${hi}%`);
const propCombo = (r) => r.legs.map((l) => l.prop).sort().join("+");
// Soft D + H2H watch (user, 2026-10-18): legs facing a top-third-softest defense whose H2H grade is A/A+. Tested as at
// most a small edge (4 seasons: goals 1.03 +/- 0.05) — tracked here, not used in any pick. H2H letters are stored at lock
// from 10/18; 10/5-10/17 were rebuilt from each night's pre-game H2H file; nights before 10/5 have none.
const STRONG_H2H = new Set(["A+", "A"]);
const shLeg = (l) => Boolean(l.softD && STRONG_H2H.has(l.h2h));
const shCount = (r) => r.legs.filter(shLeg).length;
const hasH2H = (r) => r.legs.some((l) => l.h2h !== undefined);
const SH_FILTERS = [["all", "All pairs"], ["1", "▲🔁 1+ leg"], ["2", "▲🔁 Both legs"]];
const oneLegChance = (r) => 1 - r.legs.reduce((q, l) => q * (1 - l.chancePct / 100), 1);
const COMBO_LABEL = { "goal+goal": "🚨 Goal + goal", "goal+point": "🚨🍎 Goal + point", "point+point": "🍎 Point + point", "sog3+sog3": "🏒 3+ SOG pair" };

function Tile({ label, value, sub }) {
  return (
    <div className="signal-tile">
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

function stats(rows) {
  const decided = rows.filter((r) => r.result !== "void");
  const hits = decided.filter((r) => r.result === "hit").length;
  const exp = decided.reduce((s, r) => s + r.chancePct / 100, 0);
  const priced = decided.filter((r) => r.units != null);
  const units = priced.reduce((s, r) => s + r.units, 0);
  return { n: decided.length, hits, exp, priced: priced.length, units, voids: rows.length - decided.length };
}

function legStat(l) {
  if (!l.played) return "DNP";
  const a = l.actual;
  if (l.prop === "goal") return `${a.g} G`;
  if (l.prop === "point") return `${a.p} P (${a.g}G ${a.a}A)`;
  return `${a.sog} SOG`;
}

function GroupTable({ title, rows, keyOf, label, order }) {
  const groups = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  return (
    <div style={{ flex: "1 1 300px" }}>
      <div className="mono" style={{ fontSize: 11, fontWeight: 700, marginBottom: 4 }}>{title}</div>
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>{label}</th><th>Pairs</th><th>Hit</th><th>Expected</th><th>Hit %</th><th>Said %</th><th>Units</th></tr></thead>
          <tbody>
            {[...groups.entries()].sort(([a], [b]) => (order ? order.indexOf(a) - order.indexOf(b) : 0)).map(([k, list]) => {
              const s = stats(list);
              return (
                <tr key={k}>
                  <td>{k}</td><td className="mono">{s.n}</td><td className="mono">{s.hits}</td><td className="mono">{s.exp.toFixed(1)}</td>
                  <td className="mono">{pctS(s.hits, s.n)}</td><td className="mono">{s.n ? `${Math.round((s.exp / s.n) * 100)}%` : "—"}</td>
                  <td className="mono" style={{ color: s.units > 0 ? "var(--accent2)" : undefined }}>{s.priced ? `${s.units >= 0 ? "+" : ""}${s.units.toFixed(1)} (${s.priced})` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function TrackRecordPairs() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState("balanced");
  const [date, setDate] = useState("all");
  const [result, setResult] = useState("all");
  const [sh, setSh] = useState("all");

  useEffect(() => {
    fetch("/data/track_record_2026.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch((e) => setError(String(e.message || e)));
  }, []);

  const all = useMemo(() => data?.pairRows || [], [data]);
  const dates = useMemo(() => [...new Set(all.map((r) => r.date))].sort().reverse(), [all]);
  const locks = data?.pairLocks || {};
  const modeScope = useMemo(() => all.filter((r) => (mode === "all" || r.mode === mode) && (date === "all" || r.date === date)), [all, mode, date]);
  const inScope = useMemo(() => modeScope.filter((r) => sh === "all" || shCount(r) >= Number(sh)), [modeScope, sh]);
  const shown = useMemo(() => inScope.filter((r) => result === "all" || r.result === result)
    .sort((a, b) => (a.date === b.date ? a.mode.localeCompare(b.mode) || a.rank - b.rank : b.date.localeCompare(a.date))), [inScope, result]);

  if (error) return <div className="mono" style={muted}>Couldn't load the track record ({error}).</div>;
  if (!data) return <div className="mono" style={muted}>Loading…</div>;
  if (!all.length) return <div className="mono" style={muted}>No locked pairs graded yet — the first lock happens before tonight's first puck drop, graded the next morning.</div>;

  const s = stats(inScope);
  // Running record of the soft D + H2H A/A+ watch for the chosen mode / night (ignores the watch filter itself).
  const shRows = modeScope.filter((r) => r.result !== "void" && shCount(r) >= 1);
  const shBoth = stats(shRows.filter((r) => shCount(r) === 2));
  const shAny = { n: shRows.length, hits: shRows.filter((r) => r.legs.some((l) => l.played && l.hit)).length, exp: shRows.reduce((a, r) => a + oneLegChance(r), 0) };
  const shLegs = new Map();
  for (const r of modeScope) for (const l of r.legs) if (shLeg(l) && l.played) shLegs.set(`${r.date}-${l.playerId}-${l.prop}`, l);
  const shLegHits = [...shLegs.values()].filter((l) => l.hit).length;
  const shLegExp = [...shLegs.values()].reduce((a, l) => a + l.chancePct / 100, 0);
  const ratio = (h, e) => (e ? `${(h / e).toFixed(2)}x` : "—");
  const backfilledDates = dates.filter((d) => locks[d]?.lockedAt == null);
  const liveDates = dates.filter((d) => locks[d]?.lockedAt != null);
  const decided = inScope.filter((r) => r.result !== "void");
  const modeLabel = (k) => {
    const [m, prop] = k.split(":");
    const base = MODES.find((x) => x.key === m)?.label || m;
    return prop ? `${base} · ${PROPS[prop]?.emoji || prop}` : base;
  };

  return (
    <div>
      <div className="mono" style={{ fontSize: 11, ...muted, marginBottom: 10, lineHeight: 1.6 }}>
        Every Pairs mode is frozen about 20–45 minutes before each night's first puck drop (after that game's official lineups) and graded here
        against the box scores. A player who didn't play voids his leg, and the other leg settles as a single.
        {backfilledDates.length > 0 && (
          <> <b>{backfilledDates.map(shortDate).join(", ")}</b> are backfilled: today's Pairs logic run on that evening's pre-game pool, with no
          lineup news (Pairs started 10/14), so they include scratched players as void legs.</>
        )}
        {liveDates.length > 0 && <> Live locks: {liveDates.map(shortDate).join(", ")}.</>}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 10 }}>
        <div className="pill-row">
          {[{ key: "all", label: "All modes" }, ...MODES, ...PROP_LOCKS].map((m) => (
            <button key={m.key} className={`pill-btn ${mode === m.key ? "active" : ""}`} onClick={() => setMode(m.key)}>{m.label}</button>
          ))}
        </div>
        <select className="mono" value={date} onChange={(e) => setDate(e.target.value)} style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "4px 8px" }}>
          <option value="all">Whole season ({dates.length} nights)</option>
          {dates.map((d) => <option key={d} value={d}>{shortDate(d)}{locks[d]?.lockedAt == null ? " (backfilled)" : ""}</option>)}
        </select>
      </div>

      <div className="signal-board" style={{ marginBottom: 12 }}>
        <Tile label="Pairs hit / expected" value={`${s.hits} / ${s.exp.toFixed(1)}`} sub={`${s.n} pairs graded${s.voids ? ` · ${s.voids} void` : ""}`} />
        <Tile label="Hit rate" value={pctS(s.hits, s.n)} sub={`the pairs said ${s.n ? Math.round((s.exp / s.n) * 100) : 0}% on average`} />
        <Tile label="Hits vs expected" value={s.exp ? `${(s.hits / s.exp).toFixed(2)}x` : "—"} sub={s.exp ? `±${(1.96 / Math.sqrt(s.exp)).toFixed(2)} (95%, rough)` : ""} />
        <Tile label="Priced pairs (units)" value={s.priced ? `${s.units >= 0 ? "+" : ""}${s.units.toFixed(1)}u` : "—"} sub={s.priced ? `${s.priced} with a book parlay price · ROI ${Math.round((s.units / s.priced) * 100)}%` : "goal + goal pairs with odds only"} />
        <Tile label="▲🔁 Soft D + H2H A/A+ legs" value={`${shLegHits} / ${shLegExp.toFixed(1)}`}
          sub={`${shLegs.size} legs hit vs expected (${ratio(shLegHits, shLegExp)}) · pairs with both: ${shBoth.hits} / ${shBoth.exp.toFixed(1)} · 1+ leg hit in ${shAny.hits} of ${shAny.n} (exp ${shAny.exp.toFixed(1)}, ${ratio(shAny.hits, shAny.exp)})`} />
        <Tile label="One leg void" value={decided.filter((r) => r.oneLegVoid).length} sub="settled on the other leg" />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
        <GroupTable title="By chance both hit (calibration)" label="Said" rows={inScope.filter((r) => r.result !== "void")}
          order={BUCKETS.map(bucketLabel)} keyOf={(r) => bucketLabel(BUCKETS.find(([lo, hi]) => r.chancePct >= lo && r.chancePct < hi))} />
        <GroupTable title="By prop combination" label="Props" rows={inScope} keyOf={(r) => COMBO_LABEL[propCombo(r)] || propCombo(r)} />
        <GroupTable title={mode === "all" ? "By mode" : "By section"} label={mode === "all" ? "Mode" : "Section"} rows={inScope}
          keyOf={(r) => (mode === "all" ? modeLabel(r.mode) : r.section)} />
        <GroupTable title="By ★ rank (gold best pairs)" label="Rank" rows={inScope} order={["★ Top 3", "★ 4–5", "Not starred"]}
          keyOf={(r) => (r.starRank && r.starRank <= 3 ? "★ Top 3" : r.starRank ? "★ 4–5" : "Not starred")} />
        <GroupTable title="By ▲🔁 soft D + H2H A/A+ legs (watch only)" label="Legs" rows={modeScope}
          order={["Both legs", "1 leg", "Neither", "No H2H data"]}
          keyOf={(r) => (!hasH2H(r) ? "No H2H data" : ["Neither", "1 leg", "Both legs"][shCount(r)])} />
        <GroupTable title="By relationship" label="Legs" rows={inScope}
          keyOf={(r) => ({ diff: "Different games", team: "Teammates", opp: "Opponents" }[r.rel])} />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        <div className="pill-row">
          {[["all", "All"], ["hit", "✅ Hit"], ["miss", "✗ Miss"], ["void", "Void"]].map(([k, l]) => (
            <button key={k} className={`pill-btn ${result === k ? "active" : ""}`} onClick={() => setResult(k)}>{l}</button>
          ))}
        </div>
        <div className="pill-row" title="Legs vs a top-third-softest defense with an H2H grade of A/A+ — tracked as a watch, not used in any pick (4-season test: at most a small edge)">
          {SH_FILTERS.map(([k, l]) => (
            <button key={k} className={`pill-btn ${sh === k ? "active" : ""}`} onClick={() => setSh(k)}>{l}</button>
          ))}
        </div>
      </div>
      {sh !== "all" && <div className="mono" style={{ fontSize: 10, ...muted, marginBottom: 6 }}>
        Tiles and tables above now show only pairs with {sh === "2" ? "both legs" : "1+ leg"} soft D + H2H A/A+. H2H letters: stored at lock from 10/18, rebuilt
        from each night's pre-game H2H file for 10/5–10/17, none before 10/5.
      </div>}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr><th>Pair</th><th>Date</th><th>Mode · #</th><th>Section</th><th>Both hit</th><th>Result</th><th>Price</th><th>Units</th></tr>
          </thead>
          <tbody>
            {shown.slice(0, 400).map((r) => (
              <tr key={`${r.date}-${r.mode}-${r.key}`}>
                <td style={{ minWidth: 220 }}>
                  {r.legs.map((l) => (
                    <div key={l.playerId + l.prop} style={{ whiteSpace: "nowrap" }}>
                      <span style={{ color: l.hit ? "var(--accent2)" : "var(--muted)" }}>{l.played ? (l.hit ? "✅" : "✗") : "∅"}</span>{" "}
                      <span className="player-name-link" style={{ cursor: "pointer" }} onClick={() => openSkaterSlide({ playerId: l.playerId, name: l.name, team: l.team })}>{l.name}</span>
                      <span className="mono" style={{ fontSize: 10, ...muted }}> {PROPS[l.prop]?.emoji} {l.chancePct}% · {legStat(l)}</span>
                      {shLeg(l) && <span className="mono" title={`Soft defense + H2H ${l.h2h}`} style={{ fontSize: 10, color: "var(--accent2)" }}> ▲🔁{l.h2h}</span>}
                    </div>
                  ))}
                </td>
                <td className="mono">{shortDate(r.date)}</td>
                <td className="mono" style={{ fontSize: 10 }}>{modeLabel(r.mode)} #{r.rank}{r.starRank ? <span style={{ color: "#d4af37", fontWeight: 700 }}> ★{r.starRank}</span> : null}</td>
                <td style={{ fontSize: 11 }}>{r.section}</td>
                <td className="mono">{r.chancePct}%</td>
                <td className="mono" style={{ color: r.result === "hit" ? "var(--accent2)" : undefined, fontWeight: r.result === "hit" ? 700 : 400 }}>
                  {r.result === "hit" ? "✅ Hit" : r.result === "miss" ? "✗ Miss" : "Void"}{r.oneLegVoid && r.result !== "void" ? " (1 leg void)" : ""}
                </td>
                <td className="mono" style={{ fontSize: 10 }}>{r.parlay ? `${fmtAmerican(r.parlay.american)} ${r.parlay.book}` : propCombo(r) === "goal+goal" ? `fair ${fmtAmerican(r.fair)}` : "—"}</td>
                <td className="mono">{r.units == null ? "—" : `${r.units >= 0 ? "+" : ""}${r.units.toFixed(2)}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown.length > 400 && <div className="mono" style={{ fontSize: 10, ...muted }}>Showing 400 of {shown.length} — pick a night or mode to narrow.</div>}
    </div>
  );
}
