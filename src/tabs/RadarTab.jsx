import { useMemo } from "react";
import { useScoredPool } from "../lib/data.js";
import { openSkaterSlide } from "../slideouts.js";
import PickButton from "../components/PickButton.jsx";
import PlayerAvatar from "../components/PlayerAvatar.jsx";
import MatchupFilter from "../components/MatchupFilter.jsx";
import PositionFilter from "../components/PositionFilter.jsx";
import { filterPositions, positionLabel, usePosition } from "../lib/positionFilter.js";
import { filterPlayers, useMatchup } from "../lib/matchupFilter.js";
import { useListFilters } from "../lib/listFilters.js";
import { radarLabel, useRadar } from "../lib/radar.js";
import { OppDefBadge } from "../lib/oppDef.jsx";

// 🔦 Under the radar (2026-11-02): Scouting view + the Cheat Sheets card (RadarCard). lib/radar.js has the rule and the backtest.
const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const muted = { color: "var(--muted)" };
const RESULT = { hit: "✅", miss: "✗", void: "DNP" };

function hitOf(f) {
  const a = f.p?.actual;
  if (!a || a.played === false) return null;
  const v = { PTS: a.p, G: a.g, A: a.a }[f.stat];
  return v == null ? null : v >= f.line;
}

export function RadarCard({ picks, data, meta }) {
  const bt = data?.backtest;
  return (
    <div className="card">
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>🔦 Under the radar</div>
      <div className="mono" style={{ fontSize: 10, ...muted, marginBottom: 10 }}>
        A point / goal / assist he has had in 35% or fewer of his last 20 games, 40%+ tonight — ranked by how far tonight beats his usual.
        Backtest: {bt ? pct(bt.hits / bt.n) : "47%"} hit vs their own {bt ? pct(bt.own) : "28%"} · Scouting → Under the radar
      </div>
      {picks.length === 0 && <div className="mono" style={{ fontSize: 11, ...muted }}>Nobody matches tonight.</div>}
      {picks.map((f, i) => {
        const ok = hitOf(f);
        return (
          <div key={f.playerId} className="clickable" onClick={() => openSkaterSlide(f.p)}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--line2)", cursor: "pointer", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span className="mono" style={{ fontSize: 10, ...muted }}>{i + 1}.</span>
              <PlayerAvatar playerId={f.playerId} name={f.p.name} team={f.p.team} size={26} />
              <div style={{ minWidth: 0 }}>
                <div className="mono" style={{ fontSize: 12 }}>{f.p.name} <span style={muted}>({f.p.team})</span> <PickButton player={f.p} />{meta && <> <OppDefBadge p={f.p} meta={meta} /></>}</div>
                <div className="mono" style={{ fontSize: 9, ...muted }}>{radarLabel(f)} · had it in {f.hits} of his last {f.n}</div>
              </div>
            </div>
            <span className="mono" style={{ fontWeight: 700, fontSize: 12, flexShrink: 0, textAlign: "right" }}>
              {pct(f.chance)}<div style={{ fontSize: 9, fontWeight: 400, ...muted }}>his {pct(f.own)}{ok != null ? (ok ? " ✅" : " ✗") : ""}</div>
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function RadarTab() {
  const pool = useScoredPool();
  const selected = useMatchup();
  const position = usePosition();
  useListFilters(); // re-render on the header search (applied in filterPlayers)
  const past = Boolean(pool?.past);
  const date = pool?.meta?.slateDate;
  const players = useMemo(() => (pool?.players ? filterPositions(filterPlayers(pool.players, selected), position) : null), [pool, selected, position]);
  const { picks, data, loading } = useRadar(players, past, date);
  const bt = data?.backtest, rec = data?.record;
  const recent = (data?.nights || []).filter((n) => n.picks.some((f) => f.result)).slice(-7).reverse();
  return (
    <div>
      <div className="section-header">
        <div className="section-title">🔦 Under the radar</div>
        <div className="section-sub">Skaters whose numbers say tonight, before their hit rate does</div>
      </div>
      <div className="note">
        🔦 A <b>point, goal or assist</b> a skater has had in <b>35% or fewer of his last 20 games</b> — so it doesn't jump off his game log —
        that Slap Shot gives a <b>40%+ chance tonight</b>. One line per skater, the 5 where tonight beats his usual by the most.
        {bt && <> Backtest 2023-24 to 2025-26: <b>{pct(bt.hits / bt.n)}</b> of {bt.n.toLocaleString()} hit (said {pct(bt.said)}) while those skaters
          had cleared the same line {pct(bt.own)} of the time; the top-5 goal list hit {pct(bt.oldList.hits / bt.oldList.n)} vs their own {pct(bt.oldList.own)}.</>}
        {" "}Rising ice time / PP time are already in the chance (a boost on top didn't hold). Shown % = the 🎚️ Risk Slider chance.
        {rec?.all?.n > 0 && <> Since 10/5 (replayed from the locked snapshots, points and goals only): <b>{rec.all.hits}/{rec.all.n}</b> (said {pct(rec.all.said)}, their own {pct(rec.all.own)}).</>}
        {rec?.live?.n > 0 && <> Live since 11/3: <b>{rec.live.hits}/{rec.live.n}</b>.</>} Not a lock.
      </div>
      <PositionFilter />
      <MatchupFilter />
      {loading || !players ? <div className="note">Loading…</div> : picks.length === 0 ? <div className="note">Nobody under the radar matches tonight.</div> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr>
              <th>Player</th><th>Line</th><th>Tonight</th><th>His last {picks[0].n}</th><th>Above his usual</th>{past && <th>Result</th>}
            </tr></thead>
            <tbody>{picks.map((f) => {
              const ok = hitOf(f);
              return (
                <tr key={f.playerId}>
                  <td>
                    <div className="clickable" onClick={() => openSkaterSlide(f.p)} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <PlayerAvatar playerId={f.playerId} name={f.p.name} team={f.p.team} size={26} />
                      <div>
                        <span className="player-name-link">{f.p.name}</span> <PickButton player={f.p} />
                        <div className="mono" style={{ fontSize: 9, ...muted }}>{f.p.team} {f.p.isHome ? "vs" : "@"} {f.p.opponentTeam} · {positionLabel(f.p.position)}</div>
                      </div>
                    </div>
                  </td>
                  <td className="mono">{radarLabel(f)}</td>
                  <td className="mono"><b>{pct(f.chance)}</b></td>
                  <td className="mono">{f.hits}/{f.n} <span style={muted}>({pct(f.own)})</span></td>
                  <td className="mono">+{Math.round(f.lift * 100)} pts</td>
                  {past && <td className="mono">{f.result ? `${RESULT[f.result]}${f.actual != null ? ` ${f.actual}` : ""}` : ok == null ? "—" : ok ? "✅" : "✗"}</td>}
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
      {recent.length > 0 && (
        <details style={{ marginTop: 12 }}>
          <summary className="mono" style={{ fontSize: 11, cursor: "pointer" }}>Recent nights</summary>
          {recent.map((n) => {
            const g = n.picks.filter((f) => f.result === "hit" || f.result === "miss");
            return (
              <div key={n.date} className="mono" style={{ fontSize: 10, padding: "4px 0", borderBottom: "1px solid var(--line2)" }}>
                <b>{Number(n.date.slice(5, 7))}/{Number(n.date.slice(8, 10))}</b>{n.replay ? " (replay)" : ""} {g.filter((f) => f.result === "hit").length}/{g.length}
                <span style={muted}> {n.picks.map((f) => `${RESULT[f.result] || "…"} ${f.name} ${radarLabel(f)} ${pct(f.chance)}`).join(" · ")}</span>
              </div>
            );
          })}
        </details>
      )}
    </div>
  );
}
