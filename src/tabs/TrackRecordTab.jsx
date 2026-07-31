import { useEffect, useMemo, useState } from "react";
import { fetchTrackRecord } from "../lib/data.js";

const TIER_CLASS = {
  "Elite Add-On": "tier-elite",
  "Core Target": "tier-core",
  "Value Upside": "tier-value",
  Ignore: "tier-ignore",
};
const TIER_ORDER = ["Elite Add-On", "Core Target", "Value Upside", "Ignore"];

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

export default function TrackRecordTab() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

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
      <div className="section-header">
        <div className="section-title">📈 Track Record</div>
        <div className="section-sub">Real per-tier hit rate — output/scored_v3.xlsx, converted, not a percentile tier system</div>
      </div>

      {error && <div className="note" style={{ borderColor: "var(--red)", color: "var(--red)" }}>Failed to load: {error}</div>}
      {!rows && !error && <div className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>Loading track record…</div>}

      {tierStats && (
        <>
          {dateRange && (
            <div className="note">
              ℹ️ {rows.length} graded player-games, {dateRange[0]} through {dateRange[1]}. "Hit" = actual goal scored (G ≥ 1)
              that game, not the sheet's own ✅ column (that column marks confirmed rows, not outcomes — verified by
              direct read of scored_v3.xlsx before assuming otherwise).
            </div>
          )}
          <div className="grid-cards">
            {TIER_ORDER.map((tier) => {
              const s = tierStats[tier];
              const pct = s.total ? Math.round((s.hits / s.total) * 1000) / 10 : 0;
              return (
                <div className="card" key={tier}>
                  <span className={`tier-pill ${TIER_CLASS[tier]}`}>{tier}</span>
                  <div style={{ marginTop: 10, display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 800, fontSize: 30 }}>{pct}%</span>
                    <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{s.hits}/{s.total} hit</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
