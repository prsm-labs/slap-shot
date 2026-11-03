import { useMemo } from "react";
import { useScoredPool } from "../lib/data.js";
import { openSkaterSlide } from "../slideouts.js";
import PickButton from "../components/PickButton.jsx";
import PlayerAvatar from "../components/PlayerAvatar.jsx";
import MatchupFilter from "../components/MatchupFilter.jsx";
import PositionFilter from "../components/PositionFilter.jsx";
import { filterPositions, usePosition } from "../lib/positionFilter.js";
import { filterPlayers, useMatchup } from "../lib/matchupFilter.js";
import { useListFilters } from "../lib/listFilters.js";
import { multiLabel, useMulti } from "../lib/multi.js";
import { OppDefBadge } from "../lib/oppDef.jsx";

// 🎯 Multi-point (2026-11-03): Scouting view + the Cheat Sheets cards (MultiCard). lib/multi.js has the rules; build_multi.py the record.
const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const muted = { color: "var(--muted)" };
const RESULT = { hit: "✅", miss: "✗", void: "DNP" };
const TITLE = { PTS: "🎯 2+ Points", A: "🍎 2+ Assists" };

function hitOf(f) {
  const a = f.p?.actual;
  if (!a || a.played === false) return null;
  const v = f.stat === "A" ? a.a : a.p;
  return v == null ? null : v >= f.line;
}
const resultOf = (f) => (f.result ? `${RESULT[f.result]}${f.actual != null ? ` ${f.actual}` : ""}` : (() => { const ok = hitOf(f); return ok == null ? "" : ok ? "✅" : "✗"; })());

export function multiSub(k, data) {
  const L = data?.lists?.[k], bt = L?.backtest, R = L?.rule;
  if (!bt) return k === "PTS" ? "2+ points, 20%+ tonight, ranked by how far tonight beats his last 20" : "2+ assists, 12%+ tonight, ranked by how far tonight beats his last 20";
  return `${R.line}+ ${k === "A" ? "assists" : "points"} at ${pct(R.minChance)}+ tonight, ranked by how far tonight beats his last 20. `
    + `Backtest: ${pct(bt.hits / bt.n)} hit (said ${pct(bt.said)}) vs their own ${pct(bt.own)}, league ${pct(bt.league)}`;
}

export function MultiCard({ k, picks, data, meta }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{TITLE[k]} — beyond his usual</div>
      <div className="mono" style={{ fontSize: 10, ...muted, marginBottom: 10 }}>{multiSub(k, data)} · Scouting → 🎯 Multi-point</div>
      {picks.length === 0 && <div className="mono" style={{ fontSize: 11, ...muted }}>Nobody matches tonight.</div>}
      {picks.map((f, i) => (
        <div key={f.playerId} className="clickable" onClick={() => openSkaterSlide(f.p)}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--line2)", cursor: "pointer", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span className="mono" style={{ fontSize: 10, ...muted }}>{i + 1}.</span>
            <PlayerAvatar playerId={f.playerId} name={f.p.name} team={f.p.team} size={26} />
            <div style={{ minWidth: 0 }}>
              <div className="mono" style={{ fontSize: 12 }}>{f.p.name} <span style={muted}>({f.p.team})</span> <PickButton player={f.p} />{meta && <> <OppDefBadge p={f.p} meta={meta} /></>}</div>
              <div className="mono" style={{ fontSize: 9, ...muted }}>{multiLabel(f)} · had it in {f.hits} of his last {f.n}</div>
            </div>
          </div>
          <span className="mono" style={{ fontWeight: 700, fontSize: 12, flexShrink: 0, textAlign: "right" }}>
            {pct(f.chance)}<div style={{ fontSize: 9, fontWeight: 400, ...muted }}>his {pct(f.own)} {resultOf(f)}</div>
          </span>
        </div>
      ))}
    </div>
  );
}

export default function MultiTab() {
  const pool = useScoredPool();
  const selected = useMatchup();
  const position = usePosition();
  useListFilters(); // re-render on the header search (applied in filterPlayers)
  const past = Boolean(pool?.past);
  const date = pool?.meta?.slateDate;
  const players = useMemo(() => (pool?.players ? filterPositions(filterPlayers(pool.players, selected), position) : null), [pool, selected, position]);
  const { lists, data, loading } = useMulti(players, past, date);
  const recent = (data?.nights || []).filter((n) => [...n.PTS, ...n.A].some((f) => f.result)).slice(-7).reverse();
  return (
    <div>
      <div className="section-header">
        <div className="section-title">🎯 Multi-point</div>
        <div className="section-sub">The 2+ point and 2+ assist nights his game log doesn't show yet</div>
      </div>
      <div className="note">
        🎯 A point is an everyday line for the regulars — the price is in the <b>2+ points</b> and <b>2+ assists</b>. These lists take every
        skater's 2+ line on the 🎚️ Risk Slider and keep the 5 where tonight's chance beats how often he hit it in his last 20 by the most.
        {data?.lists && ["PTS", "A"].map((k) => {
          const bt = data.lists[k].backtest, r = data.record?.[k]?.all;
          return <span key={k}> <b>{TITLE[k]}</b>: backtest 2023-24 to 2025-26 {pct(bt.hits / bt.n)} of {bt.n.toLocaleString()} hit (said {pct(bt.said)}) vs their own {pct(bt.own)} and a league rate of {pct(bt.league)}
            {r?.n > 0 && <>; this season (replayed from the locked snapshots) {r.hits}/{r.n} (said {pct(r.said)})</>}.</span>;
        })}
        {" "}Ranked by the top chance instead, it's the stars, who hit these about as often as they always do. Not a lock.
      </div>
      <PositionFilter />
      <MatchupFilter />
      {loading || !players ? <div className="note">Loading…</div> : (
        <div className="grid-cards">
          {["PTS", "A"].map((k) => <MultiCard key={k} k={k} picks={lists[k]} data={data} meta={pool?.meta} />)}
        </div>
      )}
      {recent.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary className="mono" style={{ fontSize: 11, cursor: "pointer" }}>Recent nights</summary>
          {recent.map((n) => (
            <div key={n.date} className="mono" style={{ fontSize: 10, padding: "4px 0", borderBottom: "1px solid var(--line2)" }}>
              <b>{Number(n.date.slice(5, 7))}/{Number(n.date.slice(8, 10))}</b>{n.replay ? " (replay)" : ""}
              {["PTS", "A"].map((k) => {
                const g = n[k].filter((f) => f.result === "hit" || f.result === "miss");
                return <span key={k}> · {k === "A" ? "2+ A" : "2+ pts"} {g.filter((f) => f.result === "hit").length}/{g.length}
                  <span style={muted}> {n[k].map((f) => `${RESULT[f.result] || "…"} ${f.name} ${pct(f.chance)}`).join(", ")}</span></span>;
              })}
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
