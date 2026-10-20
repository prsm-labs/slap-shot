// 💎 PRISM Picks v2 "real lines" (2026-10-20): tonight's best looks on lines a skater only clears about half the time (v1
// picked lines like 2+ SOG that books price at -1000). Rule, calibration and backtest: nhl_project/build_prism_picks.py
// (which also rebuilds every past night from the locked snapshots and writes public/data/prism_picks.json: last-20 form,
// knots, bands). Here the same rule runs on the live pool, so lineup / goalie news moves the picks until puck drop.
//   lines: shots on goal = his last-20 median rounded up +0 / +1 / +2 (at least 2); points = 1+ / 2+; a line counts only
//          if he hit it in 55% or fewer of his last 20 games
//   chance: Poisson with the mean matching the grade model's calibrated chance (3+ SOG -> SOG mean, point -> points mean),
//           then the fitted calibration knots; keep 55% to 75%, one per player, 2 per game, top 5

const LABEL = { SOG: "shots on goal", PTS: "point" };

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
const median = (v) => { const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

function linesFor(vals, stat, R) {
  if (!vals || vals.length < R.min_games) return [];
  const med = median(vals), out = [];
  for (const d of stat === "SOG" ? R.sog_steps : R.pts_steps) {
    const T = Math.max(Math.ceil(med) + d, R.min_line[stat]);
    const hits = vals.filter((v) => v >= T).length;
    if (hits / vals.length <= R.real && !out.some((o) => o.T === T)) out.push({ T, hits });
  }
  return out;
}

export function lineChance(stat, T, p, data) {
  let raw;
  if (stat === "SOG") { if (p.modelProbs?.sog3 == null) return null; raw = tail(lamFor(p.modelProbs.sog3, 3), T); }
  else { if (p.anytimePointPct == null) return null; raw = tail(-Math.log(Math.max(1e-6, 1 - Math.min(p.anytimePointPct / 100, 0.999))), T); }
  return interp(raw, data.knots[stat]);
}

// Hit rate of past PRISM Picks at this chance (backtest + graded live nights), small bands leaning on the chance itself
// trimmed by how far all past picks fell short of what the model said.
export function trackRate(chance, data) {
  const bt = data.backtest;
  const prior = Math.min(0.99, (chance * (bt.hits + data.live.hits)) / (bt.said * bt.n + data.live.said));
  const band = data.bands.find(([lo, hi]) => chance >= lo && chance < hi) || data.bands[0];
  const K = 40;
  return { rate: (band[3] + K * prior) / (band[2] + K), n: band[2] };
}

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
export function bookFor(odds, name, stat, T) {
  const offers = odds?.players?.[norm(name)]?.[stat] || [];
  if (!offers.length) return null;
  const same = offers.filter((o) => Math.abs(o.point - (T - 0.5)) < 1e-6 && o.over != null);
  if (same.length) { const o = same.reduce((a, b) => (b.over > a.over ? b : a)); return { ...o, same: true }; }
  const o = offers.reduce((a, b) => (Math.abs(b.point - (T - 0.5)) < Math.abs(a.point - (T - 0.5)) ? b : a));
  return { ...o, same: false };
}

export function prismPicks(players, data, odds) {
  if (!players || !data?.knots) return [];
  const R = data.rule;
  const cands = [];
  for (const p of players) {
    if (p.gameStarted || !p.modelProbs) continue;
    const f = data.form[p.playerId];
    if (!f) continue;
    for (const [stat, vals] of [["SOG", f.s], ["PTS", f.p]]) {
      for (const { T, hits } of linesFor(vals, stat, R)) {
        const c = lineChance(stat, T, p, data);
        if (c == null || c < R.floor || c >= R.cap) continue;
        cands.push({ p, stat, line: T, label: `${T}+ ${LABEL[stat]}${stat === "PTS" && T > 1 ? "s" : ""}`, chance: c, last: [vals.length, hits],
          game: [p.team, p.opponentTeam].sort().join("-") });
      }
    }
  }
  cands.sort((a, b) => b.chance - a.chance);
  const out = [], seen = new Set(), per = {};
  for (const c of cands) {
    if (seen.has(c.p.playerId) || (per[c.game] || 0) >= R.per_game) continue;
    seen.add(c.p.playerId);
    per[c.game] = (per[c.game] || 0) + 1;
    out.push({ ...c, track: trackRate(c.chance, data), book: bookFor(odds, c.p.name, c.stat, c.line) });
    if (out.length === R.picks) break;
  }
  return out;
}
