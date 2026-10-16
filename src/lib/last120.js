import { CALIBRATION } from "./calibration.js";

// Shots on goal, high-danger attempts, assists and points per 60 over the most recent ~120 minutes of ice time (same
// window as lib/calibration.js: walk back through last7 to 120 min, needs 90+), each vs the season rate per 60.
// Display / sort only: SOG and HD over this window tested as no extra signal once the model is calibrated
// (the danger-weighted version, own xG, already feeds the point %). Assists / points over ~120 min are a handful of
// events, so their rise ("2.5x") swings a lot — those two columns sort by the rate itself, not the rise.
export function last120(p) {
  const out = { l120Min: null, sog120: null, sog120x: null, hd120: null, hd120x: null, a120: null, a120x: null, p120: null, p120x: null };
  let sec = 0, sog = 0, hd = 0, ast = 0, pts = 0;
  for (const g of [...(p.last7 || [])].reverse()) {
    if (sec >= CALIBRATION.windowSec) break;
    sec += g.icetime || 0; sog += g.sog || 0; hd += g.hd || 0; ast += g.assists || 0; pts += g.points || 0;
  }
  if (sec < CALIBRATION.minSec || !(p.icetime > 0)) return out;
  const seasonSog = p.ShotsOnGoalPerGame != null ? (p.ShotsOnGoalPerGame * p.games_played * 3600) / p.icetime : null;
  const seasonHd = p.HDCF != null ? (p.HDCF * 3600) / p.icetime : null;
  const assists = p.I_F_primaryAssists != null ? p.I_F_primaryAssists + (p.I_F_secondaryAssists || 0) : null;
  const seasonA = assists != null ? (assists * 3600) / p.icetime : null;
  const seasonP = p.I_F_points != null ? (p.I_F_points * 3600) / p.icetime : null;
  const per60 = (n) => Math.round((n * 36000) / sec) / 10;
  const rise = (n, season) => (season > 0 ? Math.round(((n * 3600) / sec / season) * 100) / 100 : null);
  return {
    l120Min: Math.round(sec / 60), sog120Count: sog, hd120Count: hd,
    sog120: Math.round((sog * 36000) / sec) / 10, hd120: Math.round((hd * 36000) / sec) / 10,
    sog60Season: seasonSog, hd60Season: seasonHd,
    sog120x: seasonSog > 0 ? Math.round(((sog * 3600) / sec / seasonSog) * 100) / 100 : null,
    hd120x: seasonHd > 0 ? Math.round(((hd * 3600) / sec / seasonHd) * 100) / 100 : null,
    a120Count: ast, a120: per60(ast), a60Season: seasonA, a120x: rise(ast, seasonA),
    p120Count: pts, p120: per60(pts), p60Season: seasonP, p120x: rise(pts, seasonP),
  };
}

// Table columns for components/L120Cell.jsx (key, label, header tooltip, cell kind).
export const L120_COLS = [
  ["sog120x", "SOG/60 L120", "Shots on goal per 60 over the last ~120 minutes on ice, and vs the season rate (sorts by the rise). Context — not an extra input to the scores", "sog"],
  ["hd120x", "HD/60 L120", "High-danger shot attempts (within 20 ft) per 60 over the last ~120 minutes on ice, and vs the season rate (sorts by the rise). Context — not an extra input to the scores", "hd"],
  ["a120", "A/60 L120", "Assists per 60 over the last ~120 minutes on ice, and vs the season rate. Sorts by the rate (a few assists swing the rise a lot). Context — not an extra input to the scores", "a"],
  ["p120", "P/60 L120", "Points per 60 over the last ~120 minutes on ice, and vs the season rate. Sorts by the rate (a few points swing the rise a lot). Context — not an extra input to the scores", "p"],
];
