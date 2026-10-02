// api/lineups.js — tonight's lineup news per game, refreshed through the day.
//
//   GET /api/lineups?date=YYYY-MM-DD
//
// Sources, merged per team and matched to NHL player ids via each team's current NHL roster:
//   - RotoWire's public NHL lineups page (rotowire.com/hockey/nhl-lineups.php): starting goalie +
//     Confirmed/Expected status, power-play units 1 and 2, injuries. Covers the upcoming slate only.
//   - The NHL's own game feed: once a game's lineup is official (around warmups) its
//     play-by-play lists every dressed player — that is the only skater "confirmed" signal.
// No source publishes full confirmed skater lineups earlier than that.

const NHL = "https://api-web.nhle.com/v1";
const ROTOWIRE = "https://www.rotowire.com/hockey/nhl-lineups.php";
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

async function rosterIndex(team) {
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
    let dressed = {};
    try {
      const pbp = await getJson(`${NHL}/gamecenter/${g.id}/play-by-play`);
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
    }
    const teams = {};
    for (const team of [away, home]) {
      const find = await rosterIndex(team).catch(() => () => null);
      const t = rwGame[team] || { goalie: null, pp1: [], pp2: [], injuries: [] };
      const withId = (list) => list.map((p) => ({ ...p, playerId: find(p.name) }));
      teams[team] = {
        goalie: t.goalie ? { ...t.goalie, playerId: find(t.goalie.name) } : null,
        pp1: withId(t.pp1),
        pp2: withId(t.pp2),
        injuries: withId(t.injuries),
        dressed: dressed[team] || [],
      };
    }
    return {
      gameId: g.id, key, away, home, startTimeUTC: g.startTimeUTC, state: g.gameState,
      officialLineup: Boolean((dressed[away] || []).length && (dressed[home] || []).length),
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
