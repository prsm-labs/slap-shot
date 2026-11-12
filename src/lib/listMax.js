// 2026-11-12 (user: no more than 3 players in any of our pick lists, across every app; the track records grade only each list's #1).
// LIST_MAX caps every pick list (hooks + cards); rec1() rebuilds a list's record from each night's #1 pick only.
export const LIST_MAX = 3;

// nights: [{ date, ... }]; pick(n) -> that night's ranked picks ([0] = #1, with result 'hit' / 'miss' and chance 0-1); since = only from that date
export function rec1(nights, pick, since) {
  let n = 0, hits = 0, said = 0, own = 0, ownN = 0;
  for (const nt of nights || []) {
    if (since && nt.date < since) continue;
    const c = (pick(nt) || [])[0];
    if (!c || (c.result !== "hit" && c.result !== "miss")) continue;
    n += 1; hits += c.result === "hit" ? 1 : 0; said += c.chance || 0;
    if (c.own != null) { own += c.own; ownN += 1; }
  }
  return { n, hits, said: n ? said / n : null, own: ownN ? own / ownN : null, first: true };
}
