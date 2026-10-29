import { useEffect, useState } from "react";

// 2026-10-28 hit-rate card adapter (components/HitRateCard.jsx, same card as CourtIQ / Six Points): this season's + last
// season's skater game logs from the Stats tab files (stats_<season>.json), one row per game he played, with the team's
// previous game (after a win / loss -- OT / SO losses count as losses -- and days of rest) and that season's defenses
// (goals or shots on goal allowed per game, ranked: 10 softest / 10 stingiest of the league).
const cache = {};
const load = (s) => (cache[s] = cache[s] || fetch(`/data/stats_${s}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
const prevSeason = (s) => { const y = Number(s.slice(0, 4)) - 1; return `${y}-${String(y + 1).slice(2)}`; };
const DEF = { G: "o_g", A: "o_g", PTS: "o_g", SOG: "o_sog" };
const day = (d) => Date.parse(`${d}T12:00:00Z`) / 864e5;
const lost = (res) => /^(L|OTL|SOL)/.test(String(res || ""));

const seasonCache = new Map();
function prepSeason(S) {
  if (seasonCache.has(S)) return seasonCache.get(S);
  const tix = Object.fromEntries(S.team_cols.map((c, i) => [c, i]));
  const sched = {};
  const allowed = {};
  for (const [team, rows] of Object.entries(S.teams || {})) {
    sched[team] = rows.map((r) => ({ d: r[tix.d], res: r[tix.res] })).sort((a, b) => (a.d < b.d ? -1 : 1));
    allowed[team] = Object.fromEntries(Object.entries(DEF).map(([k, c]) => [k, rows.reduce((s, r) => s + Number(r[tix[c]] || 0), 0) / (rows.length || 1)]));
  }
  const teams = Object.keys(allowed);
  const tier = {};
  for (const k of Object.keys(DEF)) {
    const order = [...teams].sort((a, b) => allowed[b][k] - allowed[a][k]); // most allowed first = softest
    order.forEach((t, i) => { (tier[t] ||= {})[k] = i < 10 ? "soft" : i >= order.length - 10 ? "tough" : "avg"; });
  }
  const out = { sched, tier, pix: Object.fromEntries(S.player_cols.map((c, i) => [c, i])) };
  seasonCache.set(S, out);
  return out;
}

function rowsFor(S, id, which) {
  const rows = S?.players?.[String(id)]?.g;
  if (!rows) return [];
  const { sched, tier, pix } = prepSeason(S);
  return rows.filter((r) => Number(r[pix.toi]) > 0).map((r) => {
    const d = r[pix.d], team = r[pix.team], opp = r[pix.opp];
    const sc = sched[team] || [];
    const i = sc.findIndex((x) => x.d === d);
    const prev = i > 0 ? sc[i - 1] : null;
    const v = (c) => Number(r[pix[c]] || 0);
    return {
      date: d, season: which, opp, home: r[pix.ha] === "vs", played: v("toi"),
      v: { G: v("g"), A: v("a"), PTS: v("pts"), SOG: v("sog") }, att: v("att"), xg: v("xg"), // att / xg: past-night Last 7 chart
      afterLoss: prev ? lost(prev.res) : null, rest: prev ? Math.round(day(d) - day(prev.d)) - 1 : null, tier: tier[opp] || {},
    };
  });
}

export function useHitGames(playerId, season) {
  const [state, setState] = useState({ games: null, ready: false });
  useEffect(() => {
    let alive = true;
    setState({ games: null, ready: false });
    if (!playerId || !season) return undefined;
    Promise.all([load(season), load(prevSeason(season))]).then(([cur, prev]) => {
      if (alive) setState({ games: [...rowsFor(cur, playerId, "cur"), ...rowsFor(prev, playerId, "prev")], ready: true });
    });
    return () => { alive = false; };
  }, [playerId, season]);
  return state;
}
