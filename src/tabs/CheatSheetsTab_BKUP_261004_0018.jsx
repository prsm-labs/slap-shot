import { useEffect, useMemo, useState } from "react";
import { fetchScoredPool } from "../lib/data.js";
import { openSkaterSlide, openGoalieSlide } from "../slideouts.js";
import PlayerAvatar from "../components/PlayerAvatar.jsx";
import GradeBadge from "../components/GradeBadge.jsx";
import MatchupFilter from "../components/MatchupFilter.jsx";
import PositionFilter from "../components/PositionFilter.jsx";
import LineupBadge from "../components/LineupBadge.jsx";
import { filterPositions, usePosition } from "../lib/positionFilter.js";
import { filterPlayers, matchupKey, useMatchup } from "../lib/matchupFilter.js";
import { lineupMaps, skaterStatus, startingGoalie, useLineups } from "../lib/lineups.js";

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

function ListCard({ title, sub, items, renderRow, onClick, statusOf, oppGoalieOf }) {
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
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,.05)", cursor: "pointer", gap: 8 }}
            onClick={() => onClick(item)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>{i + 1}.</span>
              <PlayerAvatar playerId={item.playerId} name={item.name} team={item.team} size={26} />
              <div style={{ minWidth: 0 }}>
                <div className="mono" style={{ fontSize: 12 }}>
                  {item.name} <span style={{ color: "var(--muted)" }}>({item.team})</span>
                  {statusOf && <LineupBadge status={statusOf(item)} />}
                </div>
                {opp && (
                  <div className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>
                    vs {opp.name} <GoalieStatus goalie={opp} /> {item.goalieGrade && opp.playerId === item.opponentGoalieId && <GradeBadge grade={item.goalieGrade} />}
                  </div>
                )}
              </div>
            </div>
            <span className="mono" style={{ fontWeight: 700, fontSize: 12, flexShrink: 0 }}>{renderRow(item)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function CheatSheetsTab() {
  const [players, setPlayers] = useState(null);
  const [goalies, setGoalies] = useState(null);
  const [meta, setMeta] = useState(null);
  const [lineupFilter, setLineupFilter] = useState("notOut");
  const selected = useMatchup();
  const position = usePosition();
  const lineups = useLineups(meta?.slateDate);

  useEffect(() => {
    fetchScoredPool().then(({ players, goalies, meta }) => {
      setPlayers(players);
      setGoalies(goalies);
      setMeta(meta);
    });
  }, []);

  const maps = useMemo(() => lineupMaps(lineups), [lineups]);
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
  const goalCandidates = [...inGame].sort((a, b) => b.gGoal - a.gGoal).slice(0, 5);
  // Point Candidates: Ice Sig (usage/opportunity) + gGOAL — a broader "gets on the scoresheet" list.
  const pointCandidates = [...inGame]
    .map((p) => ({ ...p, _pointBlend: p.iceSig * 0.5 + p.gGoal * 0.5 }))
    .sort((a, b) => b._pointBlend - a._pointBlend)
    .slice(0, 5);
  const shotCandidates = [...inGame].sort((a, b) => (b.ShotsOnGoalPerGame || 0) - (a.ShotsOnGoalPerGame || 0)).slice(0, 5);

  const attackable = starters
    .filter((g) => !selected || g.matchup === selected)
    .filter((g) => lineupFilter !== "official" || g.confirmed)
    .sort((a, b) => (a.grade?.score ?? 999) - (b.grade?.score ?? 999));

  const officialCount = maps.officialTeams.size;
  const confirmedGoalies = starters.filter((g) => g.confirmed).length;

  return (
    <div>
      <div className="section-header">
        <div className="section-title">📋 Cheat Sheets</div>
        <div className="section-sub">Tonight's quick reads — top candidates and the goalies worth attacking, with lineup status</div>
      </div>

      <div className="note">
        ℹ️ ✅ = in tonight's official lineup (posted by the NHL around warmups) or a confirmed starting goalie.
        PP1/PP2 = power-play unit and OUT = injured, per RotoWire, refreshed every few minutes.
        {lineups ? ` Right now: ${confirmedGoalies} of ${starters.length} starting goalies confirmed, ${officialCount} team lineups official.` : " Loading lineup news…"}
      </div>

      <div className="pill-row" style={{ display: "inline-flex", flexWrap: "wrap", marginBottom: 12, marginRight: 10 }}>
        {LINEUP_FILTERS.map(([key, label]) => (
          <button key={key} className={`pill-btn ${lineupFilter === key ? "active" : ""}`} onClick={() => setLineupFilter(key)}>{label}</button>
        ))}
      </div>
      <PositionFilter />
      <MatchupFilter />

      <div className="grid-cards">
        <ListCard title="🥅 Goal Candidates" sub="Top 5 by gGOAL" items={goalCandidates} renderRow={(p) => `${p.gGoal}`}
          onClick={openSkaterSlide} statusOf={statusOf} oppGoalieOf={oppGoalieOf} />
        <ListCard title="🎯 Point Candidates" sub="Top 5 by Ice Sig + gGOAL blend" items={pointCandidates}
          renderRow={(p) => `${Math.round(p._pointBlend)}`} onClick={openSkaterSlide} statusOf={statusOf} oppGoalieOf={oppGoalieOf} />
        <ListCard title="⚡ Shots on Goal Candidates" sub="Top 5 by shots on goal per game" items={shotCandidates}
          renderRow={(p) => `${p.ShotsOnGoalPerGame}/gm`} onClick={openSkaterSlide} statusOf={statusOf} oppGoalieOf={oppGoalieOf} />

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
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,.05)", cursor: "pointer", gap: 8 }}
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
