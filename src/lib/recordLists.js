import { useEffect, useState } from "react";

// 2026-11-12 Track Record summary (components/RecordSummary.jsx): every tracked list's nightly picks with our chance and the result,
// read from the files the pipeline already grades. Our chance is the measuring stick -- no book prices anywhere here.
const get = (u) => fetch(u, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const res = (r) => (r === "hit" ? true : r === "miss" ? false : null);
const nightly = (nights, pick, liveSince) => (nights || []).flatMap((n) => (pick(n) || []).map((c) => ({
  date: n.date, name: c.name, label: c.label || `${c.line}+ ${c.stat === "PTS" ? "points" : c.stat === "A" ? "assists" : c.stat === "G" ? "goals" : c.stat}`.replace(/^1\+ (\w+)s$/, "1+ $1"),
  chance: c.chance, hit: res(c.result), replay: Boolean(n.replay || (liveSince && n.date < liveSince)) })));

export function useRecordLists() {
  const [out, setOut] = useState(null);
  useEffect(() => {
    Promise.all(["prism_picks", "radar", "multi", "longshot", "track_record_2026"].map((f) => get(`/data/${f}.json`))).then(([pp, radar, multi, ls, tr]) => {
      const lists = [];
      if (pp?.nights) {
        lists.push({ key: "prism", label: "💎 PRISM Picks", picks: nightly(pp.nights, (n) => n.picks) });
        lists.push({ key: "mid", label: "⚖️ Mid-range", picks: nightly(pp.nights, (n) => n.tiers?.mid) });
        lists.push({ key: "long", label: "🌠 Long shots", picks: nightly(pp.nights, (n) => n.tiers?.long) });
      }
      if (radar?.nights) lists.push({ key: "radar", label: "🔦 Under the radar", picks: nightly(radar.nights, (n) => n.picks, radar.liveSince) });
      if (multi?.nights) {
        lists.push({ key: "multi", label: "🎯 Multi-point", picks: nightly(multi.nights, (n) => n.PTS, multi.liveSince) });
        lists.push({ key: "multiA", label: "🍎 Multi-assist", picks: nightly(multi.nights, (n) => n.A, multi.liveSince) });
      }
      if (ls?.nights) lists.push({ key: "longshot", label: "🎯 Long-shot creators", picks: nightly(ls.nights, (n) => n.picks?.map((c) => ({ ...c, label: "1+ goal" })), ls.liveSince) });
      if (tr?.top3Rows) lists.push({ key: "top3", label: "🥇 Top 3 Tonight", picks: tr.top3Rows.filter((r) => r.adjGoalPct != null).map((r) => ({
        date: r.date, name: r.name, label: "1+ goal", chance: r.adjGoalPct / 100,
        hit: !r.actual || r.actual.played === false ? null : (r.actual.g || 0) > 0 })) });
      const live = [radar?.liveSince, multi?.liveSince, ls?.liveSince].filter(Boolean).sort()[0] || null;
      setOut({ lists: lists.filter((l) => l.picks.length), liveSince: live });
    });
  }, []);
  return out;
}
