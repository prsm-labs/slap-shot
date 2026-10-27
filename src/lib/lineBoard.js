// 🎚️ Risk slider (2026-10-27): every skater's ladder of lines priced live from the scored pool -- shots on goal 1-7, points 1-4,
// goals 1-3, assists 1-3. Same math as nhl_project/build_line_board.py (which writes the calibration, the backtest, each skater's
// last-20 games and the live record to public/data/line_board.json): Poisson tail from the calibrated chance the page shows
// (3+ SOG -> SOG mean; point / goal / assist chance -> that mean), per-stat isotonic map, then a per-stat logistic with his own
// hit rate on the line over his last 20 games ((hits + 0.5) / (n + 1)).
function tail(lam, T) {
  let s = 0, term = Math.exp(-lam);
  for (let k = 0; k < T; k++) { s += term; term *= lam / (k + 1); }
  return 1 - s;
}
function lamFor(p, k) {
  let lo = 1e-4, hi = 15;
  const q = Math.min(Math.max(p, 1e-4), 0.9999);
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (tail(mid, k) < q) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
function interp(x, [xs, ys]) {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]) { const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1] || 1); return ys[i - 1] + t * (ys[i] - ys[i - 1]); }
  }
  return ys[ys.length - 1];
}
const logit = (x) => { const q = Math.min(Math.max(x, 1e-4), 1 - 1e-4); return Math.log(q / (1 - q)); };
const KEY = { SOG: "s", PTS: "p", G: "g", A: "a" };

// probs: { SOG: 3+ SOG chance, PTS, G, A } (0-1 or null); form: { d, o, s, p, g, a } last 20 games, oldest first
export function ladderFor(probs, form, model) {
  const out = {};
  if (!form || !model) return out;
  for (const st of ["SOG", "PTS", "G", "A"]) {
    const p = probs[st], vals = form[KEY[st]] || [];
    if (p == null || vals.length < model.min_games) continue;
    const lam = st === "SOG" ? lamFor(p, 3) : -Math.log(Math.max(1e-6, 1 - Math.min(p, 0.999)));
    const c = model.cal[st], rows = [];
    for (const T of model.ladder[st]) {
      const raw = tail(lam, T);
      if (!(raw > 0.01 && raw < 0.99)) continue;
      const hits = vals.filter((v) => v >= T).length;
      const a = logit(interp(raw, c.knots)), b = logit((hits + 0.5) / (vals.length + 1)), w = c.w;
      const ch = 1 / (1 + Math.exp(-(w[0] + w[1] * a + w[2] * b + w[3] * a * b)));
      if (ch >= 0.02 && ch <= 0.98) rows.push([T, ch, hits]);
    }
    if (rows.length) out[st] = rows;
  }
  return out;
}

// form as of a past night: only the games before it
export function formBefore(form, date) {
  if (!form || !date) return form;
  const keep = form.d.map((d) => d < date);
  const pick = (a) => (a || []).filter((_, i) => keep[i]);
  return { d: pick(form.d), o: pick(form.o), s: pick(form.s), p: pick(form.p), g: pick(form.g), a: pick(form.a) };
}

export const recentOf = (form) => (form?.d || []).map((d, i) => ({ d, o: form.o?.[i], v: { SOG: form.s[i], PTS: form.p[i], G: form.g[i], A: form.a?.[i] } }));
