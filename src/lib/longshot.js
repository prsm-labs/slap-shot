// 🎯 Long-shot creators (2026-11-07, user: point out the data-backed long shots nobody looks at -- Neal Pionk anytime goal +450 on
// 11/05, a defenseman on a big shot / high-danger run, ~135th by raw goal chance behind the forwards). Tonight's list is built live
// here from the scored pool's last-7 games; the rule, the backtest and the graded nightly record come from
// nhl_project/build_longshot.py (public/data/longshot.json).
// Rule: anytime goal 12-30%, ranked by his own expected goals per 60 over the last ~120 min on ice (shot volume x danger) as a
// percentile among tonight's skaters at his position (D vs forwards); top 8 (card: 5). Held out 2022-26: 20.2% of 1,919 scored (said
// 20.6%), 37% defensemen. The xG is already in his chance -- this list finds him, it doesn't beat the price.
import { useMemo } from "react";
import { useJson } from "./multi.js";
import { LIST_MAX, rec1 } from "./listMax.js";

const WINDOW = 7200, MIN = 5400; // same window as lib/last120.js / build_longshot.py

function recent(p) {
  let sec = 0, xg = 0, sog = 0;
  for (const g of [...(p.last7 || [])].reverse()) {
    if (sec >= WINDOW) break;
    sec += g.icetime || 0; xg += g.xg || 0; sog += g.sog || 0;
  }
  return sec >= MIN ? { x60: (xg * 3600) / sec, s60: (sog * 3600) / sec } : null;
}

// all = every skater on the slate (the percentile is against the whole slate); players = the page's filtered list
export function useLongshot(all, players, past, date) {
  const data = useJson("/data/longshot.json");
  const picks = useMemo(() => {
    if (!players || !data?.rule) return [];
    const ids = new Set(players.map((p) => p.playerId));
    if (past) {
      const byId = new Map(players.map((p) => [p.playerId, p]));
      const night = data.nights?.find((n) => n.date === date);
      return (night?.picks || []).filter((f) => ids.has(f.playerId)).slice(0, LIST_MAX).map((f) => ({ ...f, p: byId.get(f.playerId) }));
    }
    const R = data.rule;
    const rows = [];
    for (const p of all || []) {
      if (p.lineupStatus === "out" || p.lineupStatus === "scratched") continue;
      const w = recent(p);
      if (w) rows.push({ p, isD: p.position === "D", ...w });
    }
    for (const grp of [true, false]) {
      const g = rows.filter((r) => r.isD === grp).sort((a, b) => a.x60 - b.x60);
      g.forEach((r, i) => { r.pct = (i + 1) / g.length; r.rank = g.length - i; r.of = g.length; });
    }
    return rows
      .filter((r) => ids.has(r.p.playerId))
      .map((r) => ({ ...r, playerId: r.p.playerId, pos: r.p.position, chance: (r.p.anytimeGoalPct ?? 0) / 100 }))
      .filter((f) => f.chance >= R.minChance && f.chance <= R.maxChance)
      .sort((a, b) => b.pct - a.pct || b.chance - a.chance)
      .slice(0, Math.min(R.top, LIST_MAX));
  }, [all, players, data, past, date]);
  // 2026-11-12: the record shown = each night's #1 only
  const shown = useMemo(() => { if (!data?.nights) return data; const all = rec1(data.nights, (n) => n.picks); return { ...data, record: { all, card: all, live: rec1(data.nights, (n) => n.picks, data.liveSince) } }; }, [data]);
  return { picks, data: shown, loading: data === undefined };
}

export const posWord = (f) => (f.pos === "D" ? "D-men" : "forwards");
