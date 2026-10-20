// api/boxscore.js — one game's box score, proxied from the NHL's public game feed (no CORS on
// api-web.nhle.com). Same role as Going Yard's api/boxscore.js.
//
//   GET /api/boxscore?gameId=2026020004

import { trackPlays } from "./live.js";

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
    hits: p.hits, blocks: p.blockedShots, pim: p.pim, toi: p.toi, shifts: p.shifts ?? null, ppGoals: p.powerPlayGoals,
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

// 2026-10-20 play-by-play: one readable line per NHL play (names from the feed's roster spots).
const SHOT = { wrist: "wrist shot", slap: "slap shot", snap: "snap shot", backhand: "backhand", "tip-in": "tip-in", deflected: "deflection",
  "wrap-around": "wraparound", bat: "batted puck", poke: "poke", "between-legs": "between-the-legs", cradle: "cradle" };
function playLines(pbp) {
  const who = new Map((pbp.rosterSpots || []).map((r) => [r.playerId, `${text(r.firstName)} ${text(r.lastName)}`.trim()]));
  const team = new Map([[pbp.awayTeam?.id, pbp.awayTeam?.abbrev], [pbp.homeTeam?.id, pbp.homeTeam?.abbrev]]);
  const n = (id) => who.get(id) || (id ? `#${id}` : "");
  const shot = (d) => (d.shotType ? ` (${SHOT[d.shotType] || d.shotType})` : "");
  let away = 0, home = 0;
  const out = [];
  for (const p of pbp.plays || []) {
    const d = p.details || {};
    const k = p.typeDescKey;
    let t = null;
    if (k === "goal") {
      away = d.awayScore ?? away; home = d.homeScore ?? home;
      const a = [d.assist1PlayerId, d.assist2PlayerId].filter(Boolean).map(n);
      t = `GOAL — ${n(d.scoringPlayerId)}${d.scoringPlayerTotal ? ` (${d.scoringPlayerTotal})` : ""}${shot(d)}${a.length ? `, assists: ${a.join(", ")}` : ", unassisted"}`;
    } else if (k === "shot-on-goal") t = `Shot on goal — ${n(d.shootingPlayerId)}${shot(d)}${d.goalieInNetId ? `, saved by ${n(d.goalieInNetId)}` : ""}`;
    else if (k === "missed-shot") t = `Missed shot — ${n(d.shootingPlayerId)}${shot(d)}${d.reason ? ` (${String(d.reason).replace(/-/g, " ")})` : ""}`;
    else if (k === "blocked-shot") t = `Blocked — ${n(d.blockingPlayerId)} blocks ${n(d.shootingPlayerId)}`;
    else if (k === "hit") t = `Hit — ${n(d.hittingPlayerId)} on ${n(d.hitteePlayerId)}`;
    else if (k === "faceoff") t = `Faceoff — ${n(d.winningPlayerId)} wins vs ${n(d.losingPlayerId)}`;
    else if (k === "penalty") t = `Penalty — ${n(d.committedByPlayerId) || team.get(d.eventOwnerTeamId) || ""}, ${String(d.descKey || "").replace(/-/g, " ")} (${d.duration || "?"} min)${d.drawnByPlayerId ? `, drawn by ${n(d.drawnByPlayerId)}` : ""}`;
    else if (k === "giveaway") t = `Giveaway — ${n(d.playerId)}`;
    else if (k === "takeaway") t = `Takeaway — ${n(d.playerId)}`;
    else if (k === "stoppage") t = `Stoppage${d.reason ? ` — ${String(d.reason).replace(/-/g, " ")}` : ""}`;
    else if (k === "period-start") t = "Period start";
    else if (k === "period-end") t = "End of period";
    else if (k === "game-end") t = "End of game";
    else if (k === "shootout-complete") t = "Shootout over";
    else t = String(k || "").replace(/-/g, " ");
    out.push({ id: p.eventId, period: periodLabel(p.periodDescriptor), time: p.timeInPeriod || "", kind: k, text: t,
      team: team.get(d.eventOwnerTeamId) || null, goal: k === "goal", score: `${away}-${home}` });
  }
  return out;
}

export async function buildBoxscore(gameId, { plays = false } = {}) {
  const [box, landing, pbp, rail] = await Promise.all([
    getJson(`${NHL}/gamecenter/${gameId}/boxscore`),
    getJson(`${NHL}/gamecenter/${gameId}/landing`).catch(() => null),
    getJson(`${NHL}/gamecenter/${gameId}/play-by-play`).catch(() => null),
    getJson(`${NHL}/gamecenter/${gameId}/right-rail`).catch(() => null),
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
    clock: box.clock ? {
      timeRemaining: box.clock.timeRemaining, secondsRemaining: box.clock.secondsRemaining ?? null,
      running: Boolean(box.clock.running), inIntermission: box.clock.inIntermission,
    } : null,
    periodNumber: box.periodDescriptor?.number ?? null,
    // Skaters on the ice per side right now (e.g. 5 vs 4 on a power play) — sizes the on-ice guess.
    situation: landing?.situation ? {
      code: landing.situation.situationCode || null,
      away: landing.situation.awayTeam?.strength ?? null, home: landing.situation.homeTeam?.strength ?? null,
    } : null,
    away, home, periods, scoring,
    // Game Tracker view: recent plays + rink positions (api/live.js trackPlays)
    track: pbp ? trackPlays(pbp) : null,
    // 2026-10-20: team comparison (NHL right rail: SOG, faceoffs, power play, PIM, hits, blocks, giveaways, takeaways)
    teamStats: (rail?.teamGameStats || []).map((s) => ({ key: s.category, away: s.awayValue, home: s.homeValue })),
    plays: plays && pbp ? playLines(pbp) : undefined,
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
    const data = await buildBoxscore(gameId, { plays: Boolean(req.query?.plays) });
    res.setHeader("Cache-Control", "s-maxage=15, stale-while-revalidate=15");
    res.status(200).json(data);
  } catch (err) {
    console.error("[boxscore] error:", err.message);
    res.status(502).json({ error: err.message });
  }
}
