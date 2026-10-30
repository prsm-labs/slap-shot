// build_game_sims.mjs -- Slap Shot 🎬 Game Sim (2026-10-29, user: RotoBot-style "we simulated this game 10,000 times" replays).
// Run from nhl_project after build_player_pool.py / build_team_ratings.py:  node slap-shot/scripts/build_game_sims.mjs
// For each game on the slate that hasn't started: each team's 18 skaters (the NHL's dressed list once it's posted, else the likeliest
// to dress by Slap Shot's dress model), lines and pairs by estimated ice time, PP units from RotoWire (else PP ice time), then short
// calibration passes so the sims match Slap Shot's own numbers: each team's regulation goals = the backtested game model
// (lib/gameModel.js), each team's shots = its shots-for / the opponent's shots-against, each skater's goals / assists / shots = his
// grade-model chances (lib/grades.js) converted to averages. 10,000 games are then played (src/sim/nhlSim.js). Writes
// public/data/sims/<gameId>.json + sims/index.json. A game that has started keeps its pre-game file.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { runMany } from '../src/sim/nhlSim.js'
import { gradeSlate } from '../src/lib/grades.js'
import { projectGame } from '../src/lib/gameModel.js'
import { dressWeights } from '../src/lib/projections.js'
import { estimatedToi, ppToiPerGame } from '../src/lib/toi.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DATA = path.resolve(HERE, '../public/data')
const OUTDIR = process.env.SIM_OUT || path.join(DATA, 'sims')
const N = 10000
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
const pool = read(process.env.SIM_POOL || path.join(DATA, 'todays_pool.json'))
const ratings = read(path.join(DATA, 'team_ratings.json'))
fs.mkdirSync(OUTDIR, { recursive: true })
const meta = pool._meta
const slate = typeof meta.slate === 'string' ? JSON.parse(meta.slate.replace(/'/g, '"').replace(/None/g, 'null')) : meta.slate
const teamsMeta = meta.teams || {}

let lineups = null
try {
  const res = await fetch(`https://nhl.degenlabs.app/api/lineups?date=${meta.slateDate}`, { signal: AbortSignal.timeout(20000) })
  if (res.ok) lineups = await res.json()
} catch (e) { console.log('lineups unavailable:', e.message) }
const luGame = (away, home) => lineups?.games?.find((g) => g.away === away && g.home === home)

const grades = gradeSlate(pool.players)
const dress = dressWeights(pool.players)
const lam = (p) => -Math.log(1 - Math.min(0.97, Math.max(0.001, p)))
// Poisson mean with P(X >= 3) = p
function sogMean(p) {
  let lo = 0.01, hi = 12
  for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; const q = 1 - Math.exp(-m) * (1 + m + m * m / 2); if (q < p) lo = m; else hi = m }
  return (lo + hi) / 2
}
const lastName = (n) => (n || '').replace(/\s+(Jr\.?|Sr\.?|II|III)$/i, '').split(' ').slice(1).join(' ') || n

function teamIn(team, opp, isHome, gm) {
  const lu = luGame(gm.away, gm.home)?.teams?.[team]
  const dressed = new Set((lu?.dressed || []).map((d) => d.playerId))
  let rows = pool.players.filter((p) => p.team === team)
  if (dressed.size >= 18) rows = rows.filter((p) => dressed.has(p.playerId))
  rows = rows.map((p) => ({ p, toi: estimatedToi(p) || 10, pp: ppToiPerGame(p) || 0, w: dressed.size >= 18 ? 1 : dress.get(p.playerId) ?? 0.5 }))
  const F = rows.filter((r) => r.p.position !== 'D').sort((a, b) => b.w * b.toi - a.w * a.toi).slice(0, 12).sort((a, b) => b.toi - a.toi)
  const D = rows.filter((r) => r.p.position === 'D').sort((a, b) => b.w * b.toi - a.w * a.toi).slice(0, 6).sort((a, b) => b.toi - a.toi)
  if (F.length < 12 || D.length < 6) return null
  const lines = [0, 1, 2, 3].map((i) => F.slice(i * 3, i * 3 + 3).map((r) => r.p.playerId))
  const pairs = [0, 1, 2].map((i) => D.slice(i * 2, i * 2 + 2).map((r) => r.p.playerId))
  const ev = (r) => Math.max(1, r.toi - r.pp)
  const lineW = [0, 1, 2, 3].map((i) => F.slice(i * 3, i * 3 + 3).reduce((a, r) => a + ev(r), 0))
  const pairW = [0, 1, 2].map((i) => D.slice(i * 2, i * 2 + 2).reduce((a, r) => a + ev(r), 0))
  const norm = (a) => { const s = a.reduce((x, y) => x + y, 0); return a.map((v) => v / s) }
  const ids = new Set([...F, ...D].map((r) => r.p.playerId))
  const unit = (u) => (u || []).map((x) => x.playerId).filter((id) => ids.has(id))
  let pp1 = unit(lu?.pp1), pp2 = unit(lu?.pp2)
  const byPP = [...F, ...D].sort((a, b) => b.pp - a.pp).map((r) => r.p.playerId)
  if (pp1.length < 4) pp1 = byPP.slice(0, 5)
  if (pp2.length < 4) pp2 = byPP.filter((id) => !pp1.includes(id)).slice(0, 5)
  const pkF = [...F].sort((a, b) => ev(b) - ev(a)).slice(0, 2).map((r) => r.p.playerId)
  const pkD = [...D].sort((a, b) => ev(b) - ev(a)).slice(0, 2).map((r) => r.p.playerId)
  const sk = {}
  const tgt = {}
  for (const r of [...F, ...D]) {
    const g = grades.get(r.p.playerId)?.probs || {}
    const ls = sogMean(g.sog3 ?? 0.15)
    const lg = lam(g.goal ?? 0.08)
    sk[r.p.playerId] = { name: lastName(r.p.name), full: r.p.name, pos: r.p.position, shotW: ls, finish: Math.min(0.3, lg / Math.max(0.2, ls)), astW: lam(g.assist ?? 0.1) + 0.01 }
    tgt[r.p.playerId] = { g: lg, a: lam(g.assist ?? 0.1), sog: ls, probs: { goal: g.goal, assist: g.assist, point: g.point, sog3: g.sog3 } }
  }
  const goalieId = isHome ? gm.homeGoalieId : gm.awayGoalieId
  const goalieName = isHome ? gm.homeGoalie : gm.awayGoalie
  const tm = teamsMeta[team] || {}, om = teamsMeta[opp] || {}
  const sogTarget = ((tm.sogFor || 27.5) + (om.sogAgainst || 27.5)) / 2
  return { team, goalie: { id: goalieId, name: lastName(goalieName) || `${team} goalie`, full: goalieName }, sogRate: sogTarget / 3600, finMult: 1,
    lines, pairs, lineW: norm(lineW), pairW: norm(pairW), pp1, pp2, pk: [...pkF, ...pkD], sk, tgt, sogTarget }
}

function calibrate(game, lamReg) {
  for (let it = 0; it < 6; it++) {
    const res = runMany(game, 300, 5000 + it * 1000, false)
    for (const [t, T] of [[0, game.home], [1, game.away]]) {
      const P = res.players[t]
      // team shots and regulation goals
      const simSog = t ? res.away.sog : res.home.sog
      T.sogRate *= Math.pow(T.sogTarget / Math.max(1, simSog), 0.9)
      T.finMult *= Math.pow(lamReg[t] / Math.max(0.2, res.regMean[t]), 0.9)
      // players: shares of shots / goals / assists, scaled to the team totals the sims produce
      const sumT = (k) => Object.keys(T.sk).reduce((a, id) => a + T.tgt[id][k], 0)
      const sumS = (k) => Object.keys(T.sk).reduce((a, id) => a + (P[id]?.[k] || 0), 0)
      const tS = sumT('sog'), sS = sumS('sog'), tG = sumT('g'), sG = sumS('g'), tA = sumT('a'), sA = sumS('a')
      for (const id of Object.keys(T.sk)) {
        const s = P[id]
        if (!s) continue
        const share = (k, tot, simTot) => Math.pow(Math.max(1e-3, T.tgt[id][k] / tot) / Math.max(1e-3, (s[k] || 0) / Math.max(1e-3, simTot)), 0.8)
        T.sk[id].shotW *= Math.max(0.5, Math.min(2, share('sog', tS, sS)))
        T.sk[id].finish = Math.min(0.35, T.sk[id].finish * Math.max(0.5, Math.min(2, share('g', tG, sG) / Math.max(0.5, Math.min(2, share('sog', tS, sS))))))
        T.sk[id].astW *= Math.max(0.5, Math.min(2, share('a', tA, sA)))
      }
    }
  }
}

const r1 = (v) => Math.round(v * 10) / 10
const r3 = (v) => Math.round(v * 1000) / 1000
const hash = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) % 1000000 }
const now = Date.now()
const index = []
for (const gm of slate) {
  const file = path.join(OUTDIR, `${gm.gameId}.json`)
  if (gm.startTimeUTC && now >= Date.parse(gm.startTimeUTC)) {
    if (fs.existsSync(file)) {
      const old = read(file)
      if (!old.frozen) { old.frozen = true; fs.writeFileSync(file, JSON.stringify(old)) }
      if (old.slateDate === meta.slateDate) index.push(old.indexRow)
    }
    continue
  }
  const home = teamIn(gm.home, gm.away, true, gm), away = teamIn(gm.away, gm.home, false, gm)
  if (!home || !away) { console.log(`${gm.away} @ ${gm.home}: not enough skaters, skipped`); continue }
  const model = projectGame(ratings, { away: gm.away, home: gm.home, awayGoalieId: gm.awayGoalieId, homeGoalieId: gm.homeGoalieId })
  const game = { home, away }
  calibrate(game, [model.xgHome, model.xgAway])
  const res = runMany(game, N, hash(gm.gameId))
  const players = []
  for (const [t, T, side] of [[0, home, 'home'], [1, away, 'away']]) {
    for (const [id, s] of Object.entries(res.players[t])) {
      const k = T.sk[id]
      players.push({ id: +id, side, team: T.team, name: k.full, short: k.name, pos: k.pos, g: r3(s.g), a: r3(s.a), pts: r3(s.pts), sog: r1(s.sog),
        ppg: r3(s.ppg), toi: r1(s.toi / 60), pGoal: r3(s.pGoal), pPoint: r3(s.pPoint), pSog3: r3(s.pSog3), model: T.tgt[id].probs })
    }
  }
  const tg = res.typical
  const indexRow = { gameId: gm.gameId, slateDate: meta.slateDate, startTimeUTC: gm.startTimeUTC, home: gm.home, away: gm.away,
    homeWin: Math.round(model.winHome * 100) / 100, typical: tg.score }
  const out = {
    gameId: gm.gameId, slateDate: meta.slateDate, home: gm.home, away: gm.away, startTimeUTC: gm.startTimeUTC, generated_at: new Date().toISOString(),
    n: N, frozen: false, indexRow,
    goalies: { home: { ...home.goalie, sa: r1(res.goalies[0].sa), ga: r1(res.goalies[0].ga), status: gm.homeGoalieStatus },
      away: { ...away.goalie, sa: r1(res.goalies[1].sa), ga: r1(res.goalies[1].ga), status: gm.awayGoalieStatus } },
    model: { winHome: r3(model.winHome), xgHome: r3(model.xgHome), xgAway: r3(model.xgAway), ot: r3(model.ot) },
    summary: { homeWin: r3(res.homeWin), otRate: r3(res.otRate), home: { mean: r1(res.home.mean), median: res.home.median, p10: res.home.p10, p90: res.home.p90, sog: r1(res.home.sog) },
      away: { mean: r1(res.away.mean), median: res.away.median, p10: res.away.p10, p90: res.away.p90, sog: r1(res.away.sog) }, medTotal: res.medTotal },
    lines: { home: { lines: home.lines, pairs: home.pairs, pp1: home.pp1, pp2: home.pp2 }, away: { lines: away.lines, pairs: away.pairs, pp1: away.pp1, pp2: away.pp2 } },
    players, typical: { index: res.typicalIndex, score: tg.score, ot: tg.ot, plays: tg.log },
  }
  fs.writeFileSync(file, JSON.stringify(out))
  index.push(indexRow)
  const top = (T, t) => Object.keys(T.sk).sort((a, b) => T.tgt[b].sog - T.tgt[a].sog).slice(0, 2)
    .map((id) => `${T.sk[id].name} g ${r3(res.players[t][id].g)}/${r3(T.tgt[id].g)} sog ${r1(res.players[t][id].sog)}/${r1(T.tgt[id].sog)}`).join(', ')
  console.log(`${gm.away} @ ${gm.home}: reg goals ${r1(res.regMean[1])}/${r1(model.xgAway)}-${r1(res.regMean[0])}/${r1(model.xgHome)}, sog ${r1(res.away.sog)}-${r1(res.home.sog)}, ${gm.home} wins sim ${Math.round(100 * res.homeWin)}% model ${Math.round(100 * model.winHome)}%, OT ${Math.round(100 * res.otRate)}% (model ${Math.round(100 * model.ot)}%), typical ${tg.score[1]}-${tg.score[0]} (${tg.log.length} events) | ${top(home, 0)} | ${top(away, 1)}`)
}
fs.writeFileSync(path.join(OUTDIR, 'index.json'), JSON.stringify({ slateDate: meta.slateDate, generated_at: new Date().toISOString(), games: index }))
console.log(`sims: ${index.length} games, ${meta.slateDate}`)
