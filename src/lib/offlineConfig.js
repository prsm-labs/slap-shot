import { pct } from './offline.js'

// 2026-11-02 (user): what Slap Shot's 📦 offline snapshot and data download hold (lib/offline.js does the work).
// Snapshot = every file a page reads for tonight's slate. Download = our own numbers only (no book prices).
const j = (u) => fetch(u, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
const TOP = ['todays_pool', 'goals_log', 'callups', 'first_concede', 'h2h_today', 'line_board', 'prism_picks', 'radar', 'stats_index',
  'team_ratings', 'track_record_2026', 'projections/index', 'sims/index']
const pool = () => j('/data/todays_pool.json')
const num = (x) => (x == null ? null : Number(x))

export default {
  app: 'Slap Shot',
  league: 'NHL',
  url: 'https://nhl.degenlabs.app',
  shell: ['/appleWorker.js', '/lampWorker.js', '/manifest.json'],
  what: 'tonight’s slate (projections, labs, Top 3, sims, Track Record)',
  tablesWhat: 'tonight’s skater and goalie projections, Game Sims, PRISM Picks and the season’s graded projections',
  async label() {
    const p = await pool()
    return p?._meta?.slateDate ? `slate ${p._meta.slateDate}` : ''
  },
  async files() {
    const [p, idx, sims] = await Promise.all([pool(), j('/data/stats_index.json'), j('/data/sims/index.json')])
    const date = p?._meta?.slateDate
    const teams = new Set((p?._meta?.slate || []).flatMap((g) => [g.home, g.away]))
    return [
      ...TOP.map((f) => `/data/${f}.json`),
      '/data/track_record.csv',
      ...(idx?.seasons || []).map((s) => `/data/${s.file}`),
      ...(date ? [`/data/projections/${date}.json`, `/data/top3/${date}.json`, `/data/pairs/${date}.json`, `/data/odds/${date}.json`] : []),
      ...(sims?.games || []).filter((g) => !date || g.slateDate === date).map((g) => `/data/sims/${g.gameId}.json`),
      ...[...teams].map((t) => `/data/onoff/${t}.json`),
    ]
  },
  async tables() {
    const p = await pool()
    const date = p?._meta?.slateDate
    const [snap, sims, picks, track] = await Promise.all([date ? j(`/data/projections/${date}.json`) : null, j('/data/sims/index.json'), j('/data/prism_picks.json'), j('/data/track_record_2026.json')])
    const tip = Object.fromEntries((p?._meta?.slate || []).map((g) => [g.gameId, g.startTimeUTC]))
    return [
      {
        name: 'skaters.csv', about: 'every skater on tonight’s slate: grade, goal / point / assist / shots chances', rows: snap?.players || [],
        cols: [
          ['Date', () => date], ['Puck drop (UTC)', (x) => tip[x.gameId]], ['Player', (x) => x.name], ['Team', (x) => x.team], ['Opp', (x) => x.opp],
          ['Home', (x) => (x.isHome ? 'Y' : 'N')], ['Pos', (x) => x.position], ['Grade', (x) => x.effectiveGrade], ['Grade score', (x) => x.gradeScore], ['Tier', (x) => x.tier],
          ['Opp goalie', (x) => x.opponentGoalie], ['Goal %', (x) => num(x.anytimeGoalPct)], ['Point %', (x) => num(x.anytimePointPct)], ['Assist %', (x) => num(x.modelAssistPct)],
          ['2+ goals %', (x) => num(x.multiGoalPct)], ['2+ points %', (x) => num(x.multiPoint2Pct)], ['3+ points %', (x) => num(x.multiPoint3Pct)],
          ['3+ shots on goal %', (x) => num(x.modelSog3Pct)], ['Shots on goal / game', (x) => x.sogPg], ['First goal %', (x) => num(x.firstGoalPct)],
        ],
      },
      {
        name: 'goalies.csv', about: 'tonight’s starting goalies: projected shots, saves, goals allowed', rows: snap?.goalies || [],
        cols: [['Date', () => date], ['Goalie', (g) => g.goalie], ['Team', (g) => g.team], ['Opp', (g) => g.opp], ['Status', (g) => g.status],
          ['Shots against', (g) => g.shots], ['Saves', (g) => g.saves], ['Goals allowed', (g) => g.goalsAllowed], ['Save %', (g) => pct(g.savePct)]],
      },
      {
        name: 'game_sims.csv', about: '15,000 simulated games per matchup', rows: (sims?.games || []).filter((g) => !date || g.slateDate === date),
        cols: [['Date', (g) => g.slateDate], ['Puck drop (UTC)', (g) => g.startTimeUTC], ['Away', (g) => g.away], ['Home', (g) => g.home], ['Home win %', (g) => pct(g.homeWin)],
          ['Typical away', (g) => g.typical?.[1]], ['Typical home', (g) => g.typical?.[0]]],
      },
      {
        name: 'prism_picks.csv', about: 'every PRISM Pick so far this season with its result', rows: (picks?.nights || []).flatMap((n) => (n.picks || []).map((k) => ({ n, k }))),
        cols: [['Date', (r) => r.n.date], ['Player', (r) => r.k.name], ['Team', (r) => r.k.team], ['Opp', (r) => r.k.opp], ['Pick', (r) => r.k.label], ['Our chance %', (r) => pct(r.k.chance)],
          ['Cleared (recent games)', (r) => r.k.last?.[1]], ['Of games', (r) => r.k.last?.[0]], ['Result', (r) => r.k.result], ['Actual', (r) => r.k.actual]],
      },
      {
        name: 'track_record.csv', about: 'every graded skater this season: what we said before puck drop vs what happened', rows: track?.rows || [],
        cols: [['Date', (r) => r.date], ['Player', (r) => r.name], ['Team', (r) => r.team], ['Opp', (r) => r.opp], ['Grade', (r) => r.proj?.effectiveGrade],
          ['Goal %', (r) => r.proj?.anytimeGoalPct], ['Point %', (r) => r.proj?.anytimePointPct], ['3+ SOG %', (r) => r.proj?.modelSog3Pct ?? r.proj?.plus3SogPct],
          ['Played', (r) => (r.actual?.played ? 'Y' : 'N')], ['Goals', (r) => r.actual?.g], ['Assists', (r) => r.actual?.a], ['Points', (r) => r.actual?.p], ['Shots on goal', (r) => r.actual?.sog], ['TOI', (r) => r.actual?.toi]],
      },
    ]
  },
}
