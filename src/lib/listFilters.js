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

export const TIER_OPTIONS = [
  { key: null, label: "All tiers" },
  { key: "elite", label: "Elite only", min: 90 },
  { key: "core", label: "Core +", min: 70 },
  { key: "value", label: "Value +", min: 50 },
];
export const GOAL_OPTIONS = [null, 10, 20, 30];
const LETTERS = ["A+", "A", "B", "C", "D", "F"];

// `soft` stays readable / settable on its own (First Goal's soft-defense pill) -- it's the "soft" tag underneath
const DEFAULTS = { tier: null, minGoal: null, tags: [], tagsNot: [], tagsMode: "all", top: [], prism: [], grades: [], h2h: [], search: "" };
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
  useEffect(() => {
    let alive = true;
    if (!date) return undefined;
    Promise.all([getJson(`/data/top3/${date}.json`), getJson("/data/prism_picks.json"), getJson("/data/prop_odds.json")])
      .then(([lock, pp, odds]) => alive && setSrc({ date, lock, pp, odds }));
    return () => { alive = false; };
  }, [date]);
  return useMemo(() => {
    const ix = new Map();
    const add = (id, k, v) => { if (id == null) return; const e = ix.get(id) || { top: [], prism: [] }; if (!e[k].includes(v)) e[k].push(v); ix.set(id, e); };
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
  }, [pool, src, date, past]);
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
    { key: "tags", label: "Tags", chip: "", type: "tags", get: tagKeys, options: [
      { v: "b2b", label: "B2B", title: "His team played yesterday — second night of a back-to-back" },
      { v: "b2bnext", label: "B2B tmrw", title: "His team plays again tomorrow" },
      { v: "limited", label: "⚠️ Data limited", title: "Fewer than 10 games this season — his numbers lean on last season" },
      { v: "signal", label: signal === "point" ? "★ Point Signal" : "★ Goal Signal", title: signal === "point" ? "Point % in tonight's top 15% and 3+ SOG 40%+" : "Slap Score 85+ into a softer-half defense" },
      { v: "soft", label: "▲ Soft defense", title: "Opponent in tonight's softest third by expected goals allowed — the matchup factor that tested real" },
      { v: "breakout", label: "🚀 Breakout Watch", title: "Rising expected goals into a soft defense, outside the model's top 15%" },
      { v: "due", label: "🔥 Due + heating up", title: "No goal in 2+ games, expected goals last 5 at 1.3x+ the season rate, soft defense tonight, not a top-25% scorer — scored 6-13% above the model over 4 seasons" },
      { v: "pointDue", label: "🍎 Points due", title: "No point in 2+ games while his on-ice expected goals ran 1.2x+ the season rate, outside tonight's top 25% point chances" },
      { v: "value", label: "💰 Value vs book", title: "Our goal % at least 3 points above the chance the best sportsbook price implies" },
      { v: "confirmed", label: "✅ In official lineup", title: "Only skaters in tonight's posted lineup (around warmups)" },
      { v: "role", label: "🪑? Role check", title: "Under 3 games for his team and off tonight's power-play units — kept out of Top 3 / PRISM Picks" },
      { v: "first", label: "📅 New to team", title: "No games with his team yet" },
    ] },
    { key: "grades", label: "Grade", type: "multi", get: (p) => p.effectiveGrade?.letter, options: LETTERS.map((l) => ({ v: l, label: l })),
      hint: "Pick the exact letters — his effective grade (own form vs the goalie he faces)" },
    { key: "h2h", label: "H2H grade", chip: "H2H", type: "multi", get: (p) => h2h?.get(p.playerId)?.letter, options: LETTERS.map((l) => ({ v: l, label: l })),
      hint: "History vs tonight's opponent against his own norm — context, not a prediction" },
  ];
}

// list: the skaters to show; ctx: see buildGroups
export function applyListFilters(list, f, ctx = {}) {
  if (!list) return list;
  return applyGroups(list.filter((p) => matchesSearch(f.search, [p.name], [p.team])), buildGroups(ctx), f);
}
