// Defense vs position — what tonight's opponent allows to this skater's position (C / LW / RW / D) per game,
// from the pool's _meta.dvp (build_player_pool.py build_dvp; last season + this season). Context only, like H2H:
// over 4 seasons (scratch dvp_test.py, 2026-10-13) it predicted goals only because it carries the team's overall
// defense — already in the matchup adjustment and the ▲ / ▼ on grades. The position split itself added nothing and
// didn't repeat from the first half of a season to the second.

const POS_LABEL = { C: "C", L: "LW", R: "RW", D: "D" };
const cache = new WeakMap();

// Per position: Map team -> rank by goals allowed per game to that position (1 = most allowed), ties by points.
function ranks(dvp) {
  if (cache.has(dvp)) return cache.get(dvp);
  const out = {};
  for (const pos of Object.keys(POS_LABEL)) {
    const teams = Object.keys(dvp).filter((t) => dvp[t][pos]);
    teams.sort((a, b) => dvp[b][pos].g - dvp[a][pos].g || dvp[b][pos].p - dvp[a][pos].p);
    out[pos] = { of: teams.length, rank: new Map(teams.map((t, i) => [t, i + 1])) };
  }
  cache.set(dvp, out);
  return out;
}

// -> { pos, label, opp, g, p, sog, gp, rank, of } or null
export function dvpFor(meta, p) {
  const dvp = meta?.dvp;
  const row = dvp?.[p?.opponentTeam]?.[p?.position];
  if (!row) return null;
  const r = ranks(dvp)[p.position];
  return { pos: p.position, label: POS_LABEL[p.position] || p.position, opp: p.opponentTeam, ...row,
    gp: dvp[p.opponentTeam].gp, rank: r.rank.get(p.opponentTeam), of: r.of };
}

export function dvpText(d) {
  if (!d) return "";
  return `${d.opp} allows ${d.g.toFixed(2)} goals / ${d.p.toFixed(2)} points / ${d.sog.toFixed(1)} shots per game to ${d.label}s `
    + `(#${d.rank} most of ${d.of}, ${d.gp} games, last season + this). Context only — the position split isn't predictive; `
    + "the team's overall defense (▲ / ▼ on the grade) is.";
}
