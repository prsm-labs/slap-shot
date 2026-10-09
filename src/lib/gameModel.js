// Game projections — who wins, the likely score, and a projected box score for every game on the slate.
// Team ratings + model coefficients come from public/data/team_ratings.json (build_team_ratings.py, run
// by the pipeline before each slate). Backtested 2026-10-09 on 5,247 regular-season games (2022-23 ..
// 2025-26), each season predicted from a model fit on the others:
//   - expected regulation goals per team = exp(b0 + home + gf*ln(own GF/gm) + xgf*ln(own xGF/gm)
//     + oga*ln(opp GA/gm) + oxga*ln(opp xGA/gm) + gsax*(opp starting goalie GSAx per shot))
//     — team rates are weighted toward recent games (half-life 20 games).
//   - each team's regulation goals ~ Poisson; independent Poisson under-counts regulation ties (16.4% vs
//     21.9% actual), so the tie chance is scaled up 1.33x; overtime / shootout winner = expected-goal share.
//   - picked the winner 57.9% (home team only: 54.2%); log loss 0.670 (home only 0.690); calibrated within
//     ~2 pts between 35% and 65%, under-confident above 65% (said 68%, happened 78%, 265 games).
import { useEffect, useState } from "react";

let cache = null;
export function fetchTeamRatings() {
  if (!cache) {
    cache = fetch("/data/team_ratings.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return cache;
}

export function useTeamRatings() {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    fetchTeamRatings().then((d) => alive && setData(d));
    return () => { alive = false; };
  }, []);
  return data;
}

const MAXG = 13;
function pmf(lambda) {
  const out = [Math.exp(-lambda)];
  for (let k = 1; k <= MAXG; k++) out.push((out[k - 1] * lambda) / k);
  return out;
}

export function expectedGoals(ratings, team, opp, isHome, oppGoalieId) {
  const m = ratings._meta.model;
  const t = ratings.teams[team];
  const o = ratings.teams[opp];
  const lg = ratings._meta.league;
  const val = (x, k, d) => Math.log(x?.[k] ?? d);
  const gsax = oppGoalieId != null ? ratings.goalies[String(oppGoalieId)]?.gsax ?? 0 : 0;
  return Math.exp(
    m.intercept + (isHome ? m.home : 0)
    + m.gf * val(t, "gf", lg.goalsPerTeamGame) + m.xgf * val(t, "xgf", lg.xgPerTeamGame)
    + m.oga * val(o, "ga", lg.goalsPerTeamGame) + m.oxga * val(o, "xga", lg.xgPerTeamGame)
    + m.ogsax * gsax
  );
}

// Full projection for one game. awayGoalieId / homeGoalieId = tonight's starters (expected or confirmed).
export function projectGame(ratings, { away, home, awayGoalieId, homeGoalieId }) {
  const m = ratings._meta.model;
  const lA = expectedGoals(ratings, away, home, false, homeGoalieId);
  const lH = expectedGoals(ratings, home, away, true, awayGoalieId);
  const pa = pmf(lA);
  const ph = pmf(lH);
  let hReg = 0, aReg = 0, tie = 0;
  for (let h = 0; h <= MAXG; h++) {
    for (let a = 0; a <= MAXG; a++) {
      const p = ph[h] * pa[a];
      if (h > a) hReg += p; else if (a > h) aReg += p; else tie += p;
    }
  }
  const tieAdj = Math.min(0.9, tie * m.tieMult);
  const scale = (1 - tieAdj) / (hReg + aReg);
  const otHome = 0.5 + m.otShare * (lH / (lH + lA) - 0.5);

  // Final-score grid: regulation ties go to OT, where the winner gets +1.
  const finals = new Map();
  const add = (h, a, p) => {
    const k = `${a}-${h}`;
    finals.set(k, (finals.get(k) || 0) + p);
  };
  for (let h = 0; h <= MAXG; h++) {
    for (let a = 0; a <= MAXG; a++) {
      const p = ph[h] * pa[a];
      if (h === a) {
        const pt = (p / tie) * tieAdj;
        add(h + 1, a, pt * otHome);
        add(h, a + 1, pt * (1 - otHome));
      } else add(h, a, p * scale);
    }
  }
  const scores = [...finals.entries()]
    .map(([k, p]) => { const [a, h] = k.split("-").map(Number); return { away: a, home: h, p }; })
    .sort((x, y) => y.p - x.p);
  const overs = Object.fromEntries([4.5, 5.5, 6.5].map((line) => [line, scores.filter((s) => s.away + s.home > line).reduce((t, s) => t + s.p, 0)]));
  const homeBy2 = scores.filter((s) => s.home - s.away >= 2).reduce((t, s) => t + s.p, 0);
  const awayBy2 = scores.filter((s) => s.away - s.home >= 2).reduce((t, s) => t + s.p, 0);

  const pHome = hReg * scale + tieAdj * otHome;
  return {
    away, home,
    xgAway: lA, xgHome: lH,
    winAway: 1 - pHome, winHome: pHome,
    regAway: aReg * scale, regHome: hReg * scale, ot: tieAdj,
    otWinHome: otHome,
    scores, overs,
    puckLine: { home: homeBy2, away: awayBy2 }, // win by 2+ (-1.5)
    expTotal: scores.reduce((t, s) => t + (s.away + s.home) * s.p, 0),
    gsax: {
      away: awayGoalieId != null ? ratings.goalies[String(awayGoalieId)] ?? null : null,
      home: homeGoalieId != null ? ratings.goalies[String(homeGoalieId)] ?? null : null,
    },
  };
}

// Fair American odds for a probability (no vig).
export function fairOdds(p) {
  if (!(p > 0 && p < 1)) return "—";
  return p >= 0.5 ? `${Math.round((-100 * p) / (1 - p))}` : `+${Math.round((100 * (1 - p)) / p)}`;
}
