// api/live.js — live NHL games + in-game "heating up" read per skater.
// Server-side proxy for the NHL's public game feed (api-web.nhle.com sends no CORS headers, so
// the browser can't call it directly) — same role as Going Yard's api/boxscore.js.
//
//   GET /api/live?date=YYYY-MM-DD
//
// One /score call for the day, then one play-by-play call per game that has started. Everything
// the Live tab shows is computed here from real shot events; nothing is estimated.

const NHL = "https://api-web.nhle.com/v1";
const HD_MAX_FEET = 20;          // same "high danger" line the pool uses (build_player_pool.py)
const RECENT_WINDOW = 10 * 60;   // seconds of game time for a skater's "recent" attempts
const PRESSURE_WINDOW = 5 * 60;  // seconds of game time for team shot pressure
const SHOT_EVENTS = new Set(["shot-on-goal", "missed-shot", "blocked-shot", "goal"]);
const STARTED = new Set(["LIVE", "CRIT", "FINAL", "OFF"]);

// Heat scale — same shape as Going Yard's getLHL (going-yard/src/App.jsx:548-556): three
// in-game components summed, then 8 / 5 / 3 / 1 cutoffs. Hockey inputs replace baseball's:
//   volume  (shots on goal tonight)      stands in for exit velocity,   0-3 pts
//   danger  (unblocked attempts <=20 ft) stands in for hard-hit count,  0-4 pts
//   recency (attempts, last 10 game min) stands in for launch angle,    0-3 pts
// The point values and cutoffs are carried over, not yet checked against hockey outcomes.
export function heatFor(s) {
  const volume = s.sog >= 4 ? 3 : s.sog >= 3 ? 2 : s.sog >= 2 ? 1 : 0;
  const danger = s.hd >= 3 ? 4 : s.hd >= 2 ? 3 : s.hd === 1 ? 1 : 0;
  const recency = s.recentAttempts >= 3 ? 3 : s.recentAttempts >= 2 ? 2 : s.recentAttempts >= 1 ? 1 : 0;
  const points = volume + danger + recency;
  const tier =
    points >= 8 ? { label: "On Fire", cls: "fire" }
    : points >= 5 ? { label: "Heating Up", cls: "hot" }
    : points >= 3 ? { label: "Warm", cls: "warm" }
    : points >= 1 ? { label: "Neutral", cls: "neutral" }
    : { label: "Ice Cold", cls: "cold" };
  return { points, volume, danger, recency, ...tier };
}

function elapsedSeconds(play) {
  const [m, s] = (play.timeInPeriod || "0:0").split(":").map(Number);
  return (play.periodDescriptor.number - 1) * 1200 + m * 60 + s;
}

// NHL feed coordinates are in feet with the nets at x = +/-89. homeTeamDefendingSide says which
// end the home team defends in that period, so the shooter's target net is the other end.
function shotDistance(play, isHomeShooter) {
  const { xCoord: x, yCoord: y } = play.details || {};
  if (x == null || y == null) return null;
  const homeDefendsRight = play.homeTeamDefendingSide === "right";
  const attacksRight = isHomeShooter ? !homeDefendsRight : homeDefendsRight;
  return Math.hypot(x - (attacksRight ? 89 : -89), y);
}

