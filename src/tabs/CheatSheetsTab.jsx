import { useMemo, useState } from "react";
import { useScoredPool } from "../lib/data.js";
import SlateStatus from "../components/SlateStatus.jsx";
import BreakoutTab from "./BreakoutTab.jsx";
import { openSkaterSlide, openGoalieSlide } from "../slideouts.js";
import PickButton from "../components/PickButton.jsx";
import H2HCell from "../components/H2HCell.jsx";
import PlayerAvatar from "../components/PlayerAvatar.jsx";
import GradeBadge from "../components/GradeBadge.jsx";
import MatchupFilter from "../components/MatchupFilter.jsx";
import PositionFilter from "../components/PositionFilter.jsx";
import LineupBadge from "../components/LineupBadge.jsx";
import { filterPositions, usePosition } from "../lib/positionFilter.js";
import { filterPlayers, matchupKey, useMatchup, inScope } from "../lib/matchupFilter.js";
import { lineupMaps, skaterStatus, startingGoalie, useLineups } from "../lib/lineups.js";
import { booksText, edgeText, fmtAmerican, fmtEdge, VALUE_EDGE } from "../lib/bookOdds.js";
import GamblyButton from "../components/GamblyButton.jsx";
import { betLine } from "../lib/gambly.js";
import PrismPicks from "../components/PrismPicks.jsx";
import { useListFilters } from "../lib/listFilters.js";
import { useRadar } from "../lib/radar.js";
import { RadarCard } from "./RadarTab.jsx";
import { OppDefBadge } from "../lib/oppDef.jsx";
import { useJson, useMulti } from "../lib/multi.js";
import ViewPicker from "../components/ViewPicker.jsx";
import { MultiCard } from "./MultiTab.jsx";
import ShortList from "../components/ShortList.jsx";
import { prismPicks, tierPicks } from "../lib/prismPicks.js";
import { radarLabel } from "../lib/radar.js";

// Home page: top-5 lists off the scored pool, plus today's starting goalies ranked by how
// attackable they are, all with tonight's lineup status (lib/lineups.js).
const LINEUP_FILTERS = [
  ["all", "All"],
  ["notOut", "Hide OUT"],
  ["official", "✅ Official lineup only"],
];

function GoalieStatus({ goalie }) {
  if (!goalie) return null;
  return goalie.confirmed
    ? <span title={`Confirmed starter (${goalie.source})`}>✅</span>
    : <span className="mono" title={goalie.source} style={{ fontSize: 9, color: "var(--muted)" }}>{goalie.status || "Projected"}</span>;
}

