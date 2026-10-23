import { useState } from "react";
import { setUpcomingOnly, upcomingFilterActive, useScoredPool, useUpcomingOnly } from "../lib/data.js";

// One line above Cheat Sheets / Scouting / First Goal saying how current tonight's projections
// are: lineup check time, games under way, confirmed goalies, goalie changes and scratches applied
// since the pipeline built the pool (lib/data.js live slate pool), plus the "upcoming games only"
// toggle.
const time = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—");

export default function SlateStatus() {
  const pool = useScoredPool({ includeStarted: true });
  const upcomingOnly = useUpcomingOnly();
  const [open, setOpen] = useState(false);
  if (!pool?.live) return null;
  const l = pool.live;
  const allFinal = l.games > 0 && l.final === l.games;
  const allStarted = l.games > 0 && l.started === l.games;
  const filtering = upcomingFilterActive(pool);

  return (
    <div className="note" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 14px" }}>
      <span>
        {l.lineupsLoaded ? `🔄 Lineups checked ${time(l.lineupsAt)}` : "🔄 Checking lineups…"}
        {" · "}pool built {String(l.poolGenerated || "").slice(11, 16) || "—"} ET
      </span>
      <span>{l.started}/{l.games} games started{l.final ? ` (${l.final} final)` : ""}</span>
      <span>🥅 {l.goaliesConfirmed}/{l.goaliesTotal} starters confirmed</span>
      <span>📋 {l.officialTeams}/{l.games * 2} official lineups</span>
      {(l.swaps.length > 0 || l.removed.length > 0) && (
        <button className="pill-btn" onClick={() => setOpen((v) => !v)}>
          {l.swaps.length} goalie change{l.swaps.length === 1 ? "" : "s"} · {l.removed.length} out/scratched {open ? "▲" : "▼"}
        </button>
      )}
      {l.started > 0 && !allStarted && (
        <button className={`pill-btn ${upcomingOnly ? "active" : ""}`} onClick={() => setUpcomingOnly(!upcomingOnly)}>
          {upcomingOnly ? "Upcoming games only ✓" : "Showing started games too"}
        </button>
      )}
      {allFinal && <span>All games final — the next slate posts after the 9 AM ET update.</span>}
      {!allFinal && allStarted && <span>Every game has started — these are pre-game projections.</span>}
      {filtering && <span style={{ color: "var(--muted)" }}>{l.started} started game{l.started === 1 ? "" : "s"} hidden.</span>}
      {open && (
        <div className="mono" style={{ flexBasis: "100%", fontSize: 11, marginTop: 4 }}>
          {l.swaps.map((s) => (
            <div key={s.team}>🥅 {s.team}: {s.to} ({s.status}) — was {s.from || "—"}; every {s.team} opponent re-scored</div>
          ))}
          {l.removed.length > 0 && (
            <div style={{ marginTop: 4 }}>
              Removed from the slate: {l.removed.map((r) => `${r.name} (${r.team}, ${r.reason})`).join(", ")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
