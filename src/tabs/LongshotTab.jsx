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
import { posWord, useLongshot } from "../lib/longshot.js";
import { OppDefBadge } from "../lib/oppDef.jsx";

// 🎯 Long-shot creators (2026-11-07): Scouting view + the Cheat Sheets card (LongshotCard). lib/longshot.js has the rule;
// build_longshot.py the record.
const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const muted = { color: "var(--muted)" };
const RESULT = { hit: "✅", miss: "✗", void: "DNP" };

function resultOf(f) {
  if (f.result) return `${RESULT[f.result]}${f.result === "hit" && f.actual > 1 ? ` ${f.actual}` : ""}`;
  const a = f.p?.actual;
  if (!a || a.played === false || a.g == null) return "";
  return a.g >= 1 ? "✅" : "✗";
}

export function LongshotCard({ picks, data, meta, limit, foot = true }) {
  const rows = limit ? picks.slice(0, limit) : picks;
  const r = data?.record?.all;
  return (
    <div className="card">
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>🎯 Long-shot creators</div>
      <div className="mono" style={{ fontSize: 10, ...muted, marginBottom: 10 }}>
        Goal at 12-30% tonight, ranked by his own xG per 60 lately vs his position.
        {data?.backtest && <> Backtest {pct(data.backtest.hits / data.backtest.n)} scored (said {pct(data.backtest.said)})</>}
        {r?.n > 0 && <>; this season {r.hits}/{r.n} (said {pct(r.said)})</>}. About 1 in 5 — not an edge on the price.
        {foot && " · Scouting → 🎯 Long-shot creators"}
      </div>
      {rows.length === 0 && <div className="mono" style={{ fontSize: 11, ...muted }}>Nobody matches tonight.</div>}
      {rows.map((f, i) => (
        <div key={f.playerId} className="clickable" onClick={() => f.p && openSkaterSlide(f.p)}
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--line2)", cursor: "pointer", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span className="mono" style={{ fontSize: 10, ...muted }}>{i + 1}.</span>
            <PlayerAvatar playerId={f.playerId} name={f.p?.name || f.name} team={f.p?.team || f.team} size={26} />
            <div style={{ minWidth: 0 }}>
              <div className="mono" style={{ fontSize: 12 }}>{f.p?.name || f.name} <span style={muted}>({f.p?.team || f.team} · {f.pos})</span>
                {f.p && <> <PickButton player={f.p} /></>}{meta && f.p && <> <OppDefBadge p={f.p} meta={meta} /></>}</div>
              <div className="mono" style={{ fontSize: 9, ...muted }}>
                xG/60 {f.x60.toFixed(2)} (#{f.rank} of {f.of} {posWord(f)}) · SOG/60 {f.s60.toFixed(1)} · last ~120 min
              </div>
            </div>
          </div>
          <span className="mono" style={{ fontWeight: 700, fontSize: 12, flexShrink: 0, textAlign: "right" }}>
            {pct(f.chance)}<div style={{ fontSize: 9, fontWeight: 400, ...muted }}>goal {resultOf(f)}</div>
          </span>
        </div>
      ))}
    </div>
  );
}

export default function LongshotTab() {
  const pool = useScoredPool();
  const selected = useMatchup();
  const position = usePosition();
  useListFilters(); // re-render on the header search (applied in filterPlayers)
  const past = Boolean(pool?.past);
  const date = pool?.meta?.slateDate;
  const players = useMemo(() => (pool?.players ? filterPositions(filterPlayers(pool.players, selected), position) : null), [pool, selected, position]);
  const { picks, data, loading } = useLongshot(pool?.players, players, past, date);
  const bt = data?.backtest;
  const recentNights = (data?.nights || []).filter((n) => n.picks.some((f) => f.result)).slice(-7).reverse();
  return (
    <div>
      <div className="section-header">
        <div className="section-title">🎯 Long-shot creators</div>
        <div className="section-sub">Real goal chances the lists bury: the skaters creating the most lately for their position</div>
      </div>
      <div className="note">
        🎯 Sorted by chance, the goal lists are all top-line forwards; a defenseman or depth forward at 15-25% sits 100+ rows down. This list
        keeps skaters at a <b>12-30%</b> goal chance tonight and ranks them by their own <b>expected goals per 60</b> over their last ~120
        minutes on ice — shot volume times shot danger, the "shooting a lot from good spots" read — against the other
        D-men or forwards on the slate.
        {bt && <> Backtest 2022-23 to 2025-26: {pct(bt.hits / bt.n)} of {bt.n.toLocaleString()} scored (we said {pct(bt.said)}), {pct(bt.dShare)} defensemen.</>}
        {data?.record?.all?.n > 0 && <> This season (replayed from the locked snapshots): {data.record.all.hits}/{data.record.all.n} (said {pct(data.record.all.said)}).</>}
        {" "}That recent xG is already in the goal %, and on long shots the book has been a little sharper than us this season — so this
        finds the player, it doesn't beat the price. About 1 in 5. Not a lock.
      </div>
      <PositionFilter />
      <MatchupFilter />
      {loading || !players ? <div className="note">Loading…</div> : (
        <div className="grid-cards"><LongshotCard picks={picks} data={data} meta={pool?.meta} foot={false} /></div>
      )}
      {recentNights.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary className="mono" style={{ fontSize: 11, cursor: "pointer" }}>Recent nights</summary>
          {recentNights.map((n) => {
            const g = n.picks.filter((f) => f.result === "hit" || f.result === "miss");
            return (
              <div key={n.date} className="mono" style={{ fontSize: 10, padding: "4px 0", borderBottom: "1px solid var(--line2)" }}>
                <b>{Number(n.date.slice(5, 7))}/{Number(n.date.slice(8, 10))}</b>{n.replay ? " (replay)" : ""} · {g.filter((f) => f.result === "hit").length}/{g.length}
                <span style={muted}> {n.picks.map((f) => `${RESULT[f.result] || "…"} ${f.name} ${pct(f.chance)}`).join(", ")}</span>
              </div>
            );
          })}
        </details>
      )}
    </div>
  );
}
