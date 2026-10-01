// api/boxscore.js — one game's box score, proxied from the NHL's public game feed (no CORS on
// api-web.nhle.com). Same role as Going Yard's api/boxscore.js.
//
//   GET /api/boxscore?gameId=2026020004

const NHL = "https://api-web.nhle.com/v1";

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

const text = (v) => (v && typeof v === "object" ? v.default : v) ?? "";

function periodLabel(pd) {
  if (!pd) return "";
  if (pd.periodType === "OT") return pd.number > 4 ? `${pd.number - 3}OT` : "OT";
  if (pd.periodType === "SO") return "SO";
  return String(pd.number);
}

function skaterLine(p) {
  return {
    playerId: p.playerId, number: p.sweaterNumber, name: text(p.name), position: p.position,
    goals: p.goals, assists: p.assists, points: p.points, plusMinus: p.plusMinus, sog: p.sog,
    hits: p.hits, blocks: p.blockedShots, pim: p.pim, toi: p.toi, ppGoals: p.powerPlayGoals,
    faceoffPct: p.faceoffWinningPctg,
  };
}

function goalieLine(p) {
  return {
    playerId: p.playerId, number: p.sweaterNumber, name: text(p.name), starter: p.starter,
    shotsAgainst: p.shotsAgainst, saves: p.saves, goalsAgainst: p.goalsAgainst, toi: p.toi,
    savePct: p.shotsAgainst ? p.saves / p.shotsAgainst : null,
  };
}

function team(box, side) {
  const t = box[side];
  const stats = box.playerByGameStats?.[side] || {};
  return {
    abbrev: t.abbrev, score: t.score ?? null, sog: t.sog ?? null,
    skaters: [...(stats.forwards || []), ...(stats.defense || [])].map(skaterLine),
    goalies: (stats.goalies || []).filter((g) => g.toi !== "00:00" || g.starter).map(goalieLine),
  };
}

export async function buildBoxscore(gameId) {
  const [box, landing] = await Promise.all([
    getJson(`${NHL}/gamecenter/${gameId}/boxscore`),
    getJson(`${NHL}/gamecenter/${gameId}/landing`).catch(() => null),
  ]);
  const away = team(box, "awayTeam");
  const home = team(box, "homeTeam");

  const periods = [];
  const scoring = [];
  for (const p of landing?.summary?.scoring || []) {
    const label = periodLabel(p.periodDescriptor);
    const row = { period: label, away: 0, home: 0 };
    for (const g of p.goals || []) {
      const side = text(g.teamAbbrev) === home.abbrev ? "home" : "away";
      row[side] += 1;
      scoring.push({
        period: label, time: g.timeInPeriod, team: text(g.teamAbbrev), strength: g.strength,
        scorer: text(g.name), scorerId: g.playerId, goalsToDate: g.goalsToDate,
        assists: (g.assists || []).map((a) => text(a.name)), shotType: g.shotType,
        score: `${g.awayScore}-${g.homeScore}`,
      });
    }
    periods.push(row);
  }

  return {
    gameId: box.id,
    state: box.gameState,
    period: periodLabel(box.periodDescriptor),
    clock: box.clock ? { timeRemaining: box.clock.timeRemaining, inIntermission: box.clock.inIntermission } : null,
    away, home, periods, scoring,
    threeStars: (landing?.summary?.threeStars || []).map((s) => ({
      star: s.star, playerId: s.playerId, team: s.teamAbbrev, name: text(s.name),
      goals: s.goals, assists: s.assists, points: s.points,
    })),
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  const gameId = String(req.query?.gameId || "");
  if (!/^\d{10}$/.test(gameId)) return res.status(400).json({ error: "gameId (10 digits) required" });
  try {
    const data = await buildBoxscore(gameId);
    res.setHeader("Cache-Control", "s-maxage=15, stale-while-revalidate=15");
    res.status(200).json(data);
  } catch (err) {
    console.error("[boxscore] error:", err.message);
    res.status(502).json({ error: err.message });
  }
}
