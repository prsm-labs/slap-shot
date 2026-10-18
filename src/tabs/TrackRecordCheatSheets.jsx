import { useEffect, useMemo, useState } from "react";
import { openSkaterSlide } from "../slideouts.js";
import { fmtAmerican } from "../lib/bookOdds.js";

// Track Record — Cheat Sheets: each night's Cheat Sheets lists rebuilt from the locked pre-game snapshot
// (public/data/projections/<date>.json -> track_record_2026.json "rows"), same ranking as CheatSheetsTab.jsx:
//   Goal Candidates = top 5 by goal %, Point Candidates = top 5 by point %, Shots on Goal Candidates = top 5 by SOG/GP,
//   Best Value vs Book = goal % minus best-price implied >= 3 (top 5 by edge), Overvalued by Books = most negative edge.
// Ranked among skaters who played (Cheat Sheets hides OUT players and, once lineups are official, scratches), so a
// scratch never takes a slot. The page itself re-scores with live goalie / lineup news, so a list seen just before puck
// drop can differ slightly from the snapshot (taken at the last pipeline run before first puck).
// sogPg was added to snapshots on 10/18 from the pool committed with each one (9/29 has none).
const shortDate = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const muted = { color: "var(--muted)" };
const VALUE_EDGE = 3;
const TOP = 5;
const edgeOf = (r) => (r.proj.anytimeGoalPct != null && r.proj.bookImplied != null ? r.proj.anytimeGoalPct - r.proj.bookImplied : null);
const decimal = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / -a);

const LISTS = [
  {
    key: "goal", label: "🥅 Goal Candidates", short: "scored", since: null,
    pick: (rs) => rs.filter((r) => r.proj.anytimeGoalPct != null).sort((a, b) => b.proj.anytimeGoalPct - a.proj.anytimeGoalPct),
    chance: (r) => r.proj.anytimeGoalPct, hit: (a) => a.g >= 1, stat: (a) => `${a.g} G`, shown: (r) => `${r.proj.anytimeGoalPct}%`,
    note: "Through 10/4 the goal % was the old shot sim (ran about 1/3 low); from 10/5 the grade model.",
  },
  {
    key: "point", label: "🎯 Point Candidates", short: "got a point", since: "2026-10-05",
    pick: (rs) => rs.filter((r) => r.proj.anytimePointPct != null).sort((a, b) => b.proj.anytimePointPct - a.proj.anytimePointPct),
    chance: (r) => r.proj.anytimePointPct, hit: (a) => a.p >= 1, stat: (a) => `${a.p} P`, shown: (r) => `${r.proj.anytimePointPct}%`,
    note: "Point % was first saved on 10/5 (before that the list ranked on an Ice Sig + gGOAL blend that wasn't snapshotted).",
  },
  {
    key: "sog", label: "⚡ Shots on Goal Candidates", short: "had 3+ SOG", since: null,
    pick: (rs) => rs.filter((r) => r.proj.sogPg != null).sort((a, b) => b.proj.sogPg - a.proj.sogPg),
    chance: (r) => r.proj.modelSog3Pct ?? r.proj.plus3SogPct, hit: (a) => a.sog >= 3, stat: (a) => `${a.sog} SOG`, shown: (r) => `${r.proj.sogPg} SOG/GP`,
    note: "Ranked by season SOG per game (as on the page) and graded on 3+ shots on goal; expected = our 3+ SOG chance.",
  },
  {
    key: "value", label: "💰 Best Value vs Book", short: "scored", since: "2026-10-13", priced: true,
    pick: (rs) => rs.filter((r) => edgeOf(r) != null && edgeOf(r) >= VALUE_EDGE && r.proj.bookBest != null).sort((a, b) => edgeOf(b) - edgeOf(a)),
    chance: (r) => r.proj.anytimeGoalPct, hit: (a) => a.g >= 1, stat: (a) => `${a.g} G`, shown: (r) => `+${edgeOf(r).toFixed(1)} · ${fmtAmerican(r.proj.bookBest)}`,
    note: "Anytime goal, our chance at least 3 points above the best sportsbook price. Units = 1 unit on each at that best price. Odds started 10/13.",
  },
  {
    key: "over", label: "📉 Overvalued by Books", short: "scored", since: "2026-10-13", priced: true,
    pick: (rs) => rs.filter((r) => edgeOf(r) != null && edgeOf(r) < 0 && r.proj.bookBest != null).sort((a, b) => edgeOf(a) - edgeOf(b)),
    chance: (r) => r.proj.anytimeGoalPct, hit: (a) => a.g >= 1, stat: (a) => `${a.g} G`, shown: (r) => `${edgeOf(r).toFixed(1)} · ${fmtAmerican(r.proj.bookBest)}`,
    note: "The names to fade: the book priced them shorter than our chance. A fade works if they score LESS than the book said; units = 1 unit backing each (negative is good for the fade).",
  },
];

