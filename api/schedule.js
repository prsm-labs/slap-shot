// api/schedule.js -- 📅 Schedule tab (2026-10-23, user: upcoming schedule + recent scores, like Six Points / CourtIQ).
// Server-side proxy for the NHL's public feed (api-web.nhle.com sends no CORS headers):
//
//   GET /api/schedule?start=YYYY-MM-DD&days=N   (1-14)
//
// /schedule/{date} returns 7 days per call (games, state, scores once started, TV, winning goalie / goal scorer);
// /score/{date} adds each started game's goal list (scorers + assists -> the game's goal / point leaders) and the live
// clock; /standings/now gives each team's current W-L-OTL for upcoming games. Cached 30 s at the edge.

const NHL = "https://api-web.nhle.com/v1";
const STARTED = new Set(["LIVE", "CRIT", "FINAL", "OFF"]);

const iso = (d) => d.toISOString().slice(0, 10);
function addDays(ymd, n) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}
function easternToday() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
const getJson = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
};
const nm = (x) => x?.default || "";

// Goals + assists per player from the score feed's goal list -> top goal scorers and point getters.
function leadersOf(goals) {
  const by = new Map();
  for (const g of goals || []) {
    const add = (id, name, team, k) => {
      if (!id) return;
      const row = by.get(id) || { id, name, team, g: 0, a: 0 };
      row[k] += 1;
      by.set(id, row);
    };
    add(g.playerId, nm(g.name), g.teamAbbrev, "g");
    for (const a of g.assists || []) add(a.playerId, nm(a.name), g.teamAbbrev, "a");
  }
  return [...by.values()].map((r) => ({ ...r, pts: r.g + r.a }))
    .filter((r) => r.g >= 2 || r.pts >= 2)
    .sort((a, b) => b.pts - a.pts || b.g - a.g)
    .slice(0, 3);
}

export default async function handler(req, res) {
  const start = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.start || "")) ? req.query.start : easternToday();
  const days = Math.max(1, Math.min(14, Number(req.query.days) || 7));
  const dates = [...Array(days)].map((_, i) => addDays(start, i));
  const today = easternToday();
  try {
    const weeks = await Promise.all([...Array(Math.ceil(days / 7))].map((_, i) => getJson(`${NHL}/schedule/${addDays(start, i * 7)}`)));
    const sched = new Map();
    for (const w of weeks) for (const d of w.gameWeek || []) sched.set(d.date, d.games || []);
    const scoreDays = dates.filter((d) => d <= today);
    const [scores, standings] = await Promise.all([
      Promise.all(scoreDays.map((d) => getJson(`${NHL}/score/${d}`).then((j) => [d, j.games || []]).catch(() => [d, []]))),
      getJson(`${NHL}/standings/now`).catch(() => null),
    ]);
    const scoreBy = new Map(scores.flatMap(([, gs]) => gs.map((g) => [g.id, g])));
    const rec = new Map((standings?.standings || []).map((t) => [nm(t.teamAbbrev), `${t.wins}-${t.losses}-${t.otLosses}`]));
    const out = dates.map((date) => ({
      date,
      games: (sched.get(date) || []).filter((g) => g.gameType === 2 || g.gameType === 3 || g.gameType === 1).map((g) => {
        const s = scoreBy.get(g.id);
        const started = STARTED.has(g.gameState);
        const side = (t, st) => ({
          team: t.abbrev, score: started ? (st?.score ?? t.score ?? 0) : null, sog: st?.sog ?? null,
          record: rec.get(t.abbrev) || null,
        });
        const away = side(g.awayTeam, s?.awayTeam);
        const home = side(g.homeTeam, s?.homeTeam);
        const done = g.gameState === "FINAL" || g.gameState === "OFF";
        if (done) { away.winner = away.score > home.score; home.winner = home.score > away.score; }
        return {
          id: g.id, startUTC: g.startTimeUTC, state: g.gameState, scheduleState: g.gameScheduleState, gameType: g.gameType,
          period: s?.periodDescriptor?.number ?? g.periodDescriptor?.number ?? null,
          periodType: (s?.periodDescriptor || g.periodDescriptor)?.periodType || null,
          lastPeriodType: g.gameOutcome?.lastPeriodType || s?.gameOutcome?.lastPeriodType || null,
          clock: s?.clock ? { time: s.clock.timeRemaining, intermission: !!s.clock.inIntermission } : null,
          away, home,
          tv: [...new Set((g.tvBroadcasts || []).filter((b) => b.countryCode === "US").map((b) => b.network))].join(", ") || null,
          winningGoalie: g.winningGoalie ? `${nm(g.winningGoalie.firstInitial)} ${nm(g.winningGoalie.lastName)}` : null,
          winningGoal: g.winningGoalScorer ? `${nm(g.winningGoalScorer.firstInitial)} ${nm(g.winningGoalScorer.lastName)}` : null,
          leaders: s ? leadersOf(s.goals) : [],
        };
      }),
    }));
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=300");
    res.status(200).json({ checkedAt: new Date().toISOString(), today, days: out });
  } catch (err) {
    res.status(502).json({ error: "nhl_fetch_failed", message: err.message });
  }
}