export function analyzeGame(pbp) {
  const teams = {
    [pbp.homeTeam.id]: { abbrev: pbp.homeTeam.abbrev, isHome: true },
    [pbp.awayTeam.id]: { abbrev: pbp.awayTeam.abbrev, isHome: false },
  };
  const roster = {};
  for (const r of pbp.rosterSpots || []) {
    roster[r.playerId] = {
      name: `${r.firstName.default} ${r.lastName.default}`,
      team: teams[r.teamId]?.abbrev,
      position: r.positionCode,
      headshot: r.headshot,
    };
  }

  const plays = pbp.plays || [];
  const now = plays.length ? Math.max(...plays.map(elapsedSeconds)) : 0;
  const skaters = {};
  const goals = [];
  const pressure = { home: 0, away: 0 };

  const line = (pid) => {
    if (!skaters[pid]) {
      skaters[pid] = {
        playerId: pid, ...roster[pid], gameId: pbp.id,
        attempts: 0, unblocked: 0, sog: 0, hd: 0, recentAttempts: 0,
        goals: 0, assists: 0, lastShot: null,
      };
    }
    return skaters[pid];
  };

  for (const play of plays) {
    const d = play.details || {};
    const t = elapsedSeconds(play);

    if (play.typeDescKey === "goal") {
      for (const a of [d.assist1PlayerId, d.assist2PlayerId]) if (a) line(a).assists += 1;
      goals.push(goalRow(pbp, play, teams, roster));
    }
    if (!SHOT_EVENTS.has(play.typeDescKey)) continue;

    const shooter = d.shootingPlayerId || d.scoringPlayerId;
    const team = teams[d.eventOwnerTeamId];
    if (!shooter || !team) continue;

    if (now - t <= PRESSURE_WINDOW) pressure[team.isHome ? "home" : "away"] += 1;

    const s = line(shooter);
    s.attempts += 1;
    if (now - t <= RECENT_WINDOW) s.recentAttempts += 1;
    s.lastShot = `P${play.periodDescriptor.number} ${play.timeInPeriod}`;
    if (play.typeDescKey === "blocked-shot") continue;   // coords are where it was blocked

    s.unblocked += 1;
    if (play.typeDescKey === "shot-on-goal" || play.typeDescKey === "goal") s.sog += 1;
    if (play.typeDescKey === "goal") s.goals += 1;
    const dist = shotDistance(play, team.isHome);
    if (dist != null && dist <= HD_MAX_FEET) s.hd += 1;
  }

  const lines = Object.values(skaters)
    .filter((s) => s.position !== "G")
    .map((s) => ({
      ...s,
      opp: s.team === pbp.homeTeam.abbrev ? pbp.awayTeam.abbrev : pbp.homeTeam.abbrev,
      heat: heatFor(s),
    }));

  const total = pressure.home + pressure.away;
  return {
    skaters: lines,
    goals,
    pressure: {
      windowMinutes: PRESSURE_WINDOW / 60,
      homeAttempts: pressure.home,
      awayAttempts: pressure.away,
      homeShare: total ? Math.round((pressure.home / total) * 100) : 50,
    },
  };
}

// NHL feed shot types -> MoneyPuck's codes, so live rows read like the nightly log.
const SHOT_TYPES = { backhand: "BACK", "tip-in": "TIP", deflected: "DEFL", "wrap-around": "WRAP" };

// Same row shape as public/data/goals_log.json (build_goals_log.py), so the Goal Tracker and
// ticker can show tonight's goals alongside the nightly MoneyPuck log.
function goalRow(pbp, play, teams, roster) {
  const d = play.details || {};
  const team = teams[d.eventOwnerTeamId] || {};
  const dist = shotDistance(play, team.isHome);
  const [m, s] = (play.timeInPeriod || "0:0").split(":").map(Number);
  return {
    date: pbp.gameDate,
    gameId: pbp.id,
    period: play.periodDescriptor.number,
    timeInPeriod: `${m}:${String(s).padStart(2, "0")}`,
    elapsedSeconds: elapsedSeconds(play),
    scorerId: d.scoringPlayerId,
    scorerName: roster[d.scoringPlayerId]?.name || "",
    scorerTeam: team.abbrev,
    seasonGoalNum: d.scoringPlayerTotal ?? null,
    goalieId: d.goalieInNetId || 0,
    goalieName: d.goalieInNetId ? roster[d.goalieInNetId]?.name || "" : "Empty Net",
    oppTeam: team.isHome ? pbp.awayTeam.abbrev : pbp.homeTeam.abbrev,
    shotType: d.shotType ? SHOT_TYPES[d.shotType] || d.shotType.toUpperCase() : null,
    shotDistance: dist != null ? Math.round(dist * 10) / 10 : null,
    matchup: `${pbp.awayTeam.abbrev}@${pbp.homeTeam.abbrev}`,
    live: true,
  };
}

function summarizeGame(g) {
  return {
    gameId: g.id,
    state: g.gameState,
    startTimeUTC: g.startTimeUTC,
    period: g.periodDescriptor?.number ?? g.period ?? null,
    periodType: g.periodDescriptor?.periodType ?? null,
    clock: g.clock ? { timeRemaining: g.clock.timeRemaining, inIntermission: g.clock.inIntermission } : null,
    away: { abbrev: g.awayTeam.abbrev, score: g.awayTeam.score ?? null, sog: g.awayTeam.sog ?? null },
    home: { abbrev: g.homeTeam.abbrev, score: g.homeTeam.score ?? null, sog: g.homeTeam.sog ?? null },
  };
}

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

// Real time of day for each goal: the NHL feed only has game-clock time, ESPN's public feed
// stamps every play with a UTC wallclock (same lookup as nhl_project/espn_wallclock.py).
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl";
const ESPN_TO_NHL = { LA: "LAK", NJ: "NJD", SJ: "SJS", TB: "TBL", UTAH: "UTA" };
const clockKey = (period, mmss) => {
  const [m, sec] = String(mmss).split(":").map(Number);
  return `${period}|${m}:${String(sec).padStart(2, "0")}`;
};

