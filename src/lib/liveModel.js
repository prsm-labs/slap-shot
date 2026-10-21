// 2026-10-20 📈 Live projection (user: project the rest of the game from where it stands). Fitted and held out by season in the
// network session (claude/REPORT_LiveRegression_2026-10-20.md): projected final = what he has now + a normal rest of the game =
// pre-game projection x share of the game left x (1 + small nudges for volume / minutes so far and the score). Hot or cold
// shooting / finishing is NOT carried forward -- tested: almost none of it carries into the rest of a game in any of the three
// sports, and projecting from the current pace was worse than ignoring the game entirely. Weights are fitted at each
// quarter / period break and blended in between (at puck drop / tip / kickoff the projection is the pre-game one).
// Chances: the rest of the game is treated as a negative binomial count (yards: normal) with the fitted spread.
/* eslint-disable */
export const LIVE_MODEL = {"sport": "nhl", "checkpoints": [0.3333, 0.6667], "stats": {"sog": {"b": [{"z_vol": 0.0835, "z_m": -0.0441, "z_lead12": -0.0232, "z_trail": -0.015}, {"z_vol": 0.1382, "z_m": -0.0618, "z_lead12": -0.0675, "z_trail": -0.0394}], "phi": [1.136, 1.101]}, "g": {"b": [{"z_vol": 0.065, "z_m": -0.0288, "z_lead12": -0.0432, "z_trail": -0.1442}, {"z_vol": 0.0938, "z_m": -0.0223, "z_lead12": 0.0783, "z_trail": -0.1575}], "phi": [1.1, 1.079]}, "team_goals": {"b": [{"z_m": 0.0006, "z_lead12": 0.0707, "z_trail": 0.0345}, {"z_m": 0.0197, "z_lead12": 0.1501, "z_trail": 0.046}], "phi": [1.029, 1.001]}}};

function coefAt(stat, f) {
  const s = LIVE_MODEL.stats[stat];
  const cps = LIVE_MODEL.checkpoints;
  if (!s) return { b: {}, phi: 1 };
  const lerp = (a, b, w) => {
    const out = {};
    for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) out[k] = (a?.[k] || 0) * (1 - w) + (b?.[k] || 0) * w;
    return out;
  };
  if (f <= cps[0]) return { b: lerp({}, s.b[0], f / cps[0]), phi: s.phi[0] };
  for (let i = 1; i < cps.length; i++) {
    if (f <= cps[i]) {
      const w = (f - cps[i - 1]) / (cps[i] - cps[i - 1]);
      return { b: lerp(s.b[i - 1], s.b[i], w), phi: s.phi[i - 1] * (1 - w) + s.phi[i] * w };
    }
  }
  return { b: s.b[cps.length - 1], phi: s.phi[cps.length - 1] };
}

// pre: pre-game full-game projection; f: share of the game played (0..1); z: { z_vol, z_min, z_m, ... } already computed
export function restOfGame(stat, pre, f, z) {
  if (pre == null || !(pre > 0)) return { mean: 0, phi: 1 };
  const { b, phi } = coefAt(stat, Math.min(1, Math.max(0, f)));
  let adj = 1;
  for (const [k, v] of Object.entries(b)) adj += v * (z[k] || 0);
  return { mean: Math.max(0, (1 - f) * pre * Math.max(0.2, adj)), phi: Math.max(phi, 1.0001) };
}

// volume ratio feature, shrunk with k so one early shot / target can't swing it
export const ratio = (soFar, f, preVol, k) => (preVol == null ? 0 : (soFar + k) / (f * preVol + k) - 1);

function lgamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const v of c) ser += v / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}
// P(rest >= need) for a count with mean m and variance phi * m
export function chanceAtLeast(need, rest) {
  if (need <= 0) return 1;
  const m = rest.mean;
  if (!(m > 0)) return 0;
  const phi = rest.phi;
  let cdf = 0;
  if (phi <= 1.02) {
    let pk = Math.exp(-m);
    for (let k = 0; k < need; k++) { cdf += pk; pk *= m / (k + 1); }
  } else {
    const r = m / (phi - 1), p = 1 / phi;   // NB: mean r(1-p)/p = m, var m / p = phi * m
    for (let k = 0; k < need; k++) cdf += Math.exp(lgamma(k + r) - lgamma(r) - lgamma(k + 1) + r * Math.log(p) + k * Math.log(1 - p));
  }
  return Math.min(1, Math.max(0, 1 - cdf));
}
// yards: normal with variance phi * mean, continuity-corrected
export function chanceAtLeastYards(need, rest) {
  if (need <= 0) return 1;
  const m = rest.mean, sd = Math.sqrt(Math.max(rest.phi * Math.max(m, 1), 1));
  const zc = (need - 0.5 - m) / sd;
  const t = 1 / (1 + 0.2316419 * Math.abs(zc));
  const d = 0.3989423 * Math.exp(-zc * zc / 2);
  const tail = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return zc > 0 ? tail : 1 - tail;
}
