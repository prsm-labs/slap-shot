// api/player.js — a goalie's real NHL numbers for the slideout, proxied from the NHL's public player
// feed (no CORS on api-web.nhle.com):
//   - this season's and last season's regular-season totals (GP, GS, W-L-OTL, SV%, GAA, SO, SA, GA, TOI)
//   - the most recent games across both seasons (date, opponent, decision, shots, saves, goals, SV%, TOI)
//
//   GET /api/player?id=8479979

const NHL = "https://api-web.nhle.com/v1";
const RECENT = 10;

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

const text = (v) => (v && typeof v === "object" ? v.default : v) ?? "";
const round = (v, d) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

// NHL season id (e.g. 20262027) for a date: a season starts in September.
function seasonOf(date) {
  const y = date.getUTCFullYear();
  return date.getUTCMonth() >= 8 ? Number(`${y}${y + 1}`) : Number(`${y - 1}${y}`);
}

function seasonLine(s, id) {
  if (!s) return { season: id, gp: 0 };
  return {
    season: id, team: text(s.teamName), gp: s.gamesPlayed ?? 0, gs: s.gamesStarted ?? null,
    w: s.wins ?? 0, l: s.losses ?? 0, otl: s.otLosses ?? 0, so: s.shutouts ?? 0,
    sa: s.shotsAgainst ?? null, ga: s.goalsAgainst ?? null,
    saves: s.shotsAgainst != null && s.goalsAgainst != null ? s.shotsAgainst - s.goalsAgainst : null,
    svPct: round(s.savePctg, 3), gaa: round(s.goalsAgainstAvg, 2), toi: s.timeOnIce ?? null,
  };
}

function gameLine(g, season) {
  return {
    gameId: g.gameId, season, date: g.gameDate, opp: g.opponentAbbrev, home: g.homeRoadFlag === "H",
    decision: g.decision || null, started: Boolean(g.gamesStarted),
    sa: g.shotsAgainst ?? 0, ga: g.goalsAgainst ?? 0, saves: (g.shotsAgainst ?? 0) - (g.goalsAgainst ?? 0),
    svPct: round(g.savePctg, 3), toi: g.toi ?? null,
  };
}

export async function buildPlayer(id) {
  const current = seasonOf(new Date());
  const previous = Number(`${Math.floor(current / 10000) - 1}${Math.floor(current / 10000)}`);
  const [landing, logNow, logPrev] = await Promise.all([
    getJson(`${NHL}/player/${id}/landing`),
    getJson(`${NHL}/player/${id}/game-log/${current}/2`).catch(() => ({ gameLog: [] })),
    getJson(`${NHL}/player/${id}/game-log/${previous}/2`).catch(() => ({ gameLog: [] })),
  ]);
  const nhl = (landing.seasonTotals || []).filter((s) => s.leagueAbbrev === "NHL" && s.gameTypeId === 2);
  // A traded goalie has one row per team; add them up for the season line.
  const total = (sid) => {
    const rows = nhl.filter((s) => s.season === sid);
    if (!rows.length) return null;
    if (rows.length === 1) return rows[0];
    const sum = (k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
    const sa = sum("shotsAgainst");
    const ga = sum("goalsAgainst");
    const mins = rows.reduce((a, r) => {
      const [m, s] = String(r.timeOnIce || "0:0").split(":").map(Number);
      return a + m + s / 60;
    }, 0);
    return {
      gamesPlayed: sum("gamesPlayed"), gamesStarted: sum("gamesStarted"), wins: sum("wins"), losses: sum("losses"),
      otLosses: sum("otLosses"), shutouts: sum("shutouts"), shotsAgainst: sa, goalsAgainst: ga,
      savePctg: sa ? 1 - ga / sa : null, goalsAgainstAvg: mins ? (ga * 60) / mins : null,
      teamName: { default: rows.map((r) => text(r.teamCommonName)).join(" / ") },
      timeOnIce: `${Math.floor(mins)}:${String(Math.round((mins % 1) * 60)).padStart(2, "0")}`,
    };
  };
  // Game logs come newest first; keep the last RECENT games across both seasons, oldest first.
  const games = [
    ...(logNow.gameLog || []).map((g) => gameLine(g, current)),
    ...(logPrev.gameLog || []).map((g) => gameLine(g, previous)),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, RECENT).reverse();

  return {
    playerId: Number(id),
    name: `${text(landing.firstName)} ${text(landing.lastName)}`.trim(),
    team: landing.currentTeamAbbrev || null,
    position: landing.position || null,
    catches: landing.shootsCatches || null,
    number: landing.sweaterNumber ?? null,
    birthDate: landing.birthDate || null,
    seasons: { current: seasonLine(total(current), current), previous: seasonLine(total(previous), previous) },
    games,
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  const id = String(req.query?.id || "");
  if (!/^\d{7}$/.test(id)) return res.status(400).json({ error: "id=<7-digit NHL player id> required" });
  try {
    const data = await buildPlayer(id);
    // Season totals and game logs change once a game ends; 10 minutes is plenty fresh.
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=600");
    res.status(200).json(data);
  } catch (err) {
    console.error("[player] error:", err.message);
    res.status(502).json({ error: err.message });
  }
}
