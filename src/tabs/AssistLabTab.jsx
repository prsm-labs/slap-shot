import { useEffect, useMemo, useState } from "react";
import { useScoredPool } from "../lib/data.js";
import { useSort } from "../lib/useSort.js";
import { openSkaterSlide } from "../slideouts.js";
import PickButton from "../components/PickButton.jsx";
import PlayerAvatar from "../components/PlayerAvatar.jsx";
import OpponentGoalieCell from "../components/OpponentGoalieCell.jsx";
import { OppDefCell, OPP_DEF_NOTE, oppDefSort } from "../lib/oppDef.jsx";
import MatchupFilter from "../components/MatchupFilter.jsx";
import ListFilters from "../components/ListFilters.jsx";
import { applyListFilters, useListFilters, usePickSets } from "../lib/listFilters.js";
import PositionFilter from "../components/PositionFilter.jsx";
import { filterPositions, positionLabel, usePosition } from "../lib/positionFilter.js";
import { fmtToi } from "../lib/toi.js";
import { filterPlayers, useMatchup } from "../lib/matchupFilter.js";
import { useH2HGrades, withH2H } from "../lib/h2h.js";
import { LineTag } from "../components/LineupBadge.jsx";
import L120Cell from "../components/L120Cell.jsx";
import GamblyButton from "../components/GamblyButton.jsx";
import { HitStrip } from "../components/RiskBoard.jsx";
import { useLabBand } from "../lib/labBand.jsx";
import { formBefore, ladderFor, recentOf } from "../lib/lineBoard.js";
import { tierFor } from "../lib/slapScore.js";
import { assistShare } from "../lib/calibration.js";
import { LIST_MAX } from "../lib/listMax.js";

// 🅰️ Assist Lab (2026-11-17, user: a dedicated assist page in Scouting -- A/60 L120 plus season A/60 and A/GP, singling out the best
// players for 1+ AND 2+ / 3+ assists, with an assist score like the Slap Score).
// Numbers: 1+ A % = the calibrated grade-model assist chance (opponent, goalie, ice-time trend already in it). 2+ / 3+ A % = the same
// chance priced on the Risk Slider ladder (lib/lineBoard.js: Poisson tail -> isotonic map -> his own last-20 hit rate).
// Assist Score = where tonight's slate ranks his 1+ A %, 0-99 (same scale + tiers as the Slap Score).
// Live replay 9/29-11/16 (46 nights, 11,276 skater-games): assist chance said 24.7% / happened 24.4%; Assist Score 90+ 52.3% got an
// assist (2+ 16.3%), 70-89 31.2% (6.1%), 50-69 22.7% (2.7%), under 50 14.6% (1.3%). 2+ A ladder said 5.5% / happened 5.2%,
// 3+ A 3.6% / 3.1% (bands within ~1 pt; the thin 25%+ 2+ A band said 33%, hit 24%, n 66). A/60 (recent or season) and A/GP are
// context: recent assist / point rates added nothing over the chance in the 11/12 test (REPORT_PointsAssists_Drivers_2026-11-12.md).

const SEASON_FILE = "/data/stats_2026-27.json";
const SHOWN = new Set(["a120"]);

function isRoleEligible(p) {
  return p.isEligible !== false && (p.games_played || 0) >= 10;
}

function useJson(url) {
  const [d, setD] = useState(undefined);
  useEffect(() => {
    let alive = true;
    fetch(url, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).then((x) => alive && setD(x)).catch(() => alive && setD(null));
    return () => { alive = false; };
  }, [url]);
  return d;
}

// this season's assists / games / minutes / PP points from the Stats tab game logs (before the slate date on a past night)
function seasonAssists(S, date) {
  const out = new Map();
  if (!S?.players) return out;
  const ix = Object.fromEntries(S.player_cols.map((c, i) => [c, i]));
  for (const [id, pl] of Object.entries(S.players)) {
    let gp = 0, a = 0, toi = 0, ppp = 0;
    for (const r of pl.g || []) {
      if (!(Number(r[ix.toi]) > 0)) continue;
      if (date && r[ix.d] >= date) continue;
      gp += 1; a += Number(r[ix.a]) || 0; toi += Number(r[ix.toi]) || 0; ppp += Number(r[ix.ppp]) || 0;
    }
    if (gp) out.set(Number(id), { gp, a, aGp: a / gp, a60: toi > 0 ? (a * 60) / toi : null, ppp });
  }
  return out;
}

