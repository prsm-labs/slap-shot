import { useEffect, useState } from "react";
import { PickLine, rolling, TrendKey, TrendProj, TrendSeg } from "./Trend.jsx";

// Plain-div, no-library bar chart — direct analogue of Going Yard's real Last7HRChart
// (mlb_project/going-yard/src/App.jsx:19921), confirmed this session to have zero chart
// dependency: hardcoded pill categories, bar height/color driven by a per-category threshold
// check. See slap-shot-build.md §7 — thresholds below are placeholders, not yet validated
// against a real season distribution.
const SKATER_VIEWS = [
  ["goal", "🚨 Goal", (g) => g.goals || 0, 1],
  ["point", "🎯 Point", (g) => g.points ?? g.goals ?? 0, 1], // real points from MoneyPuck's game lines
  // 2026-11-09 (user: assists were missing): rows without an assists field (H2H / home-road) use points - goals
  ["assist", "🅰️ Assist", (g) => g.assists ?? Math.max(0, (g.points ?? 0) - (g.goals ?? 0)), 1],
  ["sog3", "⚡ 3+ SOG", (g) => g.sog || 0, 3],
];

// "9/29" and "@CAR" / "vs CAR" under each bar.
function barDate(g, showYear) {
  if (!g.date) return "";
  const [y, m, d] = g.date.split("-");
  return showYear ? `${Number(m)}/${Number(d)}/${y.slice(2)}` : `${Number(m)}/${Number(d)}`;
}
function barOpp(g) {
  if (!g.opp) return "";
  return g.home ? `vs ${g.opp}` : `@${g.opp}`;
}
const GOALIE_VIEWS = [
  ["win", "🏆 Win", (g) => (g.win ? 1 : 0), 1],
  ["sv900", "🧤 SV%≥.900", (g) => (g.savePct != null && g.savePct >= 0.9 ? 1 : 0), 1],
  ["shutout", "🥅 Shutout", (g) => (g.shutout ? 1 : 0), 1],
];

// views / showYear / emptyText: optional, for the H2H views in the skater slideout.
// trend (2026-11-07): last-5 rolling average through the bars + proj = { goal, point, sog3 } tonight's expected count (dashed),
// only on the skater's recent-games view (SkaterCharts passes them there)
// 2026-11-09 (user: picking Points then switching Last 7 / H2H / Home-Road reset to Goal): the picked stat is remembered per role
// across every chart (and the next player opened); a view set without that stat (e.g. vs-goalie: no assists) shows its first.
const picked = { skater: null, goalie: null };

// pick (2026-11-13, user): { view, line } from the Hit rates card -- that view moves first, switches on and uses the picked line
export default function L7Chart({ games, role = "skater", views: customViews, showYear = false, emptyText, trend = false, proj = null, pick = null }) {
  const views = customViews || (role === "goalie" ? GOALIE_VIEWS : SKATER_VIEWS);
  const [viewKey, setViewKeyRaw] = useState(() => (views.some((v) => v[0] === picked[role]) ? picked[role] : views[0][0]));
  const setViewKey = (k) => { picked[role] = k; setViewKeyRaw(k); };
  const view = views.find((v) => v[0] === viewKey) || views[0];
  const pv = pick && views.some((v) => v[0] === pick.view) ? pick.view : null;
  useEffect(() => { if (pv) { picked[role] = pv; setViewKeyRaw(pv); } }, [pv, pick?.line]); // eslint-disable-line react-hooks/exhaustive-deps
  const mine = pv != null && view[0] === pv;
  const [, , getValue, baseTh] = view;
  const threshold = mine ? pick.line : baseTh;
  const shown = pv ? [views.find((v) => v[0] === pv), ...views.filter((v) => v[0] !== pv)] : views;
  const pillLabel = (key, lbl) => (key === pv ? lbl.replace(/^(\S+)\s+(\d+\+\s+)?/, `$1 ${pick.line}+ `) : lbl);

  if (!games || games.length === 0) {
    return <div className="mono" style={{ fontSize: 11, color: "var(--muted)", padding: "8px 0" }}>{emptyText || "No recent game log available."}</div>;
  }

  const g7 = games.slice(-7);
  const hitGames = g7.filter((g) => getValue(g) >= threshold).length;
  const pct = Math.round((hitGames / g7.length) * 100);
  const maxVal = Math.max(threshold, ...g7.map(getValue));
  const BAR_H = 100;
  const pctColor = pct >= 57 ? "var(--green)" : pct >= 43 ? "var(--warn)" : "var(--muted)";
  // trend over every game passed in (rolling needs the games before the 7 shown), on the bars' scale (value / max)
  const allVals = games.map(getValue);
  const tr = trend ? rolling(allVals, games.map((g) => g.today)).slice(-g7.length).map((v) => (v == null ? null : (v / maxVal) * 100)) : [];
  const pj = trend && proj?.[viewKey] != null ? proj[viewKey] : null;

  return (
    <div className={`card ${mine ? "chart-mine" : ""}`} style={{ marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div className="pill-row">
          {shown.map(([key, lbl]) => (
            <button key={key} className={`pill-btn ${viewKey === key ? "active" : ""}`} onClick={() => setViewKey(key)}>
              {pillLabel(key, lbl)}
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
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", gap: 2, position: "relative" }}>
              <TrendSeg y={tr[i]} next={tr[i + 1]} gap={4} title={tr[i] != null ? `Last-5 average: ${((tr[i] / 100) * maxVal).toFixed(2)}` : undefined} />
              <PickLine y={mine ? Math.min(100, (threshold / maxVal) * 100) : null} gap={4} title={mine ? `Your hit-rate line: ${threshold}+` : undefined} />
              <TrendProj y={pj != null ? Math.min(100, (pj / maxVal) * 100) : null} gap={4} title={pj != null ? `Tonight's projection: ${pj.toFixed(2)}` : undefined} />
              <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: isHit ? "var(--accent2)" : "var(--red)" }}>{val}</span>
              <div style={{
                width: "100%", borderRadius: "4px 4px 0 0", height: barH,
                background: isHit ? "linear-gradient(180deg,var(--accent2),var(--accent))" : "rgba(255,64,32,.15)",
                // 2026-10-20: tonight's game (live slideout) is outlined, green while live
                outline: g.today ? `1.5px solid ${g.live ? "var(--green)" : "var(--text)"}` : undefined, outlineOffset: g.today ? 1 : undefined,
              }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
        {g7.map((g, i) => (
          <div key={i} className="mono" style={{ flex: 1, textAlign: "center", fontSize: 9, lineHeight: 1.3, color: "var(--muted)", minWidth: 0 }}>
            <div style={g.today ? { color: g.live ? "var(--green)" : "var(--text)", fontWeight: 700 } : undefined}>{g.today ? (g.live ? "LIVE" : "Tonight") : barDate(g, showYear)}</div>
            <div style={{ color: "var(--text)", whiteSpace: "nowrap" }}>{barOpp(g)}</div>
          </div>
        ))}
      </div>
      {(trend || mine) && <TrendKey proj={trend && pj != null} projLabel="tonight's expected count (from our chance)" pick={mine ? "your hit-rate line" : null} />}
    </div>
  );
}
