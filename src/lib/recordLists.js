import { useEffect, useState } from "react";

// 2026-11-12 Track Record summary (components/RecordSummary.jsx): every tracked list's nightly picks with our chance and the result,
// read from the files the pipeline already grades. Our chance is the measuring stick -- no book prices anywhere here.
// User (same day): one per category -- list each list's top 3 a night, grade only its #1 (RecordSummary counts rank 1); Tonight's pick is
// PRISM Picks' #1, so it is that row. Plus a model check over every projection by month and markers where tested upgrades shipped.
const TOP = 3;
const get = (u) => fetch(u, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const res = (r) => (r === "hit" ? true : r === "miss" ? false : null);
const STAT = { PTS: "point", A: "assist", G: "goal", SOG: "shots on goal" };
const labelOf = (c) => c.label || (c.stat === "SOG" ? `${c.line}+ shots on goal` : `${c.line}+ ${STAT[c.stat] || c.stat}${c.line > 1 ? "s" : ""}`);
const nightly = (nights, pick, liveSince, top = TOP) => (nights || []).flatMap((n) => (pick(n) || []).slice(0, top).map((c, i) => ({
  date: n.date, rank: i + 1, name: c.name, label: labelOf(c), chance: c.chance, hit: res(c.result), replay: Boolean(n.replay || (liveSince && n.date < liveSince)) })));

// tested model changes shipped this season (each passed a held-out test first; see nhl_project/claude/CLAUDE.md)
export const MODEL_MARKERS = [
  { date: "2026-10-21", label: "ice-time trend added" },
  { date: "2026-11-02", label: "opposing goalie added" },
  { date: "2026-11-08", label: "top goal chances corrected" },
];

// every skater who played, by month: the goal / point chance we showed before the game vs how often it happened
function modelCheck(rows) {
  const m = new Map();
  for (const r of rows || []) {
    const a = r.actual, pr = r.proj || {};
    if (!a?.played || pr.anytimeGoalPct == null) continue;
    const k = r.date.slice(0, 7);
    const x = m.get(k) || { n: 0, g: [0, 0], p: [0, 0, 0] };
    x.n += 1; x.g[0] += pr.anytimeGoalPct / 100; x.g[1] += (a.g || 0) > 0 ? 1 : 0;
    if (pr.anytimePointPct != null) { x.p[0] += pr.anytimePointPct / 100; x.p[1] += (a.p || 0) > 0 ? 1 : 0; x.p[2] += 1; }
    m.set(k, x);
  }
  return [...m.entries()].filter(([, x]) => x.n >= 500).sort().reverse().map(([k, x]) => ({
    month: k, label: new Date(`${k}-15T12:00:00`).toLocaleDateString([], { month: "short", year: "numeric" }), n: x.n,
    stats: [{ label: "Goal", said: x.g[0] / x.n, hit: x.g[1] / x.n }, ...(x.p[2] >= 500 ? [{ label: "Point", said: x.p[0] / x.p[2], hit: x.p[1] / x.p[2] }] : [])],
  }));
}

export function useRecordLists() {
  const [out, setOut] = useState(null);
  useEffect(() => {
    Promise.all(["prism_picks", "radar", "multi", "longshot", "track_record_2026"].map((f) => get(`/data/${f}.json`))).then(([pp, radar, multi, ls, tr]) => {
      const lists = [];
      if (pp?.nights) {
        lists.push({ key: "prism", label: "💎 PRISM Picks · #1 = Tonight's pick", picks: nightly(pp.nights, (n) => n.picks) });
        lists.push({ key: "mid", label: "⚖️ Mid-range", picks: nightly(pp.nights, (n) => n.tiers?.mid) });
        lists.push({ key: "long", label: "🌠 Long shots", picks: nightly(pp.nights, (n) => n.tiers?.long) });
      }
      if (radar?.nights) lists.push({ key: "radar", label: "🔦 Under the radar", picks: nightly(radar.nights, (n) => n.picks, radar.liveSince) });
      if (multi?.nights) {
        lists.push({ key: "multi", label: "🎯 Multi-point", picks: nightly(multi.nights, (n) => n.PTS, multi.liveSince) });
        lists.push({ key: "multiA", label: "🍎 Multi-assist", picks: nightly(multi.nights, (n) => n.A, multi.liveSince) });
      }
      if (ls?.nights) lists.push({ key: "longshot", label: "🎯 Long-shot creators", picks: nightly(ls.nights, (n) => n.picks?.map((c) => ({ ...c, label: "1+ goal" })), ls.liveSince) });
      if (tr?.top3Rows) {
        const per = new Map(); // Top 3 is stored chalk -> mid -> breakout -> long shot; #1 = the chalk pick
        lists.push({ key: "top3", label: "🥇 Top 3 Tonight", picks: tr.top3Rows.filter((r) => r.adjGoalPct != null && (per.set(r.date, (per.get(r.date) || 0) + 1), per.get(r.date) <= TOP)).map((r) => ({
          date: r.date, rank: per.get(r.date) && (tr.top3Rows.filter((x) => x.date === r.date && x.adjGoalPct != null).indexOf(r) + 1), name: r.name, label: "1+ goal", chance: r.adjGoalPct / 100,
          hit: !r.actual || r.actual.played === false ? null : (r.actual.g || 0) > 0 })) });
      }
      const live = [radar?.liveSince, multi?.liveSince, ls?.liveSince].filter(Boolean).sort()[0] || null;
      setOut({ lists: lists.filter((l) => l.picks.length), liveSince: live, modelCheck: modelCheck(tr?.rows), markers: MODEL_MARKERS });
    });
  }, []);
  return out;
}