// prop = the bet the list is about (Gambly button): goal / point / sog3.
// 2026-10-23 past night (date picker): each row shows his real box line and ✅ / ✗ for the card's bet (prop).
const hitOf = (item, prop) => {
  const a = item.actual;
  if (!a || a.played === false) return null;
  if (prop === "point") return a.p >= 1;
  if (prop === "sog3") return a.sog >= 3;
  if (prop === "goal") return a.g >= 1;
  return null;
};
function ActualLine({ item, prop }) {
  const a = item.actual;
  if (!a) return null;
  if (a.played === false) return <div className="mono actual-line dnp">Final: did not play</div>;
  const ok = hitOf(item, prop);
  return <div className="mono actual-line">Final: {a.g} G · {a.a} A · {a.sog} SOG{a.toi ? ` · ${a.toi}` : ""}{ok != null && <span className={`hit-mark ${ok ? "hit" : "miss"}`}>{ok ? " ✅" : " ✗"}</span>}</div>;
}
// 2026-11-03 meta -> Soft D / Tough D badge (lib/oppDef.jsx)
function ListCard({ title, sub, items, renderRow, onClick, statusOf, oppGoalieOf, prop = "goal", meta }) {
  return (
    <div className="card">
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{title}</div>
      <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginBottom: 10 }}>{sub}</div>
      {items.length === 0 && <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>Nobody matches these filters yet.</div>}
      {items.map((item, i) => {
        const opp = oppGoalieOf?.(item);
        return (
          <div
            key={item.playerId}
            className="clickable"
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--line2)", cursor: "pointer", gap: 8 }}
            onClick={() => onClick(item)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>{i + 1}.</span>
              <PlayerAvatar playerId={item.playerId} name={item.name} team={item.team} size={26} />
              <div style={{ minWidth: 0 }}>
                <div className="mono" style={{ fontSize: 12 }}>
                  {item.name} <span style={{ color: "var(--muted)" }}>({item.team})</span>
                  {statusOf && <LineupBadge status={statusOf(item)} />} <PickButton player={item} /> <GamblyButton text={betLine(item, prop)} /> <H2HCell playerId={item.playerId} compact />{meta && <> <OppDefBadge p={item} meta={meta} /></>}
                </div>
                {opp && (
                  <div className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>
                    vs {opp.name} <GoalieStatus goalie={opp} /> {item.goalieGrade && opp.playerId === item.opponentGoalieId && <GradeBadge grade={item.goalieGrade} />}
                  </div>
                )}
                <ActualLine item={item} prop={prop} />
              </div>
            </div>
            <span className="mono" style={{ fontWeight: 700, fontSize: 12, flexShrink: 0 }}>{renderRow(item)}</span>
          </div>
        );
      })}
    </div>
  );
}

