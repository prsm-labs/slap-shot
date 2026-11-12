// 🔭 Tonight's lenses for Slap Shot (components/Lenses.jsx; user 2026-11-12: the tested data in the user's face, one tap, like 🔒 Locked in).
// Only tested angles:
//   🔒 Locked in   grade A+ to C vs one of the league's 10 softest D (xGA) -- hits what the % says (2026-11-06 test): a shortcut
//   🔦 Under radar  lib/radar.js (beats his own rate; graded nightly, radar.json record)
//   🎯 Multi-point  lib/multi.js 2+ points beyond his usual (graded nightly, multi.json record)
//   📈 Moving up    ice time up 10%+ over his last 3 games -- the strongest tested points / assists signal (ROLE term, 2026-10-21; again
//                   on top of every other stat in the 2026-11-12 points / assists scan); already inside the %, this shows who it lifts
//   🧤 Soft goalie  tonight's starter below average by GSAx per shot (GOALIE_COEF term, 2026-11-02, 4 of 4 seasons for points)
// Not here on purpose: H2H, defense vs position, hot streaks (tested as noise).
import { useMemo } from "react";
import PickButton from "../components/PickButton.jsx";
import { openSkaterSlide } from "../slideouts.js";
import { oppDefOf } from "./oppDef.jsx";
import { ROLE } from "./calibration.js";
import { GOALIE_COEF } from "./grades.js";
import { radarLabel } from "./radar.js";

const logit = (p) => Math.log(p / (1 - p));
const sig = (x) => 1 / (1 + Math.exp(-x));
const added = (p, d) => (p == null || !d ? 0 : (p - sig(logit(Math.min(Math.max(p, 1e-4), 1 - 1e-4)) - d)) * 100);
const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const pc = (v) => (v == null ? "—" : `${Math.round(v)}%`);
const sgn = (x) => (x >= 0 ? `+${Math.round(x)}` : `−${Math.round(-x)}`);
const ord = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;
const last = (name) => String(name || "").split(" ").slice(-1)[0];
const vs = (p) => `${p.team} ${p.isHome === false ? "@" : "vs"} ${p.opponentTeam}`;
const playing = (p) => p.lineupStatus !== "out" && p.lineupStatus !== "scratched";
const rec = (r, own = true) => (r?.n ? `Record: ${r.hits}/${r.n} (${Math.round((r.hits / r.n) * 100)}%; said ${Math.round(r.said * 100)}%${own && r.own != null ? `, their usual ${Math.round(r.own * 100)}%` : ""}).` : "");
// at most 2 per team per lens, so one game (e.g. every Carolina forward vs a weak goalie) doesn't fill the list
const perTeam = (rows, k = 2) => { const c = {}; return rows.filter((r) => (c[r.team.split(" ")[0]] = (c[r.team.split(" ")[0]] || 0) + 1) <= k); };
const row = (p, line, big, bigSub, why) => ({ key: p.playerId, name: p.name, team: vs(p), line, big, bigSub, why, onOpen: () => openSkaterSlide(p), action: <PickButton player={p} /> });

// pool = the page's skaters (matchup / position applied); radar / multi = the hooks' output the page already has
export function useLenses(pool, meta, radar, multi) {
  return useMemo(() => {
    if (!pool) return [];
    const P = pool.filter(playing);
    const pr = (p) => p.effectiveGrade?.probs || {};
    const n = Object.keys(meta?.defRank || {}).length || 32;

    const locked = P.filter((p) => ["A+", "A", "B", "C"].includes(p.effectiveGrade?.letter) && oppDefOf(p, meta).tier === "soft")
      .sort((a, b) => (b.anytimeGoalPct ?? 0) - (a.anytimeGoalPct ?? 0))
      .map((p) => { const r = oppDefOf(p, meta).rank; return row(p, `Grade ${p.effectiveGrade.letter} · ${p.opponentTeam} ${r ? `${ord(r)} softest` : "soft"} D`, pc(p.anytimeGoalPct), "goal", `Point ${pc(p.anytimePointPct)}`); });

    const radarRows = (radar?.picks || []).map((f) => row(f.p, `${radarLabel(f)}: his ${pct(f.own)} → tonight ${pct(f.chance)}`, pct(f.chance), `his ${pct(f.own)}`, `had it in ${f.hits} of his last ${f.n}`));
    const multiRows = (multi?.lists?.PTS || []).map((f) => row(f.p, `${f.line}+ points: his ${pct(f.own)} → tonight ${pct(f.chance)}`, pct(f.chance), `his ${pct(f.own)}`, `had it in ${f.hits} of his last ${f.n}`));

    const moving = P.filter((p) => (pr(p).role || 0) >= Math.log(1.1))
      .map((p) => ({ p, d: added((p.anytimePointPct ?? 0) / 100, ROLE.point * pr(p).role) }))
      .sort((a, b) => b.d - a.d)
      .map(({ p, d }) => row(p, `Ice time up ${Math.round((Math.exp(pr(p).role) - 1) * 100)}% the last 3 games (${sgn(d)} pts)`, pc(p.anytimePointPct), "point", `Goal ${pc(p.anytimeGoalPct)} · a bigger role lately carries into tonight`));

    const soft = P.filter((p) => (pr(p).goalieZ || 0) <= -0.5 && p.opponentGoalie)
      .sort((a, b) => (b.anytimePointPct ?? 0) - (a.anytimePointPct ?? 0))
      .map((p) => { const d = added((p.anytimePointPct ?? 0) / 100, GOALIE_COEF.point * pr(p).goalieZ);
        return row(p, `vs ${last(p.opponentGoalie)}, weaker than average in net (${sgn(d)} pts)`, pc(p.anytimePointPct), "point", `Goal ${pc(p.anytimeGoalPct)}`); });

    return [
      { key: "locked", label: "🔒 Locked in", rows: perTeam(locked),
        title: `Grade A+ to C facing one of the league's 10 softest defenses (of ${n}), best goal chance first. A shortcut: they hit what the % says.` },
      { key: "radar", label: "🔦 Under the radar", rows: radarRows, record: rec(radar?.data?.record?.all),
        title: "Lines he rarely clears that the model likes tonight — ranked by tonight's chance over his own recent rate." },
      { key: "multi", label: "🎯 Multi-point", rows: multiRows, record: rec(multi?.data?.record?.PTS?.all),
        title: "2+ points beyond what he usually does — role players and second-line pieces, not just the stars." },
      { key: "moving", label: "📈 Moving up", rows: perTeam(moving),
        title: "Ice time up 10%+ over his last 3 games. A bigger role is the strongest tested signal for points and assists; it's already in the % — this shows who it lifts tonight.",
        empty: "no one's ice time is up 10%+ yet" },
      { key: "goalie", label: "🧤 Soft goalie", rows: perTeam(soft),
        title: "Facing a starter clearly below average (goals saved above expected per shot). Tested every season for points; already in the % — this shows who gets the bump.",
        empty: "no weak starter tonight, or goalies aren't set yet" },
    ];
  }, [pool, meta, radar, multi]);
}
