// Head-to-head history for tonight's slate (public/data/h2h_today.json, built nightly by
// build_h2h.py from MoneyPuck game-by-game + shot files since 2022-23). History only — not used
// in any score.
import { useEffect, useMemo, useState } from "react";
import { useScoredPool } from "./data.js";

let cache = null;
function fetchH2H() {
  if (!cache) {
    cache = fetch("/data/h2h_today.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return cache;
}

export function useH2H() {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    fetchH2H().then((d) => alive && setData(d));
    return () => { alive = false; };
  }, []);
  return data;
}

// "2025" (MoneyPuck season start year) -> 20252026, the NHL season id the charts label with.
export const nhlSeason = (s) => Number(`${s}${s + 1}`);

// ── H2H grade ───────────────────────────────────────────────────────────────
// How much better (or worse) a player has done against tonight's opponent than their own normal —
// CONTEXT ONLY: H2H history did not predict scoring in the 2025-26 backtests (vs team 0.99x / 1.12x,
// vs goalie 1.03x / 1.11x; nothing in a model test), so it never feeds Slap Score or the picks.
//   skater: per-game goals + half of points above their own rate vs tonight's team (all meetings since
//           2022-23, shrunk with 5 games of "normal"), plus goals above their own shooting % on tonight's
//           goalie (shrunk with 20 shots). Graded with 2+ games vs the team or 5+ shots on the goalie
//           (was 3+ / 8+ until 2026-10-09); under 4 games and 15 shots the grade is marked small-sample (*).
//   goalie: saves above their own save % vs tonight's opponent, shrunk with 150 shots; 2+ games, 40+ shots.
//   letters by rank among tonight's graded players (A+ top 5%, A next 10%, B 20%, C 30%, D 20%, F 15%).
const BANDS = [[0.95, "A+"], [0.85, "A"], [0.65, "B"], [0.35, "C"], [0.15, "D"], [0, "F"]];
const last = (name) => String(name || "").trim().split(/\s+/).pop();
const sv = (v) => (v == null ? "—" : v.toFixed(3).replace(/^0/, ""));

function letters(rows) {
  const sorted = [...rows].sort((a, b) => a.score - b.score);
  sorted.forEach((r, i) => {
    const pct = sorted.length > 1 ? i / (sorted.length - 1) : 0.5;
    r.letter = BANDS.find(([cut]) => pct >= cut)[1];
  });
}

export function h2hGrades(h2h, players, goalies, slateHomeTeams) {
  const skaters = new Map();
  const goalieOut = new Map();
  if (!h2h) return { skaters, goalies: goalieOut };
  const rows = [];
  for (const p of players || []) {
    const e = h2h.skaters?.[String(p.playerId)];
    if (!e) continue;
    const gp = p.games_played || 0;
    const t = e.vsTeam?.totals;
    const vg = p.opponentGoalieId != null ? e.vsGoalie?.[String(p.opponentGoalieId)] : null;
    let score = 0;
    let graded = false;
    if (t && gp > 0) {
      const gr = (p.TotalGoals || 0) / gp;
      const pr = (p.I_F_points || 0) / gp;
      score += ((t.goals - t.games * gr) + 0.5 * (t.points - t.games * pr)) / (t.games + 5);
      if (t.games >= 2) graded = true;
    }
    if (vg && vg.totals.sogOn > 0) {
      const sog = (p.ShotsOnGoalPerGame || 0) * gp;
      const ownSh = sog > 0 ? (p.TotalGoals || 0) / sog : 0.1;
      score += (vg.totals.goalsOn - vg.totals.sogOn * ownSh) / (vg.totals.sogOn + 20);
      if (vg.totals.sogOn >= 5) graded = true;
    }
    const parts = [];
    if (t) parts.push(`${t.games} GP vs ${e.vsTeam.opp}: ${t.goals} G, ${t.points} P`);
    if (vg) parts.push(`vs ${last(vg.goalie)} ${vg.totals.goalsOn}/${vg.totals.sogOn} shots`);
    const small = (t?.games ?? 0) < 4 && (vg?.totals.sogOn ?? 0) < 15;
    const side = p.isHome ? "home" : "away";
    const row = {
      playerId: p.playerId, score, graded, small, text: parts.join(" · ") + (graded && small ? " · small sample" : ""), letter: null,
      // goal-game rates (games with 1+ goal / games) for the table columns
      team: t ? { made: t.goalGames ?? 0, n: t.games } : null,
      goalie: vg ? { made: vg.totals.goalGames ?? 0, n: vg.totals.games, label: last(vg.goalie) } : null,
      venue: e.venue?.[side]?.games ? { made: e.venue[side].goalGames, n: e.venue[side].games, side } : null,
      l5: e.form?.l5?.games ? { made: e.form.l5.goalGames, n: e.form.l5.games } : null,
      l10: e.form?.l10?.games ? { made: e.form.l10.goalGames, n: e.form.l10.games } : null,
    };
    skaters.set(p.playerId, row);
    if (graded) rows.push(row);
  }
  letters(rows);

  const grows = [];
  for (const g of goalies || []) {
    const ge = h2h.goalies?.[String(g.playerId)];
    if (!ge) continue;
    const t = ge.vsTeam;
    const tt = t?.totals;
    const own = g.savePct ?? 0.9;
    const score = tt ? ((tt.sa - tt.ga) - tt.sa * own) / (tt.sa + 150) : 0;
    const svStat = (b) => (b?.sa ? { sv: b.svPct, n: b.games, sa: b.sa } : null);
    const isHome = (slateHomeTeams || new Set()).has(g.team);
    const row = {
      playerId: g.playerId, score, graded: Boolean(tt) && tt.games >= 2 && tt.sa >= 40, letter: null,
      text: tt ? `${tt.games} GP vs ${t.opp}: ${sv(tt.svPct)} on ${tt.sa} shots (own ${sv(own)})` : "No games vs tonight's opponent since 2022-23",
      team: svStat(tt), venue: svStat(ge.venue?.[isHome ? "home" : "away"]), venueSide: isHome ? "home" : "away",
      l5: svStat(ge.form?.l5), l10: svStat(ge.form?.l10),
    };
    goalieOut.set(g.playerId, row);
    if (row.graded) grows.push(row);
  }
  letters(grows);
  return { skaters, goalies: goalieOut };
}