function CheatSheetMain() {
  // Live slate pool (lib/data.js): opposing goalies, scratches and scores follow lineup news, and
  // games already under way drop off while "upcoming games only" is on.
  const pool = useScoredPool();
  const players = pool?.players ?? null;
  const goalies = pool?.goalies ?? null;
  const meta = pool?.meta ?? null;
  const [lineupFilter, setLineupFilter] = useState("notOut");
  const selected = useMatchup();
  useListFilters(); // 2026-10-23: re-render on the header search (applied in filterPlayers)
  const position = usePosition();
  const lineups = useLineups(pool?.past ? null : meta?.slateDate); // past night: no live lineup marks

  const maps = useMemo(() => lineupMaps(lineups), [lineups]);
  // 2026-11-02 🔦 Under the radar (lib/radar.js): lines he rarely hits that the model likes tonight
  const radarPool = useMemo(() => (players ? filterPositions(filterPlayers(players, selected), position) : null), [players, selected, position]);
  const radar = useRadar(radarPool, Boolean(pool?.past), meta?.slateDate);
  // 2026-11-03 🎯 / 🍎 multi-point + multi-assist lists (lib/multi.js), right after the point card
  const multi = useMulti(radarPool, Boolean(pool?.past), meta?.slateDate);
  // 2026-11-05 ⚡ Today's short list: PRISM Pick, mid-range, under the radar, multi-point, long shot -- the top of each tested list,
  // one player each. PRISM levels are picked on the whole slate (same picks as the card below), then kept to the filtered players.
  const ppData = useJson("/data/prism_picks.json");
  const ppOdds = useJson("/data/prop_odds.json");
  const shortItems = useMemo(() => {
    if (!radarPool || !ppData?.knots) return [];
    const ids = new Set(radarPool.map((p) => p.playerId));
    const byId = new Map(radarPool.map((p) => [p.playerId, p]));
    const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);
    const vs = (p) => `${p.team} ${p.isHome === false ? "@" : "vs"} ${p.opponentTeam}`;
    let lv;
    if (pool?.past) {
      const n = ppData.nights?.find((x) => x.date === meta?.slateDate);
      const conv = (arr) => (arr || []).filter((c) => byId.has(c.playerId)).map((c) => ({ ...c, p: byId.get(c.playerId), shown: pct(c.chance), shownSub: "model" }));
      lv = { safe: conv(n?.picks), mid: conv(n?.tiers?.mid), long: conv(n?.tiers?.long) };
    } else {
      const safe = prismPicks(players, ppData, ppOdds);
      const mid = tierPicks(players, ppData, ppOdds, "mid", new Set(safe.map((c) => c.p.playerId)));
      const long = tierPicks(players, ppData, ppOdds, "long", new Set([...safe, ...mid].map((c) => c.p.playerId)));
      const keep = (arr) => arr.filter((c) => ids.has(c.p.playerId)).map((c) => ({ ...c, shown: pct(c.track.rate), shownSub: "track record",
        why: `had it in ${c.last[1]} of his last ${c.last[0]}` }));
      lv = { safe: keep(safe), mid: keep(mid), long: keep(long) };
    }
    const item = (c, tag, cls) => c && { key: `${cls}-${c.p.playerId}`, tag, tagCls: cls, name: c.p.name, team: vs(c.p), line: c.label, big: c.shown, bigSub: c.shownSub,
      why: c.why || (c.last ? `had it in ${c.last[1]} of his last ${c.last[0]}` : ""), result: c.result, onOpen: () => openSkaterSlide(c.p),
      action: <><PickButton player={c.p} /> <GamblyButton text={`${c.p.name} (${c.p.team}) — ${c.label}`} /></> };
    const listItem = (f, tag, cls, label) => f && { key: `${cls}-${f.playerId}`, tag, tagCls: cls, name: f.p.name, team: vs(f.p), line: label(f), big: pct(f.chance),
      bigSub: `his ${pct(f.own)}`, why: `had it in ${f.hits} of his last ${f.n}`, onOpen: () => openSkaterSlide(f.p), action: <PickButton player={f.p} /> };
    const top5 = (arr, fn) => (arr || []).slice(0, 5).map(fn);
    return [
      top5(lv.safe, (c) => item(c, "💎 PRISM Pick", "safe")),
      top5(lv.mid, (c) => item(c, "⚖️ Mid-range", "mid")),
      top5(radar.picks, (f) => listItem(f, "🔦 Under the radar", "radar", radarLabel)),
      top5(multi.lists?.PTS, (f) => listItem(f, "🎯 Multi-point", "edge", (x) => `${x.line}+ points`)),
      top5(lv.long, (c) => item(c, "🌠 Long shot", "long")),
    ];
  }, [radarPool, players, ppData, ppOdds, radar.picks, multi.lists, pool?.past, meta?.slateDate]);
  const slateByTeam = useMemo(() => {
    const m = new Map();
    for (const g of meta?.slate || []) { m.set(g.away, g); m.set(g.home, g); }
    return m;
  }, [meta]);

  // Every team's starter tonight, ranked weakest first (lowest goalie grade score = most attackable).
  const starters = useMemo(() => {
    if (!goalies || !meta) return [];
    const byId = new Map(goalies.map((g) => [g.playerId, g]));
    return (meta.slate || []).flatMap((game) => [game.away, game.home].map((team) => {
      const s = startingGoalie(team, game, maps);
      if (!s) return null;
      const stats = byId.get(s.playerId) || {};
      return {
        ...stats, ...s, team, playerId: s.playerId ?? stats.playerId,
        attackedBy: team === game.away ? game.home : game.away,
        matchup: matchupKey(game.away, game.home),
      };
    })).filter(Boolean);
  }, [goalies, meta, maps]);

  if (!players || !goalies) {
    return <div className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>Loading…</div>;
  }

  const statusOf = (p) => skaterStatus(maps, p);
  const oppGoalieOf = (p) => startingGoalie(p.opponentTeam, slateByTeam.get(p.team), maps);
  const passesLineup = (p) => {
    const st = statusOf(p);
    if (lineupFilter === "notOut") return !st?.out;
    if (lineupFilter === "official") return Boolean(st?.dressed);
    return true;
  };

  const inGame = filterPositions(filterPlayers(players, selected), position).filter(passesLineup);
  // Goal / point odds from Slap Score v2 (lib/slapScore.js): the grade model, adjusted for the opponent.
  const goalCandidates = [...inGame].sort((a, b) => (b.anytimeGoalPct ?? 0) - (a.anytimeGoalPct ?? 0)).slice(0, 5);
  const pointCandidates = [...inGame]
    .sort((a, b) => (b.anytimePointPct ?? 0) - (a.anytimePointPct ?? 0))
    .slice(0, 5);
  const shotCandidates = [...inGame].sort((a, b) => (b.ShotsOnGoalPerGame || 0) - (a.ShotsOnGoalPerGame || 0)).slice(0, 5);
  // Our goal % vs the best sportsbook anytime-goal price (lib/data.js): biggest gaps either way. 2026-10-26: context lists with
  // the market check, no longer value / fade -- where we disagreed, the book was closer (lib/market.js).
  const priced = inGame.filter((p) => p.edge != null);
  const bestValue = [...priced].filter((p) => p.edge >= VALUE_EDGE).sort((a, b) => b.edge - a.edge).slice(0, 5);
  const overvalued = [...priced].filter((p) => p.edge < 0).sort((a, b) => a.edge - b.edge).slice(0, 5);
  const edgeRow = (p) => (
    <span title={`${edgeText(p)}
${booksText(p.book)}`} style={{ textAlign: "right", display: "inline-block" }}>
      <span>mkt {p.market}%</span>
      <div style={{ fontSize: 9, fontWeight: 400, color: "var(--muted)" }}>{p.anytimeGoalPct}% vs {p.book.bestImplied}% ({fmtEdge(p.edge)}) · {fmtAmerican(p.book.best)}</div>
    </span>
  );

  const attackable = starters
    .filter((g) => inScope(g.matchup, selected))
    .filter((g) => lineupFilter !== "official" || g.confirmed)
    .sort((a, b) => (a.grade?.score ?? 999) - (b.grade?.score ?? 999));

  const officialCount = maps.officialTeams.size;
  const confirmedGoalies = starters.filter((g) => g.confirmed).length;

  return (
    <div>
      <SlateStatus />
      <ShortList items={shortItems} past={pool?.past} />
      <PrismPicks players={players} date={pool?.past ? pool.meta.slateDate : null} />

      <div className="note">
        ℹ️ ✅ = in tonight's official lineup (posted by the NHL around warmups) or a confirmed starting goalie.
        PP1/PP2 = power-play unit and OUT = injured, per RotoWire, refreshed every few minutes.
        {lineups ? ` Right now: ${confirmedGoalies} of ${starters.length} starting goalies confirmed, ${officialCount} team lineups official.` : " Loading lineup news…"}
      </div>

      {/* 2026-11-05: lineup + position as two dropdowns on one row */}
      <div className="vp-row">
        <ViewPicker select compact label="Lineup" options={LINEUP_FILTERS} value={lineupFilter} onChange={setLineupFilter} />
      </div>
      <PositionFilter />
      <MatchupFilter />

      <div className="grid-cards">
        <ListCard title="🥅 Goal Candidates" sub="Top 5 by chance to score" items={goalCandidates} renderRow={(p) => `${p.anytimeGoalPct}%`}
          onClick={openSkaterSlide} statusOf={statusOf} oppGoalieOf={oppGoalieOf} meta={meta} />
        <RadarCard picks={radar.picks} data={radar.data} meta={meta} />
        <ListCard title="🎯 Point Candidates" sub="Top 5 by chance of a point" items={pointCandidates} prop="point"
          renderRow={(p) => `${p.anytimePointPct}%`} onClick={openSkaterSlide} statusOf={statusOf} oppGoalieOf={oppGoalieOf} meta={meta} />
        <MultiCard k="PTS" picks={multi.lists.PTS} data={multi.data} meta={meta} />
        <MultiCard k="A" picks={multi.lists.A} data={multi.data} meta={meta} />
        <ListCard title="⚡ Shots on Goal Candidates" sub="Top 5 by shots on goal per game" items={shotCandidates} prop="sog3"
          renderRow={(p) => `${p.ShotsOnGoalPerGame}/gm`} onClick={openSkaterSlide} statusOf={statusOf} oppGoalieOf={oppGoalieOf} meta={meta} />
        {priced.length > 0 && (
          <>
            <ListCard title="📖 We Rate Higher Than the Book" sub="Anytime goal, our chance most above the best price. Context, not value: this group has scored nearer the book's number (we said 25.5%, book 20.6%, 18.9% scored). mkt = market check" items={bestValue}
              renderRow={edgeRow} onClick={openSkaterSlide} statusOf={statusOf} oppGoalieOf={oppGoalieOf} meta={meta} />
            <ListCard title="📖 Book Rates Higher Than Us" sub="Priced shorter than our chance. Not a fade: these have scored at about the book's number (we said 17.4%, book 22.5%, 24.0% scored). mkt = market check" items={overvalued}
              renderRow={edgeRow} onClick={openSkaterSlide} statusOf={statusOf} oppGoalieOf={oppGoalieOf} meta={meta} />
          </>
        )}

        <div className="card">
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>🔓 Most Attackable Goalies to Target Today</div>
          <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginBottom: 10 }}>
            Tonight's starters (confirmed where reported, otherwise expected), weakest grade first
          </div>
          {attackable.length === 0 && <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>No starters match these filters yet.</div>}
          {attackable.map((g, i) => (
            <div
              key={`${g.team}-${g.name}`}
              className="clickable"
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--line2)", cursor: "pointer", gap: 8 }}
              onClick={() => g.playerId && openGoalieSlide({ ...g, name: g.name, team: g.team })}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>{i + 1}.</span>
                <PlayerAvatar playerId={g.playerId} name={g.name} team={g.team} size={26} />
                <div style={{ minWidth: 0 }}>
                  <div className="mono" style={{ fontSize: 12 }}>
                    {g.name} <span style={{ color: "var(--muted)" }}>({g.team})</span> <GoalieStatus goalie={g} />
                  </div>
                  <div className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>
                    target: {g.attackedBy} skaters · {g.savePct != null ? `SV% ${g.savePct.toFixed(3).replace(/^0/, "")}` : "no NHL sample yet"}
                    {g.GA60_proxy != null ? ` · GA60 ${g.GA60_proxy}` : ""}
                    {" "}<H2HCell playerId={g.playerId} goalie compact />
                  </div>
                </div>
              </div>
              <span style={{ flexShrink: 0 }}>{g.grade ? <GradeBadge grade={g.grade} /> : <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>—</span>}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Cheat Sheets has two pages: the usual quick reads, and Breakout Watch (rising shot quality into a
// soft matchup — lib/breakout.js).
export default function CheatSheetsTab() {
  const [view, setView] = useState("main");
  return (
    <div>
      <div className="section-header">
        <div className="section-title">📋 Cheat Sheets</div>
        <div className="section-sub">
          {view === "main"
            ? "Tonight's quick reads — top candidates and the goalies worth attacking, with lineup status"
            : "The honest best looks beyond the usual scorers — rising shot quality into a soft matchup"}
        </div>
      </div>
      <div className="pill-row" style={{ display: "inline-flex", marginBottom: 12 }}>
        <button className={`pill-btn ${view === "main" ? "active" : ""}`} onClick={() => setView("main")}>📋 Quick reads</button>
        <button className={`pill-btn ${view === "breakout" ? "active" : ""}`} onClick={() => setView("breakout")}>🚀 Breakout Watch</button>
      </div>
      {view === "main" ? <CheatSheetMain /> : <><SlateStatus /><BreakoutTab /></>}
    </div>
  );
}
