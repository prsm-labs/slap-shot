import { useEffect, useMemo, useState } from "react";
import { fetchTrackRecord } from "../lib/data.js";
import TrackRecordLive from "./TrackRecordLive.jsx";
import TrackRecordGoalies from "./TrackRecordGoalies.jsx";

const TIER_CLASS = {
  "Elite Add-On": "tier-elite",
  "Core Target": "tier-core",
  "Value Upside": "tier-value",
  Ignore: "tier-ignore",
};
const TIER_ORDER = ["Elite Add-On", "Core Target", "Value Upside", "Ignore"];
const ROWS_SHOWN = 50;

// No percentile tiering — deliberately, per slap-shot-build.md §5. Going Yard's real Track
// Record isn't percentile-bucketed either: it's a plain hits/flagged ratio per named flag
// (public/data/*.csv, mlb_project/going-yard). Here the "flags" are the 4 real TargetPoolRank
// tiers already present in output/scored_v3.xlsx, not an invented percentile system.
function computeTierStats(rows) {
  const byTier = {};
  for (const t of TIER_ORDER) byTier[t] = { hits: 0, total: 0 };
  for (const r of rows) {
    if (!byTier[r.label]) byTier[r.label] = { hits: 0, total: 0 };
    byTier[r.label].total += 1;
    if (r.hit) byTier[r.label].hits += 1;
  }
  return byTier;
}

// Real game-by-game rows, so the percentage is inspectable, not just asserted — direct response
// to "it just shows numbers but nothing to prove or explain."
function DrillDown({ tier, rows }) {
  const tierRows = useMemo(
    () => rows.filter((r) => r.label === tier).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [rows, tier]
  );
  return (
    <div className="table-wrap" style={{ marginTop: 10, gridColumn: "1 / -1" }}>
      <table className="data-table">
        <thead>
          <tr>
            <th>Date</th><th>Player</th><th>Team</th><th>Primed Score</th><th>Goals</th><th>Result</th>
          </tr>
        </thead>
        <tbody>
          {tierRows.slice(0, ROWS_SHOWN).map((r, i) => (
            <tr key={i}>
              <td>{r.date}</td>
              <td>{r.player}</td>
              <td>{r.team}</td>
              <td>{Number.isFinite(r.primedScore) ? r.primedScore : "—"}</td>
              <td>{Number.isFinite(r.actualGoals) ? r.actualGoals : "—"}</td>
              <td style={{ color: r.hit ? "var(--green)" : "var(--red)" }}>{r.hit ? "✓ Hit" : "✗ Miss"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {tierRows.length > ROWS_SHOWN && (
        <div className="mono" style={{ fontSize: 10, color: "var(--muted)", padding: "8px 12px" }}>
          Showing {ROWS_SHOWN} of {tierRows.length} real graded games for this tier.
        </div>
      )}
    </div>
  );
}

// March 2026 backtest of the old Power BI model (output/scored_v3.xlsx), kept as the second view.
function PbixBacktest() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    fetchTrackRecord().then(setRows).catch((e) => setError(String(e)));
  }, []);

  const tierStats = useMemo(() => (rows ? computeTierStats(rows) : null), [rows]);
  const dateRange = useMemo(() => {
    if (!rows || !rows.length) return null;
    const dates = rows.map((r) => r.date).sort();
    return [dates[0], dates[dates.length - 1]];
  }, [rows]);

  return (
    <div>
      <div className="note">
        ℹ️ The Power BI model's own tiers, graded March 1-21, 2026 (before Slap Shot existed) — click a tier to see the games.
      </div>

      {error && <div className="note" style={{ borderColor: "var(--red)", color: "var(--red)" }}>Failed to load: {error}</div>}
      {!rows && !error && <div className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>Loading track record…</div>}

      {tierStats && (
        <>
          {dateRange && (
            <div className="note">
              ℹ️ {rows.length} real graded player-games, {dateRange[0]} through {dateRange[1]}.
            </div>
          )}
          <div className="grid-cards">
            {TIER_ORDER.map((tier) => {
              const s = tierStats[tier];
              const pct = s.total ? Math.round((s.hits / s.total) * 1000) / 10 : 0;
              const isOpen = expanded === tier;
              return (
                <div
                  className="card clickable"
                  key={tier}
                  style={{ cursor: "pointer", borderColor: isOpen ? "var(--accent)" : undefined }}
                  onClick={() => setExpanded(isOpen ? null : tier)}
                >
                  <span className={`tier-pill ${TIER_CLASS[tier]}`}>{tier}</span>
                  <div style={{ marginTop: 10, display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 800, fontSize: 30 }}>{pct}%</span>
                    <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{s.hits}/{s.total} hit</span>
                  </div>
                  <div className="mono" style={{ fontSize: 9, color: "var(--accent2)", marginTop: 6 }}>
                    {isOpen ? "▲ hide games" : "▼ show games"}
                  </div>
                </div>
              );
            })}
            {expanded && <DrillDown tier={expanded} rows={rows} />}
          </div>
        </>
      )}
    </div>
  );
}

export default function TrackRecordTab() {
  const [view, setView] = useState("live");
  return (
    <div>
      <div className="section-header">
        <div className="section-title">📈 Track Record</div>
        <div className="section-sub">What we projected before each game vs. what actually happened — who scored, their box score, and how they were graded</div>
      </div>
      <div className="pill-row" style={{ display: "inline-flex", marginBottom: 12 }}>
        <button className={`pill-btn ${view === "live" ? "active" : ""}`} onClick={() => setView("live")}>2026-27 Skaters</button>
        <button className={`pill-btn ${view === "goalies" ? "active" : ""}`} onClick={() => setView("goalies")}>🥅 2026-27 Goalies (Crease Lab)</button>
        <button className={`pill-btn ${view === "pbix" ? "active" : ""}`} onClick={() => setView("pbix")}>Mar 2026 backtest (Power BI model)</button>
      </div>
      {view === "live" ? <TrackRecordLive /> : view === "goalies" ? <TrackRecordGoalies /> : <PbixBacktest />}
    </div>
  );
}
