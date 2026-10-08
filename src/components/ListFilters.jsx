import { useState } from "react";
import {
  activeFilterCount, clearListFilters, GOAL_OPTIONS, GRADE_OPTIONS, setListFilter, TIER_OPTIONS, useListFilters,
} from "../lib/listFilters.js";

// Collapsible filter bar for the long skater lists (lib/listFilters.js holds the shared state).
export default function ListFilters({ signalLabel = "★ Signals only", shown, total }) {
  const f = useListFilters();
  const [open, setOpen] = useState(false);
  const n = activeFilterCount(f);
  const pill = (active, label, onClick, title) => (
    <button key={label} title={title} className={`pill-btn ${active ? "active" : ""}`} onClick={onClick}>{label}</button>
  );
  return (
    <div className="card" style={{ padding: "8px 12px", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button className="btn" onClick={() => setOpen((v) => !v)}>⚙ Filters{n ? ` (${n})` : ""} {open ? "▲" : "▼"}</button>
        <input
          value={f.search}
          onChange={(e) => setListFilter("search", e.target.value)}
          placeholder="Search skater or team"
          className="mono"
          style={{ background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 8px", fontSize: 11, minWidth: 170 }}
        />
        {shown != null && <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>{shown} of {total} skaters</span>}
        {n > 0 && <button className="btn" onClick={clearListFilters}>✕ Clear</button>}
      </div>
      {open && (
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          <div className="pill-row" style={{ flexWrap: "wrap" }}>
            {TIER_OPTIONS.map((t) => pill(f.tier === t.key, t.label, () => setListFilter("tier", t.key)))}
          </div>
          <div className="pill-row" style={{ flexWrap: "wrap" }}>
            {GOAL_OPTIONS.map((g) => pill(f.minGoal === g, g ? `Goal ${g}%+` : "Any goal %", () => setListFilter("minGoal", g)))}
          </div>
          <div className="pill-row" style={{ flexWrap: "wrap" }}>
            {GRADE_OPTIONS.map((g) => pill(f.minGrade === g, g ? `Grade ${g} or better` : "Any grade", () => setListFilter("minGrade", g)))}
          </div>
          <div className="pill-row" style={{ flexWrap: "wrap" }}>
            {pill(f.signals, signalLabel, () => setListFilter("signals", !f.signals))}
            {pill(f.soft, "Soft defense tonight", () => setListFilter("soft", !f.soft), "Opponent in tonight's softest third by expected goals allowed — the matchup factor that tested real")}
            {pill(f.breakout, "🚀 Breakout Watch", () => setListFilter("breakout", !f.breakout), "Rising expected goals into a soft defense, outside the model's top 15%")}
            {pill(f.confirmed, "✅ In official lineup", () => setListFilter("confirmed", !f.confirmed), "Only skaters in tonight's posted lineup (around warmups)")}
            {pill(f.strongH2H, "🔁 Strong H2H (A/A+)", () => setListFilter("strongH2H", !f.strongH2H), "History vs tonight's opponent well above their own norm — context, not a prediction")}
          </div>
        </div>
      )}
    </div>
  );
}
