// Shared list filters for All Matchups / Lamp Lab / Apple Lab — one app-wide selection (like the
// matchup and position filters), so narrowing the list on one page carries to the others.
// 2026-10-25 (user: improve Slap Shot's filters and give every app the same panel -- tags for B2B / B2B tmrw / listed Top 3
// or PRISM Pick / Data limited, a grade SCALE instead of "A, B or C or better", open / close): groups drawn by
// components/FilterPanel.jsx. Within a group a skater needs any of the letters / picks chosen; tags match all (or any);
// across groups he has to pass every one.
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { breakoutBoard } from "./breakout.js";
import { isGoalSignal, isPointSignal } from "./signals.js";
import { matchesSearch } from "./teamSearch.js";
import { eligibleForTop3, selectTop3, TIER_INFO } from "./top3.js";
import { prismPicks, tierPicks } from "./prismPicks.js";
import { applyGroups } from "../components/FilterPanel.jsx";
import { DEF_TIERS, oppDefOf } from "./oppDef.jsx";
import { EDGES, STREAK, edgeKeys } from "./edges.js";
import { useRadar } from "./radar.js";
import { useMulti } from "./multi.js";

export const TIER_OPTIONS = [
  { key: null, label: "All tiers" },
  { key: "elite", label: "Elite only", min: 90 },
  { key: "core", label: "Core +", min: 70 },
  { key: "value", label: "Value +", min: 50 },
];
export const GOAL_OPTIONS = [null, 10, 20, 30];
const LETTERS = ["A+", "A", "B", "C", "D", "F"];

// `soft` stays readable / settable on its own (First Goal's soft-defense pill) -- it's the "soft" tag underneath
const DEFAULTS = { tier: null, minGoal: null, tags: [], tagsNot: [], tagsMode: "all", edge: [], edgeNot: [], edgeMode: "all", top: [], prism: [], find: [], grades: [], h2h: [], oppd: [], search: "" };
const withSoft = (s) => ({ ...s, soft: s.tags.includes("soft") });
let state = withSoft({ ...DEFAULTS });
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