function Tile({ label, value, sub }) {
  return (
    <div className="signal-tile">
      <div className="lbl">{label}</div>
      <div className="val">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

// One night's list: top 5 from the snapshot, graded on the box score.
function nightList(list, rows) {
  const picks = list.pick(rows.filter((r) => r.proj && r.actual?.played)).slice(0, TOP);
  return picks.map((r) => {
    const hit = list.hit(r.actual);
    const units = list.priced ? (hit ? decimal(r.proj.bookBest) - 1 : -1) : null;
    return { r, hit, chance: (list.chance(r) ?? 0) / 100, bookChance: list.priced ? r.proj.bookImplied / 100 : null, units };
  });
}

export default function TrackRecordCheatSheets() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [listKey, setListKey] = useState("goal");
  const [date, setDate] = useState("all");

  useEffect(() => {
    fetch("/data/track_record_2026.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch((e) => setError(String(e.message || e)));
  }, []);

  const list = LISTS.find((l) => l.key === listKey);
  const nights = useMemo(() => {
    if (!data) return [];
    const byDate = new Map();
    for (const r of data.rows || []) {
      if (!byDate.has(r.date)) byDate.set(r.date, []);
      byDate.get(r.date).push(r);
    }
    return [...byDate.entries()]
      .filter(([d]) => !list.since || d >= list.since)
      .map(([d, rows]) => ({ date: d, picks: nightList(list, rows) }))
      .filter((n) => n.picks.length)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data, list]);

  if (error) return <div className="mono" style={muted}>Couldn't load the track record ({error}).</div>;
  if (!data) return <div className="mono" style={muted}>Loading…</div>;

  const scope = date === "all" ? nights : nights.filter((n) => n.date === date);
  const picks = scope.flatMap((n) => n.picks);
  const hits = picks.filter((p) => p.hit).length;
  const exp = picks.reduce((s, p) => s + p.chance, 0);
  const full = scope.filter((n) => n.picks.length === TOP);
  const perfect = full.filter((n) => n.picks.every((p) => p.hit)).length;
  const perfectExp = full.reduce((s, n) => s + n.picks.reduce((q, p) => q * p.chance, 1), 0);
  const zero = full.filter((n) => n.picks.every((p) => !p.hit)).length;
  const zeroExp = full.reduce((s, n) => s + n.picks.reduce((q, p) => q * (1 - p.chance), 1), 0);
  const units = picks.reduce((s, p) => s + (p.units ?? 0), 0);
  const bookExp = picks.reduce((s, p) => s + (p.bookChance ?? 0), 0);
  const pct = (h, n) => (n ? `${Math.round((h / n) * 100)}%` : "—");

  return (
    <div>
      <div className="mono" style={{ fontSize: 11, ...muted, marginBottom: 10, lineHeight: 1.6 }}>
        Each night's Cheat Sheets lists, rebuilt from the pre-game projection locked at the last update before first puck drop, ranked among
        skaters who played (the page hides OUT players and scratches), graded on the box score. The live page also follows late goalie
        and lineup news, so what you saw right before puck drop can differ slightly. {list.note}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 10 }}>
        <div className="pill-row">
          {LISTS.map((l) => (
            <button key={l.key} className={`pill-btn ${listKey === l.key ? "active" : ""}`} onClick={() => { setListKey(l.key); setDate("all"); }}>{l.label}</button>
          ))}
        </div>
        <select className="mono" value={date} onChange={(e) => setDate(e.target.value)} style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "4px 8px" }}>
          <option value="all">Whole season ({nights.length} nights)</option>
          {nights.map((n) => <option key={n.date} value={n.date}>{shortDate(n.date)}</option>)}
        </select>
      </div>

      {!picks.length ? (
        <div className="mono" style={muted}>Nothing graded for this list yet.</div>
      ) : (
        <>
          <div className="signal-board" style={{ marginBottom: 12 }}>
            <Tile label={`Players who ${list.short}`} value={`${hits} / ${picks.length}`} sub={`expected ${exp.toFixed(1)} (${(exp ? hits / exp : 0).toFixed(2)}x)`} />
            <Tile label="Hit rate" value={pct(hits, picks.length)} sub={`we said ${pct(exp, picks.length)} on average`} />
            <Tile label={`All ${TOP} hit`} value={`${perfect} night${perfect === 1 ? "" : "s"}`} sub={`expected ${perfectExp.toFixed(2)} of ${full.length}`} />
            <Tile label={`None of ${TOP} hit`} value={`${zero} night${zero === 1 ? "" : "s"}`} sub={`expected ${zeroExp.toFixed(2)} of ${full.length}`} />
            {list.priced && (
              <Tile label="Units (1u each, best price)" value={`${units >= 0 ? "+" : ""}${units.toFixed(1)}u`}
                sub={`book said ${bookExp.toFixed(1)} would score · ROI ${picks.length ? Math.round((units / picks.length) * 100) : 0}%`} />
            )}
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Night</th>{Array.from({ length: TOP }, (_, i) => <th key={i}>#{i + 1}</th>)}<th>Hit</th><th>Expected</th>{list.priced && <th>Units</th>}</tr>
              </thead>
              <tbody>
                {scope.map((n) => {
                  const h = n.picks.filter((p) => p.hit).length;
                  return (
                    <tr key={n.date}>
                      <td className="mono">{shortDate(n.date)}{n.picks.length === TOP && h === TOP ? " 🔥" : ""}</td>
                      {Array.from({ length: TOP }, (_, i) => {
                        const p = n.picks[i];
                        if (!p) return <td key={i} style={muted}>—</td>;
                        return (
                          <td key={i} style={{ cursor: "pointer", minWidth: 120 }} title={`${p.r.name} (${p.r.team} vs ${p.r.opp}) — ${list.shown(p.r)}, actual ${list.stat(p.r.actual)}`}
                            onClick={() => openSkaterSlide({ playerId: p.r.playerId, name: p.r.name, team: p.r.team })}>
                            <div>{p.hit ? "✅" : "✗"} {p.r.name}</div>
                            <div className="mono" style={{ fontSize: 10, ...muted }}>{list.shown(p.r)} · {list.stat(p.r.actual)}</div>
                          </td>
                        );
                      })}
                      <td className="mono">{h} / {n.picks.length}</td>
                      <td className="mono">{n.picks.reduce((s, p) => s + p.chance, 0).toFixed(2)}</td>
                      {list.priced && <td className="mono">{(() => { const u = n.picks.reduce((s, p) => s + p.units, 0); return `${u >= 0 ? "+" : ""}${u.toFixed(1)}`; })()}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