async function espnWallclocks(date, games) {
  const out = new Map();
  try {
    const board = await getJson(`${ESPN}/scoreboard?dates=${date.replace(/-/g, "")}`);
    const ids = new Map();
    for (const ev of board.events || []) {
      const side = {};
      for (const c of ev.competitions[0].competitors) side[c.homeAway] = ESPN_TO_NHL[c.team.abbreviation] || c.team.abbreviation;
      ids.set(`${side.away}@${side.home}`, ev.id);
    }
    await Promise.all(games.map(async (g) => {
      const id = ids.get(`${g.away.abbrev}@${g.home.abbrev}`);
      if (!id) return;
      const summary = await getJson(`${ESPN}/summary?event=${id}`);
      const times = {};
      for (const p of summary.plays || []) {
        if (p.scoringPlay && p.wallclock && p.clock?.displayValue) times[clockKey(p.period.number, p.clock.displayValue)] = p.wallclock;
      }
      out.set(g.gameId, times);
    }));
  } catch (e) {
    console.error("[live] ESPN wallclock lookup failed:", e.message);
  }
  return out;
}

function attachWallclock(goal, times) {
  if (!times) return null;
  const [m, sec] = goal.timeInPeriod.split(":").map(Number);
  for (const delta of [0, -1, 1, -2, 2]) {
    const t = m * 60 + sec + delta;
    if (t < 0) continue;
    const hit = times[clockKey(goal.period, `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`)];
    if (hit) return hit;
  }
  return null;
}

// Every goalie who has played tonight, from the NHL boxscore: shots against, saves, goals
// against, TOI (the Crease Lab "Live" view and its 👑 saves leader).
function goalieLines(box, game) {
  const out = [];
  for (const side of ["awayTeam", "homeTeam"]) {
    const team = box[side].abbrev;
    const opp = box[side === "awayTeam" ? "homeTeam" : "awayTeam"].abbrev;
    for (const g of box.playerByGameStats?.[side]?.goalies || []) {
      const [m, s] = String(g.toi || "0:0").split(":").map(Number);
      if (!(m * 60 + s)) continue;
      out.push({
        gameId: game.gameId, team, opp, isHome: side === "homeTeam", state: game.state,
        playerId: g.playerId, name: g.name?.default || "", starter: Boolean(g.starter),
        shotsAgainst: g.shotsAgainst ?? 0, saves: g.saves ?? 0, goalsAgainst: g.goalsAgainst ?? 0, toi: g.toi,
      });
    }
  }
  return out;
}

export async function buildLive(date) {
  const score = await getJson(`${NHL}/score/${date}`);
  const games = (score.games || []).filter((g) => g.gameType === 2 || g.gameType === 3).map(summarizeGame);

  const skaters = [];
  const goals = [];
  const goalies = [];
  await Promise.all(
    games.filter((g) => STARTED.has(g.state)).map(async (g) => {
      try {
        const [pbp, box] = await Promise.all([
          getJson(`${NHL}/gamecenter/${g.gameId}/play-by-play`),
          getJson(`${NHL}/gamecenter/${g.gameId}/boxscore`).catch(() => null),
        ]);
        const { skaters: lines, goals: gameGoals, pressure } = analyzeGame(pbp);
        g.pressure = pressure;
        skaters.push(...lines);
        goals.push(...gameGoals);
        if (box) goalies.push(...goalieLines(box, g));
      } catch (e) {
        g.error = e.message;
      }
    })
  );

  if (goals.length) {
    const scoredGames = games.filter((g) => goals.some((x) => x.gameId === g.gameId));
    const clocks = await espnWallclocks(date, scoredGames);
    for (const goal of goals) goal.wallclock = attachWallclock(goal, clocks.get(goal.gameId));
  }
  // Last goal of the night first (game clock as the fallback when ESPN has no time yet).
  goals.sort((a, b) => (b.wallclock || "").localeCompare(a.wallclock || "") || b.elapsedSeconds - a.elapsedSeconds);
  return { date: score.currentDate || date, generated: new Date().toISOString(), games, skaters, goals, goalies };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  const date = String(req.query?.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "date=YYYY-MM-DD required" });
  try {
    const data = await buildLive(date);
    // Short shared cache: every viewer polling at once costs the NHL API one call per 15s.
    res.setHeader("Cache-Control", "s-maxage=15, stale-while-revalidate=15");
    res.status(200).json(data);
  } catch (err) {
    console.error("[live] error:", err.message);
    res.status(502).json({ error: err.message });
  }
}
