// Ported directly from Going Yard's real OddsCalculatorSlideout (mlb_project/going-yard/
// src/App.jsx:13093-13143) — zero sport-specific logic, confirmed by direct read before
// porting per slap-shot-build.md §8's caveat. Odds math is odds math regardless of sport.
export const CCY_SYM = { USD: "$", EUR: "€", GBP: "£", CAD: "CA$", AUD: "A$", JPY: "¥" };

export function amToDecimal(a) {
  return a > 0 ? a / 100 + 1 : 100 / Math.abs(a) + 1;
}
export function decToAmerican(d) {
  return d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1));
}
export function parseOdds(raw) {
  const s = (raw || "").trim();
  if (!s) return null;
  if (s.startsWith("+") || s.startsWith("-")) {
    const a = parseFloat(s);
    if (isNaN(a) || Math.abs(a) < 100) return null;
    return { american: a, decimal: +amToDecimal(a).toFixed(4) };
  }
  if (s.includes(".")) {
    const d = parseFloat(s);
    if (isNaN(d) || d <= 1) return null;
    return { american: decToAmerican(d), decimal: d };
  }
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  if (n >= 100) return { american: n, decimal: +amToDecimal(n).toFixed(4) };
  if (n > 1) return { american: decToAmerican(n), decimal: n };
  return null;
}

export function riskDesc(frac) {
  if (frac >= 1.0) return "Full unit (Favorite)";
  if (frac >= 0.75) return "Standard play";
  if (frac >= 0.5) return "Half unit";
  if (frac >= 0.25) return "Quarter unit";
  if (frac >= 0.125) return "Micro-fractional (Longshot)";
  return "Minimum stake (Extreme longshot)";
}

// Straight N-leg parlay — multiply decimal odds across every leg.
export function parlayDecimal(parsedLegs) {
  return parsedLegs.reduce((acc, p) => acc * p.decimal, 1);
}