// { skaters: Map(playerId -> {letter, score, text}), goalies: Map(...) } for tonight's slate.
// Computed once per (H2H file, pool) and shared by every table cell.
const gradeCache = { h2h: undefined, pool: undefined, value: null };
function cachedGrades(h2h, pool) {
  if (gradeCache.h2h !== h2h || gradeCache.pool !== pool) {
    gradeCache.h2h = h2h;
    gradeCache.pool = pool;
    gradeCache.value = h2hGrades(h2h, pool?.players, pool?.goalies, new Set((pool?.meta?.slate || []).map((g) => g.home)));
  }
  return gradeCache.value;
}

// Adds sortable H2H fields to table rows: h2hScore (grade score, graded only) and, as 0-1 rates,
// skaters: h2hTeamPct / h2hGoaliePct / venuePct / l5Pct / l10Pct (share of games with a goal);
// goalies: h2hTeamSv / venueSv / l5Sv / l10Sv (save %).
// equal rates break toward the bigger sample (6/10 above 3/5, 2/2 above 1/1)
const rate = (s) => (s && s.n ? s.made / s.n + s.n * 1e-6 : null);
export function withH2H(list, grades, goalie = false) {
  const map = goalie ? grades.goalies : grades.skaters;
  return (list || []).map((p) => {
    const g = map.get(p.playerId);
    if (goalie) {
      return { ...p, h2hScore: g?.letter ? g.score : null, h2hTeamSv: g?.team?.sv ?? null, venueSv: g?.venue?.sv ?? null, l5Sv: g?.l5?.sv ?? null, l10Sv: g?.l10?.sv ?? null };
    }
    return {
      ...p, h2hScore: g?.letter ? g.score : null, h2hTeamPct: rate(g?.team), h2hGoaliePct: rate(g?.goalie),
      venuePct: rate(g?.venue), l5Pct: rate(g?.l5), l10Pct: rate(g?.l10),
    };
  });
}

// Sortable H2H / form columns: [row field (withH2H), grade-row key, header, tooltip].
export const SKATER_H2H_COLS = [
  ["h2hTeamPct", "team", "G% vs Opp", "Share of games vs tonight's opponent with a goal (all meetings since 2022-23)"],
  ["h2hGoaliePct", "goalie", "G% vs Goalie", "Share of games vs tonight's goalie with a goal on him (since 2022-23)"],
  ["venuePct", "venue", "G% H/A", "Share of games with a goal at tonight's venue type (H = home, A = road), last season + this season"],
  ["l5Pct", "l5", "G% L5", "Games with a goal in the last 5"],
  ["l10Pct", "l10", "G% L10", "Games with a goal in the last 10"],
];
export const GOALIE_H2H_COLS = [
  ["h2hTeamSv", "team", "SV% vs Opp", "Save % vs tonight's opponent since 2022-23"],
  ["venueSv", "venue", "SV% H/A", "Save % at tonight's venue type (H = home, A = road), last season + this season"],
  ["l5Sv", "l5", "SV% L5", "Save % over the last 5 games played"],
  ["l10Sv", "l10", "SV% L10", "Save % over the last 10 games played"],
];

export function useH2HGrades() {
  const h2h = useH2H();
  const pool = useScoredPool({ includeStarted: true });
  return useMemo(() => cachedGrades(h2h, pool), [h2h, pool]);
}
