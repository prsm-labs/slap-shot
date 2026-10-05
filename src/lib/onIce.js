// Who's on the ice right now, estimated from the live box score. The NHL publishes no live on-ice
// list (shift charts post a period at a time, after it ends), but the box score credits ice time to
// players while they're out there, in batches every ~30-45s. Comparing two consecutive batches:
// the players who gained the most ice time (and anyone who just started a new shift) are the ones
// on the ice, up to the number of skaters each side has (5 at even strength, 4 or 3 shorthanded).
// It trails real line changes by up to one batch.

export const toiSeconds = (t) => {
  const [m, s] = String(t || "0:0").split(":").map(Number);
  return (m || 0) * 60 + (s || 0);
};

// A batch: playerId -> { team, toi (seconds), shifts } for every skater in the box score.
export function batchFromBox(box) {
  const out = new Map();
  for (const side of ["away", "home"]) {
    for (const p of box[side].skaters) out.set(p.playerId, { team: box[side].abbrev, toi: toiSeconds(p.toi), shifts: p.shifts ?? 0 });
  }
  return out;
}

export function sameBatch(a, b) {
  if (!a || !b || a.size !== b.size) return false;
  for (const [id, v] of a) {
    const w = b.get(id);
    if (!w || w.toi !== v.toi || w.shifts !== v.shifts) return false;
  }
  return true;
}

// prev, cur: consecutive (different) batches. skaters: { TEAM: number on the ice } from the
// game situation (defaults to 5). Returns a Set of playerIds.
export function estimateOnIce(prev, cur, skaters = {}) {
  const byTeam = new Map();
  for (const [id, v] of cur) {
    const p = prev.get(id);
    if (!p) continue;
    const gained = v.toi - p.toi;
    const newShift = v.shifts > p.shifts;
    if (gained <= 0 && !newShift) continue;
    if (!byTeam.has(v.team)) byTeam.set(v.team, []);
    byTeam.get(v.team).push({ id, score: gained + (newShift ? NEW_SHIFT_BONUS : 0) });
  }
  const on = new Set();
  for (const [team, list] of byTeam) {
    const n = Math.max(3, Math.min(6, skaters[team] ?? 5));
    list.sort((a, b) => b.score - a.score).slice(0, n).forEach((x) => on.add(x.id));
  }
  return on;
}

// Seconds of credit a just-started shift is worth when ranking (a player who just hopped on has
// gained little time but is the one out there now).
export const NEW_SHIFT_BONUS = 20;
