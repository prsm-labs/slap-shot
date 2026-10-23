import { useState } from "react";
import L7Chart from "./L7Chart.jsx";
import { useH2H } from "../lib/h2h.js";
import { useScoredPool } from "../lib/data.js";

// The skater slideout's chart with H2H toggles: last 7 games, the last 5 games vs tonight's
// opponent, and the last 5 games tonight's opposing goalie was in net against them (any team,
// since 2022-23). The goalie toggle only shows when that history exists.
const GOALIE_VIEWS = [
  ["goal", "🚨 Goal on him", (g) => g.goals || 0, 1],
  ["sog3", "⚡ 3+ SOG on him", (g) => g.sog || 0, 3],
  ["point", "🎯 Point (game)", (g) => g.points || 0, 1],
];
const pct = (v) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);

export default function SkaterCharts({ player }) {
  const h2h = useH2H();
  const pool = useScoredPool({ includeStarted: true });
  const [mode, setMode] = useState("l7");
  // The slideout may be opened with only id/name/team; tonight's matchup comes from the live pool.
  const live = pool?.players.find((p) => p.playerId === player.playerId) || player;
  const entry = h2h?.skaters?.[String(player.playerId)];
  const vsTeam = entry?.vsTeam;
  const goalieId = live.opponentGoalieId != null ? String(live.opponentGoalieId) : null;
  const vsGoalie = goalieId ? entry?.vsGoalie?.[goalieId] : null;
  const active = mode === "team" && !vsTeam ? "l7" : mode === "goalie" && !vsGoalie ? "l7" : mode;

  const btn = (key, label) => (
    <button key={key} className={`pill-btn ${active === key ? "active" : ""}`} onClick={() => setMode(key)}>{label}</button>
  );

  return (
    <div style={{ marginTop: 12 }}>
      {(vsTeam || vsGoalie) && (
        <div className="pill-row" style={{ display: "inline-flex", flexWrap: "wrap", marginBottom: 6 }}>
          {btn("l7", "Last 7")}
          {vsTeam && btn("team", `H2H vs ${vsTeam.opp}`)}
          {vsGoalie && btn("goalie", `H2H vs ${vsGoalie.goalie}`)}
        </div>
      )}

      {active === "l7" && <L7Chart key="l7" games={live.last7 || player.last7} role="skater" />}

      {active === "team" && (
        <>
          <div className="mono" style={{ fontSize: 10, color: "var(--muted)", margin: "4px 0" }}>
            Last {vsTeam.games.length} of {vsTeam.gamesAll} games vs {vsTeam.opp} since 2022-23:{" "}
            {vsTeam.games.reduce((a, g) => a + g.goals, 0)} G, {vsTeam.games.reduce((a, g) => a + g.points, 0)} P,{" "}
            {vsTeam.games.reduce((a, g) => a + g.sog, 0)} SOG
            {vsTeam.games.some((g) => g.po) ? " (includes playoffs)" : ""}. Goalie faced:{" "}
            {vsTeam.games.map((g) => g.goalies[0] || "?").join(", ")}.
          </div>
          <L7Chart key="team" games={vsTeam.games} role="skater" showYear />
        </>
      )}

      {active === "goalie" && (
        <>
          <div className="mono" style={{ fontSize: 10, color: "var(--muted)", margin: "4px 0" }}>
            vs {vsGoalie.goalie} since 2022-23: {vsGoalie.totals.games} games, {vsGoalie.totals.goalsOn} goals on{" "}
            {vsGoalie.totals.sogOn} shots ({pct(vsGoalie.totals.shPct)}), {vsGoalie.totals.points} points in those games.
            Bars: the last {vsGoalie.games.length} — goals and shots on him specifically (not empty net or another goalie).
          </div>
          <L7Chart
            key="goalie"
            games={vsGoalie.games.map((g) => ({ ...g, goals: g.goalsOn, sog: g.sogOn }))}
            views={GOALIE_VIEWS}
            showYear
          />
        </>
      )}
      {(vsTeam || vsGoalie) && active !== "l7" && (
        <div className="mono" style={{ fontSize: 9, color: "var(--muted)", marginTop: 4 }}>
          Head-to-head history is a small sample — shown for context, not used in any score.
        </div>
      )}
    </div>
  );
}
