import { useState } from "react";

// Plain-div, no-library bar chart — direct analogue of Going Yard's real Last7HRChart
// (mlb_project/going-yard/src/App.jsx:19921), confirmed this session to have zero chart
// dependency: hardcoded pill categories, bar height/color driven by a per-category threshold
// check. See slap-shot-build.md §7 — thresholds below are placeholders, not yet validated
// against a real season distribution.
const SKATER_VIEWS = [
  ["goal", "🚨 Goal", (g) => g.goals || 0, 1],
  ["point", "🎯 Point", (g) => g.goals || 0, 1], // == goals here: no assist events in shots_2025.csv (see build_player_pool.py)
  ["sog3", "⚡ 3+ SOG", (g) => g.sog || 0, 3],
];
const GOALIE_VIEWS = [
  ["win", "🏆 Win", (g) => (g.win ? 1 : 0), 1],
  ["sv900", "🧤 SV%≥.900", (g) => (g.savePct != null && g.savePct >= 0.9 ? 1 : 0), 1],
  ["shutout", "🥅 Shutout", (g) => (g.shutout ? 1 : 0), 1],
];

export default function L7Chart({ games, role = "skater" }) {
  const views = role === "goalie" ? GOALIE_VIEWS : SKATER_VIEWS;
  const [viewKey, setViewKey] = useState(views[0][0]);
  const view = views.find((v) => v[0] === viewKey) || views[0];
  const [, , getValue, threshold] = view;

  if (!games || games.length === 0) {
    return <div className="mono" style={{ fontSize: 11, color: "var(--muted)", padding: "8px 0" }}>No recent game log available.</div>;
  }

  const g7 = games.slice(-7);
  const hitGames = g7.filter((g) => getValue(g) >= threshold).length;
  const pct = Math.round((hitGames / g7.length) * 100);
  const maxVal = Math.max(threshold, ...g7.map(getValue));
  const BAR_H = 100;
  const pctColor = pct >= 57 ? "var(--green)" : pct >= 43 ? "#e0b04a" : "var(--muted)";

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div className="pill-row">
          {views.map(([key, lbl]) => (
            <button key={key} className={`pill-btn ${viewKey === key ? "active" : ""}`} onClick={() => setViewKey(key)}>
              {lbl}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>{hitGames} of {g7.length}</span>
          <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 800, fontSize: 18, color: pctColor }}>{pct}%</span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: BAR_H }}>
        {g7.map((g, i) => {
          const val = getValue(g);
          const isHit = val >= threshold;
          const barH = isHit ? Math.max(Math.round(BAR_H * (val / maxVal)), Math.round(BAR_H * 0.25)) : 2;
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", gap: 2 }}>
              <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: isHit ? "var(--accent2)" : "var(--red)" }}>{val}</span>
              <div style={{
                width: "100%", borderRadius: "4px 4px 0 0", height: barH,
                background: isHit ? "linear-gradient(180deg,var(--accent2),var(--accent))" : "rgba(255,64,32,.15)",
              }} />
            </div>
          );
        })}
      </div>
      {role === "skater" && viewKey === "point" && (
        <div className="mono" style={{ fontSize: 9, color: "var(--muted)", marginTop: 8 }}>
          Assist data isn't in the current pipeline output yet — "Point" shows goals only until wired up (slap-shot-build.md §3).
        </div>
      )}
    </div>
  );
}
