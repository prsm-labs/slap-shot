import StatGrid from "./StatGrid.jsx";

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

// 2026-11-13 (user: CourtIQ's layout -- one small chart per prop, not one chart with buttons): every stat gets its own chart
// (StatGrid.jsx, same file as Six Points); the stat picked in the Hit rates card comes first on the picked line.
// views / showYear / emptyText: optional, for the H2H views in the skater slideout. trend: last-5 average through the bars;
// proj = { goal, point, assist, sog3 } tonight's expected count (dashed). pick = { view, line } from the Hit rates card.
const NAMES = { goal: "Goals", point: "Points", assist: "Assists", sog3: "Shots on goal", win: "Wins", sv900: "SV% .900+", shutout: "Shutouts" };
const nameOf = (lbl) => lbl.replace(/^\S+\s+/, "").replace(/^\d+\+\s+/, "");

export default function L7Chart({ games, role = "skater", views: customViews, showYear = false, emptyText, trend = false, proj = null, pick = null }) {
  const views = customViews || (role === "goalie" ? GOALIE_VIEWS : SKATER_VIEWS);
  if (!games || games.length === 0) {
    return <div className="mono" style={{ fontSize: 11, color: "var(--muted)", padding: "8px 0" }}>{emptyText || "No recent game log available."}</div>;
  }
  let charts = views.map(([k, lbl, get, line]) => ({ k, label: customViews ? nameOf(lbl) : NAMES[k] || nameOf(lbl), get, line, proj: proj?.[k] ?? null }));
  const pc = pick && charts.find((c) => c.k === pick.view);
  if (pc) charts = [{ ...pc, line: pick.line, mine: true }, ...charts.filter((c) => c !== pc)];
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <StatGrid charts={charts} games={games.slice(-7)} all={games} trend={trend} projLabel="tonight's expected count (from our chance)"
        labels={(g) => [g.today ? (g.live ? "LIVE" : "Tonight") : barDate(g, showYear), barOpp(g)]} />
    </div>
  );
}
