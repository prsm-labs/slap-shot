// 2026-11-02 (user: find the "other things" -- edges the box score doesn't carry -- and add them as filters). Each edge was tested
// on the held-out Risk Slider rows 2023-26 against the CALIBRATED chance the app already shows, vs its own season's baseline, and
// kept only if it beat (or missed) that chance in every season; the game-script ones were also checked on the 2026 live frozen picks
// (claude/REPORT_ComboFilters_2026-11-02.md). Context only -- projections and chances don't change.
//   😴 Opponent on a B2B     beat our chance +1.4 pts every season; with a rest edge on top +4.5 (points), with 4+ days off +8.7
//   🔋 Rest edge             2+ more days off than the opponent: points +3.7 every season
//   🏠 Home favorite         home + team win chance 55%+: points 2026 live 37.8% said -> 40.9%; board pairs +3.1 to +5.2
//   🧳 Road underdog (avoid) road + win chance 45% or less: points -4.5 every season; 2026 live 3+ SOG 20.2% -> 16.8%
//   ⛰️ B2B at altitude (avoid) second night at COL / UTA / CGY: -7.0 every season
const ALTITUDE = new Set(["COL", "UTA", "CGY"]);
export const EDGES = [
  { v: "oppb2b", label: "😴 Opponent on a B2B", title: "Tonight's opponent played yesterday. 2023-26 held out: lines hit 1.4 pts more often than our chance, every season — stack with 🔋 Rest edge for +4.5 on points" },
  { v: "restedge", label: "🔋 Rest edge", title: "2+ more days of rest than the opponent. Held out: points +3.7 pts over our chance, every season" },
  { v: "homefav", label: "🏠 Home favorite", title: "At home and his team's win chance is 55%+. Points beat our chance in every held-out season and in the 2026 live picks (37.8% said, 40.9% hit)" },
  { v: "roaddog", label: "🧳 Road underdog", title: "On the road with a win chance of 45% or less. Points hit 4.5 pts LESS often than our chance every season; 3+ shots 20.2% said, 16.8% hit live — tap twice to hide them" },
  { v: "altb2b", label: "⛰️ B2B at altitude", title: "Second night of a back-to-back at Colorado, Utah or Calgary. Held out: 7 pts under our chance, every season — tap twice to hide them" },
];

// meta: the pool's meta (b2b { date, yesterday, rest }, slate); players carry teamWin (lib/data.js)
export function edgeKeys(p, meta) {
  const e = [];
  const b2b = meta?.b2b?.date === meta?.slateDate ? meta.b2b : null;
  if (!b2b) return e;
  const yest = new Set(b2b.yesterday || []);
  const rest = b2b.rest || {};
  if (yest.has(p.opponentTeam)) e.push("oppb2b");
  const r = rest[p.team], ro = rest[p.opponentTeam];
  if (r != null && ro != null && r - ro >= 2) e.push("restedge");
  if (p.teamWin != null) {
    if (p.isHome && p.teamWin >= 0.55) e.push("homefav");
    if (!p.isHome && p.teamWin <= 0.45) e.push("roaddog");
  }
  if (yest.has(p.team) && !p.isHome && ALTITUDE.has(p.opponentTeam)) e.push("altb2b");
  return e;
}
