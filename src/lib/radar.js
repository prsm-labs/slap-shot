// 🔦 Under the radar (2026-11-02, user: the lists only show the obvious stars -- find the skater nobody is looking at whose numbers
// say he shows up). Tonight's list is priced live on the Risk Slider ladder (lib/lineBoard.js), so lineup / goalie news moves it;
// the rule, its backtest and the graded nightly record come from nhl_project/build_radar.py (public/data/radar.json).
// Rule: 1+ point / goal / assist lines he hit in <= 35% of his last 20, tonight's chance 40%+, one per skater, top 5 by chance minus
// his own rate. Held out 2023-26: hit 46.5% of 2,302 (said 45.9%) vs their own 28.4%.
import { useEffect, useMemo, useState } from "react";
import { formBefore, ladderFor } from "./lineBoard.js";

const STAT_NAME = { PTS: "point", G: "goal", A: "assist" };
export const radarLabel = (f) => `${f.line}+ ${STAT_NAME[f.stat]}${f.line > 1 ? "s" : ""}`;
export const radarProp = (f) => (f.stat === "G" ? "goal" : f.stat === "PTS" ? "point" : "assist");

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
export function useRadar(players, past, date) {
  const board = useJson("/data/line_board.json");
  const data = useJson("/data/radar.json");
  const picks = useMemo(() => {
    if (!players || !data?.rule) return [];
    const byId = new Map(players.map((p) => [p.playerId, p]));
    if (past) {
      const night = data.nights?.find((n) => n.date === date);
      return (night?.picks || []).filter((f) => byId.has(f.playerId)).map((f) => ({ ...f, p: byId.get(f.playerId) }));
    }
    if (!board?.form) return [];
    const rule = data.rule, out = [];
    for (const p of players) {
      if (p.lineupStatus === "out" || p.lineupStatus === "scratched") continue;
      const form = board.form[p.playerId];
      if (!form || form.s.length < board.model.min_games) continue;
      const probs = {
        PTS: p.anytimePointPct != null ? p.anytimePointPct / 100 : null,
        G: (p.goalLadderPct ?? p.anytimeGoalPct) != null ? (p.goalLadderPct ?? p.anytimeGoalPct) / 100 : null, // 2026-11-08: ladder prices from the chance before the top-end fix
        A: p.modelProbs?.assist ?? null,
      };
      const lad = ladderFor(probs, past ? formBefore(form, date) : form, board.model);
      let best = null;
      for (const st of rule.stats) {
        for (const [T, ch, hits] of lad[st] || []) {
          const own = hits / form.s.length;
          if (T !== 1 || own > rule.maxOwn || ch < rule.minChance) continue;
          if (!best || ch - own > best.lift) best = { playerId: p.playerId, p, stat: st, line: T, chance: ch, hits, n: form.s.length, own, lift: ch - own };
        }
      }
      if (best) out.push(best);
    }
    return out.sort((a, b) => b.lift - a.lift).slice(0, rule.top);
  }, [players, board, data, past, date]);
  return { picks, data, loading: board === undefined || data === undefined };
}
