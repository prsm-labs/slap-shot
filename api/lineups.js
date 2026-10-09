// api/lineups.js — tonight's lineup news per game, refreshed through the day.
//
//   GET /api/lineups?date=YYYY-MM-DD
//
// Sources, merged per team and matched to NHL player ids via each team's current NHL roster:
//   - RotoWire's public NHL lineups page (rotowire.com/hockey/nhl-lineups.php): starting goalie +
//     Confirmed/Expected status, power-play units 1 and 2, injuries. Covers the upcoming slate only.
//   - The NHL's own game feed: once a game's lineup is official (around warmups) its
//     play-by-play lists every dressed player — that is the only skater "confirmed" signal.
//   - The NHL's official game roster report (nhl.com/scores/htmlreports/<season>/RO<game>.HTM): the
//     STARTING LINEUP (5 skaters + goalie per team) is in bold. The roster posts ~1 hour before puck drop,
//     the bold starters closer to it. Checked 2026-10-09: bold = exactly who was on ice at 0:00.
// No source publishes full confirmed skater lineups earlier than that.

const NHL = "https://api-web.nhle.com/v1";
const ROTOWIRE = "https://www.rotowire.com/hockey/nhl-lineups.php";
const STARTED = new Set(["LIVE", "CRIT", "FINAL", "OFF"]);
const RW_TO_NHL = { LA: "LAK", NJ: "NJD", SJ: "SJS", TB: "TBL", UTAH: "UTA", MON: "MTL", WAS: "WSH" };

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
const decode = (s) => String(s || "").replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').trim();

