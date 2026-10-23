// 💎 PRISM Picks (2026-10-20): tonight's few props with the highest tested hit rates that aren't the obvious ones. The rule
// and the backtest live in nhl_project/build_prism_picks.py (which also rebuilds every past night from the locked snapshot
// and writes public/data/prism_picks.json: each skater's last-20 form, the hit-rate bands, the graded nights). Here the same
// rule runs on the live pool, so late lineup / goalie news moves the picks until puck drop.
//   props: 1+ point (point %), 3+ SOG (grade-model 3+ SOG %), 2+ SOG (from the 3+ SOG chance)
//   rule: model chance 70%+, his last-20 rate on the prop 80% or lower and at least 5 points under the model,
//         one prop per player, 2 per game, top 5

const PROPS = [["point", "1+ point"], ["sog2", "2+ shots on goal"], ["sog3", "3+ shots on goal"]];

export function sog2Chance(p3, coef) {
  if (p3 == null) return null;
  const q = Math.min(Math.max(p3, 1e-4), 1 - 1e-4);
  const l = Math.log(q / (1 - q));
  return 1 / (1 + Math.exp(-(coef[0] + coef[1] * l + coef[2] * l * l)));
}

// Hit rate of past PRISM Picks at this chance (backtest + graded live nights), small bands leaning on the chance itself
// trimmed by how far all past picks fell short of what the model said.
export function trackRate(chance, data) {
  const bt = data.backtest;
  const n = bt.n + data.live.n;
  const prior = Math.min(0.99, (chance * (bt.hits + data.live.hits)) / (bt.said * bt.n + data.live.said));
  const band = data.bands.find(([lo, hi]) => chance >= lo && chance < hi) || data.bands[0];
  const K = 40;
  return { rate: (band[3] + K * prior) / (band[2] + K), n: band[2], all: n };
}

export function prismPicks(players, data) {
  if (!players || !data) return [];
  const R = data.rule;
  const cands = [];
  for (const p of players) {
    if (p.gameStarted || !p.modelProbs) continue;
    const f = data.form[p.playerId];
    if (!f || f[0] < R.min_games) continue;
    const ch = {
      point: p.anytimePointPct != null ? p.anytimePointPct / 100 : null,
      sog3: p.modelProbs.sog3 ?? null,
      sog2: sog2Chance(p.modelProbs.sog3, data.sog2),
    };
    PROPS.forEach(([key, label], k) => {
      const c = ch[key];
      if (c == null || c < R.floor) return;
      const rate = f[k + 1] / f[0];
      if (rate > R.last_max || c < rate + R.margin) return;
      cands.push({ p, key, label, chance: c, last: [f[0], f[k + 1]], game: [p.team, p.opponentTeam].sort().join("-") });
    });
  }
  cands.sort((a, b) => b.chance - a.chance);
  const out = [];
  const seen = new Set();
  const per = {};
  for (const c of cands) {
    if (seen.has(c.p.playerId) || (per[c.game] || 0) >= R.per_game) continue;
    seen.add(c.p.playerId);
    per[c.game] = (per[c.game] || 0) + 1;
    out.push({ ...c, track: trackRate(c.chance, data) });
    if (out.length === R.picks) break;
  }
  return out;
}
