import { useEffect, useMemo, useState } from "react";
import { openSkaterSlide } from "../slideouts.js";
import { MODES, PROPS } from "../lib/pairs.js";
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

  useEffect(() => {
    fetch("/data/track_record_2026.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch((e) => setError(String(e.message || e)));
  }, []);

  const all = useMemo(() => data?.pairRows || [], [data]);
  const dates = useMemo(() => [...new Set(all.map((r) => r.date))].sort().reverse(), [all]);
  const locks = data?.pairLocks || {};
  const inScope = useMemo(() => all.filter((r) => (mode === "all" || r.mode === mode) && (date === "all" || r.date === date)), [all, mode, date]);
  const shown = useMemo(() => inScope.filter((r) => result === "all" || r.result === result)
    .sort((a, b) => (a.date === b.date ? a.mode.localeCompare(b.mode) || a.rank - b.rank : b.date.localeCompare(a.date))), [inScope, result]);

  if (error) return <div className="mono" style={muted}>Couldn't load the track record ({error}).</div>;
  if (!data) return <div className="mono" style={muted}>Loading…</div>;
  if (!all.length) return <div className="mono" style={muted}>No locked pairs graded yet — the first lock happens before tonight's first puck drop, graded the next morning.</div>;

  const s = stats(inScope);
  const backfilledDates = dates.filter((d) => locks[d]?.lockedAt == null);
  const liveDates = dates.filter((d) => locks[d]?.lockedAt != null);
  const decided = inScope.filter((r) => r.result !== "void");
  const modeLabel = (k) => MODES.find((m) => m.key === k)?.label || k;

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
          {[{ key: "all", label: "All modes" }, ...MODES].map((m) => (
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
        <Tile label="One leg void" value={decided.filter((r) => r.oneLegVoid).length} sub="settled on the other leg" />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
        <GroupTable title="By chance both hit (calibration)" label="Said" rows={inScope.filter((r) => r.result !== "void")}
          order={BUCKETS.map(bucketLabel)} keyOf={(r) => bucketLabel(BUCKETS.find(([lo, hi]) => r.chancePct >= lo && r.chancePct < hi))} />
        <GroupTable title="By prop combination" label="Props" rows={inScope} keyOf={(r) => COMBO_LABEL[propCombo(r)] || propCombo(r)} />
        <GroupTable title={mode === "all" ? "By mode" : "By section"} label={mode === "all" ? "Mode" : "Section"} rows={inScope}
          keyOf={(r) => (mode === "all" ? modeLabel(r.mode) : r.section)} />
        <GroupTable title="By relationship" label="Legs" rows={inScope}
          keyOf={(r) => ({ diff: "Different games", team: "Teammates", opp: "Opponents" }[r.rel])} />
      </div>

      <div className="pill-row" style={{ marginBottom: 8 }}>
        {[["all", "All"], ["hit", "✅ Hit"], ["miss", "✗ Miss"], ["void", "Void"]].map(([k, l]) => (
          <button key={k} className={`pill-btn ${result === k ? "active" : ""}`} onClick={() => setResult(k)}>{l}</button>
        ))}
      </div>
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
                    </div>
                  ))}
                </td>
                <td className="mono">{shortDate(r.date)}</td>
                <td className="mono" style={{ fontSize: 10 }}>{modeLabel(r.mode)} #{r.rank}</td>
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