// Parse RotoWire's lineup blocks into { "AWAY@HOME": { AWAY: {...}, HOME: {...} } }.
function parseRotowire(html) {
  const out = {};
  const blocks = html.split('class="lineup is-nhl').slice(1);
  for (const block of blocks) {
    const abbrs = [...block.matchAll(/class="lineup__abbr">\s*([A-Z]+)\s*</g)].map((m) => RW_TO_NHL[m[1]] || m[1]);
    if (abbrs.length < 2) continue;
    const [away, home] = abbrs;
    const teams = {};
    for (const [side, team] of [["is-visit", away], ["is-home", home]]) {
      const listMatch = block.match(new RegExp(`<ul class="lineup__list ${side}">([\\s\\S]*?)</ul>`));
      if (!listMatch) continue;
      const list = listMatch[1];
      const t = { goalie: null, pp1: [], pp2: [], injuries: [] };
      const g = list.match(/lineup__player-highlight-name">\s*<a[^>]*>([^<]+)<\/a>[\s\S]*?class="flex-row align-center ([a-z-]+)"[\s\S]*?<\/div>\s*([A-Za-z ]+?)\s*<\/div>/);
      if (g) t.goalie = { name: decode(g[1]), status: decode(g[3]) || (g[2] === "is-confirmed" ? "Confirmed" : "Expected") };
      let section = null;
      for (const li of list.matchAll(/<li class="(lineup__title[^"]*|lineup__player)">([\s\S]*?)<\/li>/g)) {
        if (li[1].startsWith("lineup__title")) {
          const title = decode(li[2].replace(/<[^>]+>/g, "")).toUpperCase();
          section = title.includes("#1") ? "pp1" : title.includes("#2") ? "pp2" : title.includes("INJUR") ? "injuries" : null;
          continue;
        }
        if (!section) continue;
        const pos = (li[2].match(/lineup__pos">([^<]+)</) || [])[1] || "";
        const name = decode((li[2].match(/title="([^"]+)"/) || [])[1] || li[2].replace(/<[^>]+>/g, ""));
        const tag = (li[2].match(/lineup__inj">([^<]+)</) || [])[1] || null;
        t[section].push({ name, pos: pos.trim(), tag });
      }
      teams[team] = t;
    }
    out[`${away}@${home}`] = teams;
  }
  return out;
}

// Each team's starting goalie from a game's play-by-play: the goalie in net for the first shot
// the team faced. (The boxscore's "starter" flag stays empty until the game is closed out.)
//   -> { TEAM: { playerId, name } }
export function startersFromPbp(pbp) {
  const abbrev = { [pbp.awayTeam.id]: pbp.awayTeam.abbrev, [pbp.homeTeam.id]: pbp.homeTeam.abbrev };
  const names = new Map((pbp.rosterSpots || []).map((r) => [r.playerId, `${r.firstName.default} ${r.lastName.default}`]));
  const out = {};
  for (const play of pbp.plays || []) {
    const d = play.details || {};
    if (!d.goalieInNetId || !d.eventOwnerTeamId) continue;
    const defending = d.eventOwnerTeamId === pbp.awayTeam.id ? pbp.homeTeam.id : pbp.awayTeam.id;
    const team = abbrev[defending];
    if (team && !out[team]) out[team] = { playerId: d.goalieInNetId, name: names.get(d.goalieInNetId) || "" };
  }
  return out;
}

// Official roster report -> bold (starting lineup) rows: [{ number, pos, name }].
export function parseRosterReport(html) {
  const out = [];
  for (const row of String(html).matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const cells = [...row[1].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)];
    if (cells.length !== 3 || !cells.some((c) => /bold/.test(c[1]))) continue;
    const [num, pos, name] = cells.map((c) => decode(c[2].replace(/<[^>]+>/g, "")));
    if (!/^\d+$/.test(num)) continue;
    out.push({ number: Number(num), pos, name: name.replace(/\s*\((C|A)\)\s*$/, "").trim() });
  }
  return out;
}

// Starting lineups for a game, matched to the dressed list by sweater number + last name.
// -> { TEAM: [{ playerId, name, pos }] } with 6 per team, or null until both teams' starters are posted.
const STARTERS_LOOKAHEAD_MS = 2 * 3600_000;
const startersCache = new Map(); // gameId -> result (never changes once posted)
async function startingLineups(g, dressed) {
  if (startersCache.has(g.id)) return startersCache.get(g.id);
  if (g.gameState === "FUT" && Date.parse(g.startTimeUTC) - Date.now() > STARTERS_LOOKAHEAD_MS) return null;
  const teams = Object.keys(dressed);
  if (teams.length !== 2) return null;
  const id = String(g.id);
  const res = await fetch(`https://www.nhl.com/scores/htmlreports/${id.slice(0, 4)}${Number(id.slice(0, 4)) + 1}/RO${id.slice(4)}.HTM`);
  if (!res.ok) return null;
  const bold = parseRosterReport(await res.text());
  const out = {};
  for (const team of teams) out[team] = [];
  for (const b of bold) {
    const last = norm(b.name).split(" ").pop();
    for (const team of teams) {
      const p = dressed[team].find((d) => d.number === b.number && norm(d.name).endsWith(last));
      if (p) out[team].push({ playerId: p.playerId, name: p.name, pos: p.pos });
    }
  }
  if (!teams.every((t) => out[t].length === 6)) return null;
  startersCache.set(g.id, out);
  return out;
}

// Kept in memory while the function instance is warm, to stay well under the NHL API's rate limit:
// rosters for 30 minutes, and a finished game's dressed list + starting goalies for good.
const ROSTER_TTL_MS = 30 * 60_000;
const rosterCache = new Map(); // team -> { at, find }
const finishedGames = new Map(); // gameId -> { dressed, inNet }
const DONE = new Set(["FINAL", "OFF"]);

async function rosterIndex(team) {
  const hit = rosterCache.get(team);
  if (hit && Date.now() - hit.at < ROSTER_TTL_MS) return hit.find;
  const find = await loadRosterIndex(team);
  rosterCache.set(team, { at: Date.now(), find });
  return find;
}

async function loadRosterIndex(team) {
  const r = await getJson(`${NHL}/roster/${team}/current`);
  const players = ["forwards", "defensemen", "goalies"].flatMap((k) => r[k] || []).map((p) => ({
    id: p.id,
    full: norm(`${p.firstName.default} ${p.lastName.default}`),
    last: norm(p.lastName.default),
    first: norm(p.firstName.default),
  }));
  return (name) => {
    const n = norm(name);
    const exact = players.find((p) => p.full === n);
    if (exact) return exact.id;
    const parts = n.split(" ");
    const last = parts[parts.length - 1];
    const byLast = players.filter((p) => p.last === last || p.last.endsWith(` ${last}`));
    if (byLast.length === 1) return byLast[0].id;
    const byInitial = byLast.filter((p) => p.first[0] === parts[0][0]);
    return byInitial.length === 1 ? byInitial[0].id : null;
  };
}

export async function buildLineups(date) {
  const score = await getJson(`${NHL}/score/${date}`);
  const games = (score.games || []).filter((g) => g.gameType === 2 || g.gameType === 3);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

  // RotoWire only shows the current/upcoming slate.
  let rw = {};
  let rotowireError = null;
  if (date >= today) {
    try {
      const res = await fetch(ROTOWIRE, { headers: { "User-Agent": "Mozilla/5.0 (compatible; SlapShot/1.0)" } });
      if (!res.ok) throw new Error(`RotoWire ${res.status}`);
      rw = parseRotowire(await res.text());
    } catch (e) {
      rotowireError = e.message;
    }
  }

  const out = await Promise.all(games.map(async (g) => {
    const away = g.awayTeam.abbrev;
    const home = g.homeTeam.abbrev;
    const key = `${away}@${home}`;
    const rwGame = rw[key] || {};
    const done = finishedGames.get(g.id);
    let dressed = done?.dressed || {};
    // Once a game has started, the goalie actually in net beats any pre-game report.
    let inNet = done?.inNet || {};
    if (!done) try {
      const pbp = await getJson(`${NHL}/gamecenter/${g.id}/play-by-play`);
      if (STARTED.has(g.gameState)) inNet = startersFromPbp(pbp);
      for (const r of pbp.rosterSpots || []) {
        const team = r.teamId === pbp.homeTeam.id ? home : away;
        (dressed[team] ||= []).push({
          playerId: r.playerId,
          name: `${r.firstName.default} ${r.lastName.default}`,
          pos: r.positionCode,
          number: r.sweaterNumber,
        });
      }
    } catch {
      dressed = {};
      inNet = {};
    }
    const starting = await startingLineups(g, dressed).catch(() => null);
    if (!done && DONE.has(g.gameState) && Object.keys(dressed).length && Object.keys(inNet).length === 2) {
      finishedGames.set(g.id, { dressed, inNet });
    }
    const teams = {};
    for (const team of [away, home]) {
      const t = rwGame[team] || { goalie: null, pp1: [], pp2: [], injuries: [] };
      // Roster lookups only matter for RotoWire names.
      const find = rwGame[team] ? await rosterIndex(team).catch(() => () => null) : () => null;
      const withId = (list) => list.map((p) => ({ ...p, playerId: find(p.name) }));
      teams[team] = {
        goalie: t.goalie ? { ...t.goalie, playerId: find(t.goalie.name) } : null,
        pp1: withId(t.pp1),
        pp2: withId(t.pp2),
        injuries: withId(t.injuries),
        dressed: dressed[team] || [],
        inNet: inNet[team] || null,
        startingLineup: starting?.[team] || [],   // official starting 5 + goalie (bold in the NHL roster report)
      };
    }
    return {
      gameId: g.id, key, away, home, startTimeUTC: g.startTimeUTC, state: g.gameState,
      officialLineup: Boolean((dressed[away] || []).length && (dressed[home] || []).length),
      startersPosted: Boolean(starting),
      teams,
    };
  }));

  return { date, generated: new Date().toISOString(), rotowireError, games: out };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  const date = String(req.query?.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "date=YYYY-MM-DD required" });
  try {
    const data = await buildLineups(date);
    // Lineup news changes through the day, not by the second.
    res.setHeader("Cache-Control", "s-maxage=180, stale-while-revalidate=120");
    res.status(200).json(data);
  } catch (err) {
    console.error("[lineups] error:", err.message);
    res.status(502).json({ error: err.message });
  }
}