function exportCsv(rows, filename) {
  const header = ["name", "team", "position", "opponentGoalie", "assistScore", "assistShare", "assist1Pct", "assist2Pct", "assist3Pct", "aGp", "a60", "a60L120", "seasonGp"];
  const lines = [header.join(",")];
  for (const p of rows) {
    lines.push([p.name, p.team, p.position, p.opponentGoalie || "", p.assistScore, p.aShare ?? "", p.a1, p.a2 ?? "", p.a3 ?? "", p.aGp?.toFixed(2) ?? "", p.a60?.toFixed(2) ?? "", p.a120 ?? "", p.sGp ?? ""]
      .map((v) => `"${v}"`).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const pct1 = (x) => (x == null ? null : Math.round(x * 1000) / 10);
const fmtPct = (v) => (v == null ? "—" : `${v}%`);

export default function AssistLabTab() {
  const live = useScoredPool();
  const board = useJson("/data/line_board.json");
  const season = useJson(SEASON_FILE);
  const selected = useMatchup();
  const position = usePosition();
  const listFilters = useListFilters();
  const h2hGrades = useH2HGrades();
  const pickSets = usePickSets(live);
  const band = useLabBand("A", live);
  const past = Boolean(live?.past);
  const date = live?.meta?.slateDate;

  // every slate skater with an assist chance: 1+ / 2+ / 3+ A, Assist Score (slate rank), season + recent rates
  const rows = useMemo(() => {
    if (!live?.players) return null;
    const sa = seasonAssists(season, past ? date : null);
    const base = live.players.filter(isRoleEligible).map((p) => {
      const a1 = p.modelProbs?.assist ?? (p.modelAssistPct != null ? p.modelAssistPct / 100 : null);
      if (a1 == null) return null;
      const f0 = board?.form?.[p.playerId];
      const form = past ? formBefore(f0, date) : f0;
      const lad = board?.model && form && form.s.length >= board.model.min_games ? ladderFor({ A: a1 }, form, board.model).A || [] : [];
      const at = (T) => { const r = lad.find(([t]) => t === T); return r ? r[1] : null; };
      const own2 = form?.a?.length ? form.a.filter((v) => v >= 2).length : null;
      const s = sa.get(p.playerId);
      const spec = p.modelProbs?.aSpec ?? assistShare(p);
      return {
        aShare: spec ? Math.round(spec.share * 100) : null, kind: spec?.kind || null,
        ...p, _a1: a1, a1: pct1(a1), a2: pct1(at(2)), a3: pct1(at(3)), own2, ownN: form?.a?.length || 0,
        sGp: s?.gp ?? null, aGp: s?.aGp ?? null, a60: s?.a60 ?? null, ppp: s?.ppp ?? null,
        recentA: form ? recentOf(form).slice(-10) : [],
      };
    }).filter(Boolean);
    const sorted = [...base].sort((x, y) => x._a1 - y._a1);
    const rank = new Map(sorted.map((p, i) => [p.playerId, sorted.length > 1 ? Math.round((99 * i) / (sorted.length - 1)) : 50]));
    return base.map((p) => ({ ...p, assistScore: rank.get(p.playerId), assistTier: tierFor(rank.get(p.playerId)) }));
  }, [live, board, season, past, date]);

  const filtered = useMemo(() => {
    const inGame = applyListFilters(filterPositions(filterPlayers(rows, selected), position), listFilters, { slate: live?.players, signal: "point", h2h: h2hGrades.skaters, picks: pickSets, meta: live?.meta });
    return withH2H(inGame || [], h2hGrades).map((p) => ({ ...p, oppD: oppDefSort(p, live?.meta) }));
  }, [rows, selected, position, listFilters, live, h2hGrades, pickSets]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const banded = useMemo(() => filtered.map((p) => ({ ...p, _band: band.chance(p) })), [filtered, band.labLine, band.ready]);
  const { sorted, sortKey, sortDir, toggleSort } = useSort(banded, "a1", "desc");
  const stripLine = sortKey === "a3" ? 3 : sortKey === "a2" ? 2 : 1;

  // 2026-11-17 (user: the lab tops were the same stars as Lamp / Apple): the cards show playmakers only -- assists 2/3+ of his points
  // for a forward (D: ~5/6), the top third of his position. Live 46 nights: top 3 a night got an assist 71.0% (said 65.2%, n 138);
  // never the same players as Lamp Lab's pure shooters.
  const plays = useMemo(() => filtered.filter((p) => p.kind === "playmaker"), [filtered]);
  const top1 = useMemo(() => [...plays].sort((a, b) => b._a1 - a._a1).slice(0, LIST_MAX), [plays]);
  const top2 = useMemo(() => [...plays].filter((p) => p.a2 != null).sort((a, b) => b.a2 - a.a2).slice(0, LIST_MAX), [plays]);
  const tiles = useMemo(() => {
    if (!filtered.length) return null;
    return {
      top1: Math.max(...filtered.map((p) => p.a1 || 0)),
      top2: Math.max(...filtered.map((p) => p.a2 || 0)),
      expected: filtered.reduce((s, p) => s + p._a1, 0),
      elite: filtered.filter((p) => p.assistScore >= 90).length,
    };
  }, [filtered]);

  const Th = ({ k, children, title, className = "" }) => (
    <th title={title} className={`${className} ${sortKey === k ? "sorted" : ""}`} onClick={() => toggleSort(k)}>
      {children}{sortKey === k ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
    </th>
  );

  const ReadCard = ({ p, big, sub }) => (
    <div className="read-card" onClick={() => openSkaterSlide(p)}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <PlayerAvatar playerId={p.playerId} name={p.name} team={p.team} size={36} />
        <div>
          <div className="mono" style={{ fontSize: 12, fontWeight: 700 }}>{p.name}</div>
          <div className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>{p.team} · {positionLabel(p.position)} · vs {p.opponentGoalie || "—"}</div>
        </div>
      </div>
      <div style={{ fontWeight: 800, fontSize: 24 }}>{big}</div>
      <div className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>{sub}</div>
    </div>
  );

  return (
    <div>
      <div className="section-header">
        <div className="section-title">🅰️ Assist Lab</div>
        <div className="section-sub">1+, 2+ and 3+ assist chances, Assist Score, and assist rates (season, per game, last ~120 minutes)</div>
      </div>

      <div className="note">
        1+ A % = the calibrated grade model's assist chance (opponent, goalie and ice-time trend already in it). 2+ / 3+ A % = the same chance
        priced on the Risk Slider ladder with his own last-20 record. This season so far (46 nights): assist chance said 24.7%, happened 24.4%;
        2+ A said 5.5% / happened 5.2%, 3+ A 3.6% / 3.1%. Assist Score = where tonight's slate ranks his 1+ A %, 0-99, like the Slap Score:
        90+ got an assist 52% of the time (2+ assists 16%), 70-89 31% (6%), 50-69 23% (3%), under 50 15% (1%). A/GP, A/60 and A/60 L120 are
        context: recent assist rates added nothing over the chance when tested. Since 11/17 the assist chance also knows his style: above 30%, playmakers
        (assists are a big share of their points) move up and pure shooters down -- held out it was better in every season 2022-26 and this season
        (at 30%+ shooters had been said 39.8% / got 37.0%, playmakers 45.0% / 47.9%). The top cards show 🅰️ playmakers only, so they aren't Lamp
        Lab's shooters again: this season the top 3 playmakers a night got an assist 71% of the time (said 65%).
      </div>

      <PositionFilter />
      <ListFilters shown={filtered.length} total={rows?.length ?? 0} base={filterPositions(filterPlayers(rows, selected), position)}
        ctx={{ slate: live?.players, signal: "point", h2h: h2hGrades.skaters, picks: pickSets, meta: live?.meta }} />
      <MatchupFilter />
      <div className="card" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1 }} />
        <button className="btn" onClick={() => exportCsv(sorted, "assist-lab.csv")} disabled={!sorted.length}>⬇ CSV</button>
      </div>

      {!rows && <div className="note" style={{ textAlign: "center" }}>Loading tonight's slate…</div>}

      {tiles && (
        <div className="signal-board">
          <div className="signal-tile"><div className="lbl">Top 1+ A %</div><div className="val">{tiles.top1}%</div></div>
          <div className="signal-tile"><div className="lbl">Top 2+ A %</div><div className="val">{tiles.top2 ? `${tiles.top2}%` : "—"}</div></div>
          <div className="signal-tile"><div className="lbl">Assist Score 90+</div><div className="val">{tiles.elite}</div></div>
          <div className="signal-tile"><div className="lbl">Expected assists</div><div className="val">{tiles.expected.toFixed(1)}</div></div>
        </div>
      )}

      {top1.length > 0 && (
        <>
          <div className="mono" style={{ fontSize: 11, color: "var(--muted)", margin: "4px 0 6px" }}>🅰️ Best playmakers · 1+ assist</div>
          <div className="top-reads">
            {top1.map((p) => <ReadCard key={p.playerId} p={p} big={`${p.a1}%`} sub={`${p.aShare}% of his points are assists · 2+ ${fmtPct(p.a2)} · ${p.aGp != null ? `${p.aGp.toFixed(2)} A/GP` : ""}`} />)}
          </div>
        </>
      )}
      {top2.length > 0 && (
        <>
          <div className="mono" style={{ fontSize: 11, color: "var(--muted)", margin: "4px 0 6px" }}>🅰️ Best playmakers · 2+ assists</div>
          <div className="top-reads">
            {top2.map((p) => <ReadCard key={p.playerId} p={p} big={`${p.a2}%`} sub={`2+ A in ${p.own2 ?? "—"} of his last ${p.ownN} · 3+ ${fmtPct(p.a3)} · 1+ ${p.a1}%`} />)}
          </div>
        </>
      )}

      {sorted.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <Th k="name">Skater</Th>
                <Th k="_band" className="tc-band">Chance at line</Th>
                <th>Opp Goalie</th>
                <Th k="oppD" title={OPP_DEF_NOTE}>Opp D</Th>
                <Th k="a1" className="tc-prim" title="Calibrated chance of 1+ assist tonight">1+ A %</Th>
                <Th k="a2" title="Chance of 2+ assists tonight (Risk Slider ladder)">2+ A %</Th>
                <Th k="a3" title="Chance of 3+ assists tonight (Risk Slider ladder)" className="tc-more">3+ A %</Th>
                <Th k="assistScore" title="Where tonight's slate ranks his 1+ A %, 0-99 (90+ = top 10%)">Assist Score</Th>
                <Th k="aShare" title="Assists as a share of his points, last season + this season. 🅰️ = playmaker (top third of his position), 🎯 = pure shooter (bottom third)">A share</Th>
                <Th k="aGp" title="Assists per game this season">A/GP</Th>
                <Th k="a60" title="Assists per 60 minutes this season">A/60</Th>
                <Th k="a120" title="Assists per 60 over the last ~120 minutes on ice, and vs the season rate" className={SHOWN.has("a120") ? "" : "tc-more"}>A/60 L120</Th>
                <th className="tc-more" title={`His last 10 games against ${stripLine}+ assists (green = hit it). Sort by 2+ / 3+ A % to switch.`}>L10 · {stripLine}+ A</th>
                <Th k="ppp" title="Power-play points this season" className="tc-more">PP pts</Th>
                <Th k="estToi" title="Expected ice time tonight">Est. TOI</Th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 60).map((p) => (
                <tr key={p.playerId} className={p.assistScore >= 90 ? "signal-row" : ""}>
                  <td className="clickable" onClick={() => openSkaterSlide(p)}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <PlayerAvatar playerId={p.playerId} name={p.name} team={p.team} size={28} />
                      <div>
                        <span className="player-name-link">{p.name}</span> <PickButton player={p} /> <GamblyButton text={`${p.name} (${p.team}) — 1+ Assist`} /><LineTag line={p.line} starting={p.startingLineup} />
                        <div className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>{p.team} · {positionLabel(p.position)} · {fmtToi(p.estToi)} TOI · {p.assistTier}</div>
                      </div>
                    </div>
                  </td>
                  <td className="tc-band">{band.render(p)}</td>
                  <td><OpponentGoalieCell player={p} /></td>
                  <OppDefCell p={p} meta={live?.meta} />
                  <td>{fmtPct(p.a1)}</td>
                  <td>{fmtPct(p.a2)}</td>
                  <td className="tc-more">{fmtPct(p.a3)}</td>
                  <td className="mono">{p.assistScore}</td>
                  <td className="mono" style={{ whiteSpace: "nowrap" }}>{p.aShare != null ? `${p.aShare}%` : "—"}{p.kind === "playmaker" ? " 🅰️" : p.kind === "shooter" ? " 🎯" : ""}</td>
                  <td className="mono">{p.aGp != null ? p.aGp.toFixed(2) : "—"}</td>
                  <td className="mono">{p.a60 != null ? p.a60.toFixed(2) : "—"}</td>
                  <L120Cell p={p} kind="a" className={SHOWN.has("a120") ? "" : "tc-more"} />
                  <td className="tc-more"><HitStrip recent={p.recentA} stat="A" line={stripLine} n={10} /></td>
                  <td className="mono tc-more">{p.ppp ?? "—"}</td>
                  <td className="mono">{fmtToi(p.estToi)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
