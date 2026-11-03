// 🎯 Multi-point / 🍎 Multi-assist (2026-11-03, user: a 1-point projection only helps players who don't see a point every game --
// put the focus on multi-point / multi-assist potential). Tonight's lists are priced live on the Risk Slider ladder (lib/lineBoard.js),
// so lineup / goalie news moves them; the rules, the backtest and the graded nightly record come from nhl_project/build_multi.py
// (public/data/multi.json).
// Rules: 2+ points at 20%+ / 2+ assists at 12%+, top 5 each by tonight's chance minus how often he hit the line in his last 20.
// Held out 2023-26: 2+ points hit 24.5% of 2,197 (said 25.4%) vs their own 16.4%; 2+ assists 15.4% of 2,091 (said 15.6%) vs 11.2%.
import { useEffect, useMemo, useState } from "react";
import { ladderFor } from "./lineBoard.js";

export const multiLabel = (f) => `${f.line}+ ${f.stat === "A" ? "assists" : "points"}`;

function useJson(url) {
  const [d, setD] = useState(undefined);
  useEffect(() => {
    let alive = true;
    fetch(url, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).then((x) => alive && setD(x)).catch(() => alive && setD(null));
    return () => { alive = false; };
  }, [url]);
  return d;
}

// players: the scored pool's skaters (already filtered by the page); past = a past night (uses the graded replay for that date)
export function useMulti(players, past, date) {
  const board = useJson("/data/line_board.json");
  const data = useJson("/data/multi.json");
  const lists = useMemo(() => {
    const out = { PTS: [], A: [] };
    if (!players || !data?.lists) return out;
    const byId = new Map(players.map((p) => [p.playerId, p]));
    if (past) {
      const night = data.nights?.find((n) => n.date === date);
      for (const k of Object.keys(out)) out[k] = (night?.[k] || []).filter((f) => byId.has(f.playerId)).map((f) => ({ ...f, p: byId.get(f.playerId) }));
      return out;
    }
    if (!board?.form) return out;
    for (const k of Object.keys(out)) {
      const R = data.lists[k]?.rule;
      if (!R) continue;
      const rows = [];
      for (const p of players) {
        if (p.lineupStatus === "out" || p.lineupStatus === "scratched") continue;
        const form = board.form[p.playerId];
        if (!form || form.s.length < board.model.min_games) continue;
        const pr = R.stat === "PTS" ? (p.anytimePointPct != null ? p.anytimePointPct / 100 : null) : p.modelProbs?.assist ?? null;
        if (pr == null) continue;
        for (const [T, ch, hits] of ladderFor({ [R.stat]: pr }, form, board.model)[R.stat] || []) {
          if (T !== R.line || ch < R.minChance) continue;
          const own = hits / form.s.length;
          rows.push({ playerId: p.playerId, p, stat: R.stat, line: T, chance: ch, hits, n: form.s.length, own, lift: ch - own });
        }
      }
      out[k] = rows.sort((a, b) => b.lift - a.lift).slice(0, R.top);
    }
    return out;
  }, [players, board, data, past, date]);
  return { lists, data, loading: board === undefined || data === undefined };
}