export function setListFilter(key, value) {
  if (key === "soft") {
    const tags = state.tags.filter((t) => t !== "soft");
    state = withSoft({ ...state, tags: value ? [...tags, "soft"] : tags });
  } else state = withSoft({ ...state, [key]: value });
  notify();
}
export function clearListFilters() {
  state = withSoft({ ...DEFAULTS, search: state.search });
  notify();
}
export const getListSearch = () => state.search; // the header search (MasterFilter), read by matchupFilter.js
export function useListFilters() {
  return useSyncExternalStore((fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, () => state);
}

// Tonight's (or the picked night's) Top 3 + PRISM Picks -> Map playerId -> { top: [tier ...], prism: [level ...] }.
// Top 3: the locked file once the 5:30 PM run froze it, else the live selection (lib/top3.js, same as the Top 3 page).
// PRISM Picks: the live rule (lib/prismPicks.js, same as the Cheat Sheets card), or that night's saved picks on a past night.
const jsonCache = {};
const getJson = (url) => (jsonCache[url] = jsonCache[url] || fetch(url, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null));
export function usePickSets(pool) {
  const date = pool?.meta?.slateDate;
  const past = Boolean(pool?.meta?.past);
  const [src, setSrc] = useState(null);
  // 2026-11-12 tested lists for the one-tap filter buttons (ListFilters.jsx): Under the radar + Multi-point, same as the Cheat Sheets cards
  const radar = useRadar(pool?.players || null, past, date);
  const multi = useMulti(pool?.players || null, past, date);
  useEffect(() => {
    let alive = true;
    if (!date) return undefined;
    Promise.all([getJson(`/data/top3/${date}.json`), getJson("/data/prism_picks.json"), getJson("/data/prop_odds.json")])
      .then(([lock, pp, odds]) => alive && setSrc({ date, lock, pp, odds }));
    return () => { alive = false; };
  }, [date]);
  return useMemo(() => {
    const ix = new Map();
    const add = (id, k, v) => { if (id == null) return; const e = ix.get(id) || { top: [], prism: [], find: [] }; if (!e[k].includes(v)) e[k].push(v); ix.set(id, e); };
    for (const f of radar.picks || []) add(f.playerId, "find", "radar");
    for (const f of multi.lists?.PTS || []) add(f.playerId, "find", "multi");
    if (!pool?.players || !src || src.date !== date) return ix;
    const top = src.lock?.picks || (past ? [] : selectTop3(eligibleForTop3(pool.players, pool.meta.slate)).picks.map((c) => ({ tier: c.tier, playerId: c.player?.playerId })));
    for (const t of top) add(t.playerId, "top", t.tier);
    if (past) {
      const night = src.pp?.nights?.find((n) => n.date === date);
      for (const c of night?.picks || []) add(c.playerId, "prism", "safe");
      for (const lv of ["mid", "long"]) for (const c of night?.tiers?.[lv] || []) add(c.playerId, "prism", lv);
    } else if (src.pp?.knots) {
      const safe = prismPicks(pool.players, src.pp, src.odds);
      const mid = tierPicks(pool.players, src.pp, src.odds, "mid", new Set(safe.map((c) => c.p.playerId)));
      const long = tierPicks(pool.players, src.pp, src.odds, "long", new Set([...safe, ...mid].map((c) => c.p.playerId)));
      for (const [lv, list] of [["safe", safe], ["mid", mid], ["long", long]]) for (const c of list) add(c.p.playerId, "prism", lv);
    }
    return ix;
  }, [pool, src, date, past, radar.picks, multi.lists]);
}

// ctx: { slate: every eligible skater tonight (Breakout Watch), signal: "goal" | "point" (what "Signals" means on this page),
//        h2h: Map playerId -> H2H grade (lib/h2h.js), picks: usePickSets(), meta: the pool's meta (B2B teams) }
export function buildGroups(ctx = {}) {
  const { slate, signal = "goal", h2h, picks, meta } = ctx;
  const breakoutIds = slate ? new Set(breakoutBoard(slate).list.map((p) => p.playerId)) : new Set();
  const b2b = meta?.b2b?.date === meta?.slateDate ? meta.b2b : null; // a past night's view only carries tonight's meta
  const yest = new Set(b2b?.yesterday || []);
  const tmrw = new Set(b2b?.tomorrow || []);
  const sig = signal === "point" ? isPointSignal : isGoalSignal;
  const tagKeys = (p) => {
    const t = [];
    if (yest.has(p.team)) t.push("b2b");
    if (tmrw.has(p.team)) t.push("b2bnext");
    if (p.seasonGp != null && p.seasonGp < 10) t.push("limited");
    if (sig(p)) t.push("signal");
    if ((p.oppSoftPct ?? 0) >= 0.67) t.push("soft");
    if (breakoutIds.has(p.playerId)) t.push("breakout");
    if (p.dueHeat) t.push("due");
    if (p.pointHeat) t.push("pointDue");
    if ((p.edge ?? -99) >= 3) t.push("value");
    if (p.lineupStatus === "dressed") t.push("confirmed");
    if (p.roleFlag) t.push("role");
    if (!p.roleFlag && p.teamGp === 0) t.push("first");
    if (p.streakCheck) t.push("streak"); // 2026-11-03 caution lean (lib/edges.js)
    return t;
  };
  const tops = [...new Set([...(picks?.values() || [])].flatMap((e) => e.top))];
  return [
    { key: "tier", label: "Slap Score", chip: "", type: "one", test: (p, v) => (p.slapScore ?? 0) >= TIER_OPTIONS.find((t) => t.key === v).min,
      anyLabel: "All tiers", options: TIER_OPTIONS.filter((t) => t.key).map((t) => ({ v: t.key, label: t.label })) },
    { key: "minGoal", label: "Goal %", chip: "", type: "one", test: (p, v) => (p.anytimeGoalPct ?? 0) >= v, anyLabel: "Any goal %",
      options: GOAL_OPTIONS.filter(Boolean).map((g) => ({ v: g, label: `Goal ${g}%+` })) },
    { key: "top", label: "Top 3 Tonight", chip: "Top 3", type: "multi", get: (p) => { const t = picks?.get(p.playerId)?.top || []; return t.length ? [...t, "*"] : t; },
      options: [{ v: "*", label: "🏆 Any Top 3 pick" }, ...tops.map((k) => ({ v: k, label: `${TIER_INFO[k]?.emoji || ""} ${TIER_INFO[k]?.label || k}`.trim() }))],
      hint: "Skaters listed on tonight's Top 3 (one per tier, locked at the 5:30 PM run)" },
    { key: "prism", label: "PRISM Picks", chip: "PRISM", type: "multi", get: (p) => picks?.get(p.playerId)?.prism || [],
      options: [{ v: "safe", label: "💎 PRISM Pick" }, { v: "mid", label: "⚖️ Mid-range" }, { v: "long", label: "🌠 Long shot" }] },
    // 2026-11-12 tested lists (one-tap buttons next to 🔒 Locked in): Under the radar / Multi-point (graded lists), Moving up = ice time up 10%+
    // over his last 3 (ROLE term), Soft goalie = tonight's starter clearly below average (GSAx z <= -0.5; GOALIE_COEF term). Context: the last two
    // are already inside the %, the buttons just show who they lift.
    { key: "find", label: "Tested lists", chip: "", type: "multi", get: (p) => {
        const v = [...(picks?.get(p.playerId)?.find || [])], pr = p.effectiveGrade?.probs || {};
        if ((pr.role || 0) >= Math.log(1.1)) v.push("moving");
        if ((pr.goalieZ || 0) <= -0.5) v.push("goalie");
        return v; },
      options: [{ v: "radar", label: "🔦 Under the radar", title: "Lines he rarely clears that the model likes tonight (Cheat Sheets list; graded nightly)" },
        { v: "multi", label: "🎯 Multi-point", title: "2+ points beyond his usual (graded nightly)" },
        { v: "moving", label: "📈 Moving up", title: "Ice time up 10%+ over his last 3 games — the strongest tested points / assists signal; already in the %" },
        { v: "goalie", label: "🧤 Soft goalie", title: "Facing a starter clearly below average by goals saved above expected; already in the %" }] },
    { key: "tags", label: "Tags", chip: "", type: "tags", get: tagKeys, options: [
      { v: "b2b", label: "B2B", title: "His team played yesterday — second night of a back-to-back" },
      { v: "b2bnext", label: "B2B tmrw", title: "His team plays again tomorrow" },
      { v: "limited", label: "⚠️ Data limited", title: "Fewer than 10 games this season — his numbers lean on last season" },
      { v: "signal", label: signal === "point" ? "★ Point Signal" : "★ Goal Signal", title: signal === "point" ? "Tonight's top 8 point chances (hits what the % says; a shortcut, not an extra edge)" : "Tonight's top 8 goal chances (hits what the % says; a shortcut, not an extra edge)" },
      { v: "soft", label: "▲ Softer third tonight", title: "Opponent in tonight's softest third by expected goals allowed — the matchup factor that tested real" },
      { v: "breakout", label: "🚀 Breakout Watch", title: "Rising expected goals into a soft defense, outside the model's top 15%" },
      { v: "due", label: "🔥 Due + heating up", title: "No goal in 2+ games, expected goals last 5 at 1.3x+ the season rate, soft defense tonight, not a top-25% scorer — scored 6-13% above the model over 4 seasons" },
      { v: "pointDue", label: "🍎 Points due", title: "No point in 2+ games while his on-ice expected goals ran 1.2x+ the season rate, outside tonight's top 25% point chances" },
      { v: "value", label: "📖 Above book", title: "Our goal % at least 3 points above the chance the best sportsbook price implies. Context, not value: this group has scored nearer the book's number (9/29-10/24: we said 25.5%, book 20.6%, 18.9% scored)" },
      { v: "confirmed", label: "✅ In official lineup", title: "Only skaters in tonight's posted lineup (around warmups)" },
      { v: "role", label: "🪑? Role check", title: "Under 3 games for his team and off tonight's power-play units — kept out of Top 3 / PRISM Picks" },
      { v: "first", label: "📅 New to team", title: "No games with his team yet" },
      STREAK,
    ] },
    // 2026-11-02 tested edges (lib/edges.js): spots that beat -- or missed -- our own chance every held-out season
    { key: "edge", label: "Edges (tested)", chip: "Edge", type: "tags", get: (p) => edgeKeys(p, meta), options: EDGES },
    { key: "grades", label: "Grade", type: "multi", get: (p) => p.effectiveGrade?.letter, options: LETTERS.map((l) => ({ v: l, label: l })),
      hint: "Pick the exact letters — his effective grade (own form vs the goalie he faces)" },
    { key: "h2h", label: "H2H grade", chip: "H2H", type: "multi", get: (p) => h2h?.get(p.playerId)?.letter, options: LETTERS.map((l) => ({ v: l, label: l })),
      hint: "History vs tonight's opponent against his own norm — context, not a prediction" },
    // 2026-11-11 projected line / PP unit (lib/slateOverlay.js p.line) -- context only
    { key: "line", label: "Line / PP unit", chip: "Line", type: "tags",
      get: (p) => { const l = p.line; if (!l) return []; const v = []; if (l.ev) v.push(l.ev); if (l.pp) v.push(`PP${l.pp}`); else if (l.ppPosted) v.push("noPP"); if (l.ev && /^L[12]$/.test(l.ev)) v.push("top6"); return v; },
      options: [{ v: "L1", label: "L1" }, { v: "L2", label: "L2" }, { v: "L3", label: "L3" }, { v: "L4", label: "L4" }, { v: "top6", label: "Top 6 F" },
        { v: "D1", label: "D1" }, { v: "D2", label: "D2" }, { v: "D3", label: "D3" }, { v: "PP1", label: "PP1" }, { v: "PP2", label: "PP2" }, { v: "noPP", label: "No PP" }],
      hint: "Projected forward line / defense pair (DailyFaceoff) and power-play unit (RotoWire, else DailyFaceoff), shown before lineups are confirmed (tap twice = without; Match all for e.g. L1 + PP1); the badge turns solid once he's in the official lineup. Context only: line spot and PP time are already in his chances through ice time" },
    { key: "oppd", label: "Opponent defense", chip: "Opp D", type: "multi", get: (p) => oppDefOf(p, meta).tier, options: DEF_TIERS,
      hint: "Tonight's opponent among the league's defenses by expected goals allowed — Soft = 10 softest, Tough = 10 stingiest" },
  ];
}

// list: the skaters to show; ctx: see buildGroups
export function applyListFilters(list, f, ctx = {}) {
  if (!list) return list;
  return applyGroups(list.filter((p) => matchesSearch(f.search, [p.name], [p.team])), buildGroups(ctx), f);
}
