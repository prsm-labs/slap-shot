import { CALIBRATION } from "./calibration.js";

// Shots on goal and high-danger attempts per 60 over the most recent ~120 minutes of ice time (same window as
// lib/calibration.js: walk back through last7 to 120 min, needs 90+), each vs the season rate per 60.
// Display / sort only: SOG and HD over this window tested as no extra signal once the model is calibrated
// (the danger-weighted version, own xG, already feeds the point %).
export function last120(p) {
  const out = { l120Min: null, sog120: null, sog120x: null, hd120: null, hd120x: null };
  let sec = 0, sog = 0, hd = 0;
  for (const g of [...(p.last7 || [])].reverse()) {
    if (sec >= CALIBRATION.windowSec) break;
    sec += g.icetime || 0; sog += g.sog || 0; hd += g.hd || 0;
  }
  if (sec < CALIBRATION.minSec || !(p.icetime > 0)) return out;
  const seasonSog = p.ShotsOnGoalPerGame != null ? (p.ShotsOnGoalPerGame * p.games_played * 3600) / p.icetime : null;
  const seasonHd = p.HDCF != null ? (p.HDCF * 3600) / p.icetime : null;
  return {
    l120Min: Math.round(sec / 60), sog120Count: sog, hd120Count: hd,
    sog120: Math.round((sog * 36000) / sec) / 10, hd120: Math.round((hd * 36000) / sec) / 10,
    sog60Season: seasonSog, hd60Season: seasonHd,
    sog120x: seasonSog > 0 ? Math.round(((sog * 3600) / sec / seasonSog) * 100) / 100 : null,
    hd120x: seasonHd > 0 ? Math.round(((hd * 3600) / sec / seasonHd) * 100) / 100 : null,
  };
}

// Table columns for components/L120Cell.jsx (key, label, header tooltip).
export const L120_COLS = [
  ["sog120x", "SOG/60 L120", "Shots on goal per 60 over the last ~120 minutes on ice, and vs the season rate (sorts by the rise). Context — not an extra input to the scores"],
  ["hd120x", "HD/60 L120", "High-danger shot attempts (within 20 ft) per 60 over the last ~120 minutes on ice, and vs the season rate (sorts by the rise). Context — not an extra input to the scores"],
];
