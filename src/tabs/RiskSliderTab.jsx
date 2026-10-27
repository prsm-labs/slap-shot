import { useEffect, useMemo, useState } from "react";
import { useScoredPool } from "../lib/data.js";
import { openSkaterSlide } from "../slideouts.js";
import PickButton from "../components/PickButton.jsx";
import PlayerAvatar from "../components/PlayerAvatar.jsx";
import MatchupFilter from "../components/MatchupFilter.jsx";
import ListFilters from "../components/ListFilters.jsx";
import PositionFilter from "../components/PositionFilter.jsx";
import { applyListFilters, useListFilters, usePickSets } from "../lib/listFilters.js";
import { filterPositions, positionLabel, usePosition } from "../lib/positionFilter.js";
import { filterPlayers, useMatchup } from "../lib/matchupFilter.js";
import { useH2HGrades } from "../lib/h2h.js";
import { formBefore, ladderFor, recentOf } from "../lib/lineBoard.js";
import RiskBoard from "../components/RiskBoard.jsx";

// 🎚️ Risk slider (2026-10-27, user: a slider in Scouting from safe to long shot -- the player list shows the props in that chance
// range, tap a player for his whole ladder; plus L7 green / red strips). Ladders priced live from the scored pool (lib/lineBoard.js);
// calibration, backtest, last-20 games and the live record from nhl_project/build_line_board.py (public/data/line_board.json).
// A past night uses that night's frozen chances and only the games before it (no assists: the snapshots don't keep that chance).
const STATS = [{ k: "SOG", label: "SOG" }, { k: "PTS", label: "Points" }, { k: "G", label: "Goals" }, { k: "A", label: "Assists" }];
const NOUN = { PTS: ["point", "points"], G: ["goal", "goals"], A: ["assist", "assists"] };
const lineLabel = (st, T) => (NOUN[st] ? `${T}+ ${NOUN[st][T === 1 ? 0 : 1]}` : `${T}+ SOG`);

export default function RiskSliderTab() {
  const live = useScoredPool();
  const [data, setData] = useState(undefined);
  useEffect(() => {
    let alive = true;
    fetch("/data/line_board.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).then((d) => alive && setData(d)).catch(() => alive && setData(null));
    return () => { alive = false; };
  }, []);
  const selected = useMatchup();
  const position = usePosition();
  const listFilters = useListFilters();
  const h2hGrades = useH2HGrades();
  const pickSets = usePickSets(live);
  const past = Boolean(live?.past);
  const date = live?.meta?.slateDate;

  const filtered = useMemo(() => {
    if (!live?.players) return [];
    return applyListFilters(filterPositions(filterPlayers(live.players, selected), position), listFilters,
      { slate: live.players, signal: "point", h2h: h2hGrades.skaters, picks: pickSets, meta: live.meta }) || [];
  }, [live, selected, position, listFilters, h2hGrades, pickSets]);

  const players = useMemo(() => {
    if (!data?.form) return [];
    const out = [];
    for (const p of filtered) {
      if (!p.modelProbs && p.anytimePointPct == null) continue;
      if (p.lineupStatus === "out" || p.lineupStatus === "scratched") continue;
      const f0 = data.form[p.playerId];
      const form = past ? formBefore(f0, date) : f0;
      if (!form || form.s.length < data.model.min_games) continue;
      const probs = {
        SOG: past ? (p.modelSog3Pct != null ? p.modelSog3Pct / 100 : null) : p.modelProbs?.sog3 ?? null,
        PTS: p.anytimePointPct != null ? p.anytimePointPct / 100 : null,
        G: p.anytimeGoalPct != null ? p.anytimeGoalPct / 100 : null,
        A: past ? null : p.modelProbs?.assist ?? null,
      };
      const a = p.actual;
      out.push({
        id: p.playerId, n: form.s.length, lines: ladderFor(probs, form, data.model), recent: recentOf(form),
        proj: { SOG: p.sogPg ?? p.ShotsOnGoalPerGame ?? null },
        actual: !past || a == null ? undefined : a.played === false ? null : { SOG: a.sog, PTS: a.p, G: a.g, A: a.a },
        cell: (
          <div className="clickable" onClick={() => openSkaterSlide(p)} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <PlayerAvatar playerId={p.playerId} name={p.name} team={p.team} size={26} />
            <div>
              <span className="player-name-link">{p.name}</span> <PickButton player={p} />
              <div className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>{p.team} {p.isHome ? "vs" : "@"} {p.opponentTeam} · {positionLabel(p.position)}</div>
            </div>
          </div>
        ),
      });
    }
    return out;
  }, [filtered, data, past, date]);

  const lv = data?.live;
  return (
    <div>
      <div className="section-header">
        <div className="section-title">🎚️ Risk Slider</div>
        <div className="section-sub">Every skater's ladder of lines, from safe to long shot</div>
      </div>
      <PositionFilter />
      <ListFilters shown={players.length} total={live?.players?.length ?? 0} base={filterPositions(filterPlayers(live?.players || [], selected), position)}
        ctx={{ slate: live?.players, signal: "point", h2h: h2hGrades.skaters, picks: pickSets, meta: live?.meta }} />
      <MatchupFilter />
      {data === undefined || !live ? <div className="note">Loading the line board…</div>
        : !data ? <div className="note">The line board isn't built yet — it comes with the next pipeline run.</div>
        : (
          <RiskBoard players={players} stats={STATS} model={data.model} live={lv} lineLabel={lineLabel} past={past}
            storeKey="slapshot.risk" pillClass="pill-btn" tableClass="data-table" stickyClass="" lastLabel="L20" liveLabel="since 10/5"
            intro={<>🎚️ Slide from <b>Safe</b> (lines he hits most nights) to <b>Long shot</b> (rare lines that pay off big). Every skater gets a
              ladder — shots on goal 1-7, points 1-4, goals 1-3, assists 1-3 — priced from tonight's calibrated chances and how often he has hit
              each line in his last 20 games. Backtest 2023-24 to 2025-26 (1.4M held-out lines): every chance band hit within half a point of
              what it said.{lv?.nights > 0 && <> Live since 10/5 ({lv.nights} nights, shots / points / goals): every band within ~2 points.</>} Tap
              a prop for his whole ladder; L7 = his last 7 games against that line. Skaters with fewer than 8 games in the last-20 window aren't
              listed.{past && " Past night: that night's frozen chances and the games before it (assists not kept)."} Not a lock.</>} />
        )}
    </div>
  );
}
