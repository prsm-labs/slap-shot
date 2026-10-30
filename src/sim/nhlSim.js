// Shift-by-shift NHL game simulator (Slap Shot Game Sim, 2026-10-29). Each sim: forward lines and defence pairs rotate by their
// usual ice time, minor penalties put the PP units on (and the PK on the other side), shots on goal come at each team's rate at that
// strength, the shooter is drawn by on-ice shot rates, goals by his finishing and the goalie, assists from his linemates; the trailing
// team pulls its goalie late; ties go to 3-on-3 overtime and a shootout. Per-player and per-team weights are calibrated
// (scripts/build_game_sims.mjs) so the 10,000-game averages match Slap Shot's own backtested game model and skater chances.
// Shared by the app and Node.

export function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function pickW(arr, wf, r) {
  let tot = 0
  for (const x of arr) tot += wf(x)
  let u = r() * tot
  for (const x of arr) { u -= wf(x); if (u <= 0) return x }
  return arr[arr.length - 1]
}
const TICK = 5
const PEN_RATE = 3.1 / 3600 // minors per team per second (league ~3.1 a game)

/**
 * game: { home: TeamIn, away: TeamIn }
 * TeamIn: { team, goalie: {id, name}, sogRate (SOG / sec at 5v5 vs this opponent), finMult (team finishing x the other goalie, set by calibration),
 *   lines: [[id,id,id] x4], pairs: [[id,id] x3], lineW: [4], pairW: [3], pp1: [ids], pp2: [ids], pk: [ids],
 *   sk: { id: { name, shotW, finish, astW } } }
 */
export function simulateGame(game, r, wantLog = false) {
  const T = [game.home, game.away]
  const st = T.map((t) => Object.fromEntries(Object.keys(t.sk).map((id) => [id, { g: 0, a: 0, sog: 0, ppg: 0, toi: 0 }])))
  const gl = [{ sa: 0, ga: 0 }, { sa: 0, ga: 0 }]
  const score = [0, 0]
  const log = wantLog ? [] : null
  let per = 1, clock = 1200
  const pen = [0, 0] // seconds left in a minor against each team
  const pulled = [false, false]
  const line = [0, 0], pair = [0, 0]
  const lineLeft = [0, 0], pairLeft = [0, 0]
  const lineUsed = T.map(() => [0, 0, 0, 0]), pairUsed = T.map(() => [0, 0, 0])
  const sog = [0, 0]
  const push = (o) => { if (log) log.push({ q: per, c: Math.max(0, Math.round(clock)), s: [score[0], score[1]], sog: [sog[0], sog[1]], ...o }) }
  if (log) push({ t: 'faceoff', x: 'Puck drop' })

  const nextLine = (t) => {
    const w = T[t].lineW
    let best = 0, bd = -1e9
    for (let i = 0; i < 4; i++) { const d = w[i] - lineUsed[t][i] / Math.max(1, lineUsed[t].reduce((a, b) => a + b, 0)) + (i === line[t] ? -0.3 : 0) + (r() - 0.5) * 0.05; if (d > bd) { bd = d; best = i } }
    line[t] = best; lineLeft[t] = 35 + r() * 25
  }
  const nextPair = (t) => {
    const w = T[t].pairW
    let best = 0, bd = -1e9
    for (let i = 0; i < 3; i++) { const d = w[i] - pairUsed[t][i] / Math.max(1, pairUsed[t].reduce((a, b) => a + b, 0)) + (i === pair[t] ? -0.3 : 0) + (r() - 0.5) * 0.05; if (d > bd) { bd = d; best = i } }
    pair[t] = best; pairLeft[t] = 40 + r() * 25
  }
  for (const t of [0, 1]) { nextLine(t); nextPair(t) }

  // who's on the ice for team t right now (skater ids), and the strength factor for its shots
  const onIce = (t) => {
    const o = 1 - t
    if (pen[t] > 0 && pen[o] <= 0) return T[t].pk.length >= 4 ? T[t].pk.slice(0, 4) : [...T[t].lines[line[t]].slice(0, 2), ...T[t].pairs[pair[t]]]
    if (pen[o] > 0 && pen[t] <= 0) { const u = pen[o] > 50 ? T[t].pp1 : T[t].pp2; if (u.length >= 4) return u.slice(0, 5) }
    if (per === 4) return [...T[t].lines[line[t]].slice(0, 2), T[t].pairs[pair[t]][0]]
    const s = [...T[t].lines[line[t]], ...T[t].pairs[pair[t]]]
    if (!pulled[t]) return s
    const extra = [...T[t].lines[0], ...T[t].lines[1]].find((id) => !s.includes(id))
    return extra ? [...s, extra] : s
  }
  const strength = (t) => {
    const o = 1 - t
    let f = 1
    if (pen[o] > 0 && pen[t] <= 0) f = 2.05
    else if (pen[t] > 0 && pen[o] <= 0) f = 0.38
    if (per === 4) f *= 1.25
    if (pulled[t]) f *= 1.45
    return f
  }
  const finishMult = (t) => {
    const o = 1 - t
    if (pen[o] > 0 && pen[t] <= 0) return 1.25
    if (per === 4) return 1.15
    return 1
  }

  let reg = null // regulation score
  let guard = 0
  while (guard++ < 5000) {
    if (clock <= 0) {
      if (per === 3 && !reg) reg = [score[0], score[1]]
      if (per < 3 || (per === 3 && score[0] === score[1])) {
        if (log) push({ t: 'period', x: per < 3 ? `End of the ${['1st', '2nd'][per - 1]} period` : `End of regulation -- tied ${score[0]}-${score[1]}` })
        per++
        clock = per === 4 ? 300 : 1200
        pulled[0] = pulled[1] = false
        for (const t of [0, 1]) { nextLine(t); nextPair(t) }
        if (log) push({ t: 'faceoff', x: per === 4 ? '3-on-3 overtime' : `Start of the ${per === 2 ? '2nd' : '3rd'} period` })
        continue
      }
      if (per === 4 && score[0] === score[1]) {
        // shootout: 3 rounds, then sudden death
        let a = 0, h = 0, rounds = 0
        while (rounds < 3 || a === h) { if (r() < 0.31) h++; if (r() < 0.31) a++; rounds++; if (rounds > 20) break }
        const w = h > a ? 0 : h < a ? 1 : (r() < 0.5 ? 0 : 1)
        score[w]++
        if (log) push({ t: 'so', o: w, x: `${T[w].team} wins the shootout`, sc: 1, so: true })
      }
      break
    }
    // goalie pull: trailing by 1-2 late in the 3rd
    if (per === 3) for (const t of [0, 1]) {
      const d = score[1 - t] - score[t]
      const want = (d === 1 && clock <= 105) || (d === 2 && clock <= 170)
      if (want && !pulled[t]) { pulled[t] = true; if (log) push({ t: 'pull', o: t, x: `${T[t].team} pulls ${T[t].goalie.name} for an extra attacker` }) }
      if (!want && pulled[t]) pulled[t] = false
    }
    const dt = Math.min(TICK, clock)
    for (const t of [0, 1]) {
      const ids = onIce(t)
      for (const id of ids) if (st[t][id]) st[t][id].toi += dt
      lineLeft[t] -= dt; pairLeft[t] -= dt
      lineUsed[t][line[t]] += dt; pairUsed[t][pair[t]] += dt
      if (lineLeft[t] <= 0) nextLine(t)
      if (pairLeft[t] <= 0) nextPair(t)
    }
    clock -= dt
    for (const t of [0, 1]) if (pen[t] > 0) { pen[t] -= dt; if (pen[t] <= 0 && log) push({ t: 'ppend', o: 1 - t, x: `${T[t].team} back at full strength` }) }
    // penalties
    for (const t of [0, 1]) {
      if (pen[t] <= 0 && per <= 3 && r() < PEN_RATE * dt) {
        pen[t] = 120
        const ids = onIce(t)
        const who = T[t].sk[ids[Math.floor(r() * ids.length)]]
        if (log) push({ t: 'pen', o: t, p: ids[0], x: `${who?.name || T[t].team} -- 2 minutes. ${T[1 - t].team} power play` })
      }
    }
    // shots
    for (const t of [0, 1]) {
      const o = 1 - t
      const rate = T[t].sogRate * strength(t) * dt
      if (r() >= rate) continue
      const ids = onIce(t).filter((id) => T[t].sk[id])
      if (!ids.length) continue
      const shooter = pickW(ids, (id) => T[t].sk[id].shotW, r)
      const S = T[t].sk[shooter]
      st[t][shooter].sog++
      sog[t]++
      const empty = pulled[o]
      const pGoal = empty ? 0.72 : Math.min(0.6, S.finish * finishMult(t) * T[t].finMult)
      if (r() < pGoal) {
        score[t]++
        st[t][shooter].g++
        const pp = pen[o] > 0 && pen[t] <= 0
        if (pp) st[t][shooter].ppg++
        const mates = ids.filter((id) => id !== shooter)
        let a1 = null, a2 = null
        if (mates.length && r() < 0.88) { a1 = pickW(mates, (id) => T[t].sk[id].astW, r); st[t][a1].a++ }
        const rest = mates.filter((id) => id !== a1)
        if (a1 && rest.length && r() < 0.72) { a2 = pickW(rest, (id) => T[t].sk[id].astW, r); st[t][a2].a++ }
        if (!empty) { gl[o].sa++; gl[o].ga++ }
        if (pp) pen[o] = 0 // a power-play goal ends the minor
        push({ t: 'goal', o: t, p: shooter, a1, a2, pp, en: empty, sc: 1,
          x: `GOAL ${T[t].team} -- ${S.name}${empty ? ' into the empty net' : ''}${pp ? ' on the power play' : ''}${a1 ? ` (${T[t].sk[a1].name}${a2 ? `, ${T[t].sk[a2].name}` : ''})` : ' (unassisted)'}` })
        if (per === 4) { clock = 0; break }
        if (pulled[t]) pulled[t] = false
        for (const k of [0, 1]) { nextLine(k); nextPair(k) }
      } else {
        if (!empty) gl[o].sa++
        push({ t: 'shot', o: t, p: shooter, x: `${S.name} shot on goal -- ${empty ? 'just wide of the empty net' : `saved by ${T[o].goalie.name}`}` })
      }
    }
  }
  if (log) push({ t: 'final', x: `Final${per >= 4 ? (score[0] + score[1] && log.some((e) => e.so) ? '/SO' : '/OT') : ''}: ${T[1].team} ${score[1]}, ${T[0].team} ${score[0]}` })
  return { score, reg: reg || [score[0], score[1]], stats: st, goalies: gl, log, ot: per >= 4, sog }
}

export function runMany(game, n, seed0 = 1, withTypical = true) {
  const K = ['g', 'a', 'sog', 'ppg', 'toi']
  const sums = [{}, {}]
  const anyG = [{}, {}], anyP = [{}, {}], sog3 = [{}, {}]
  const gls = [{ sa: 0, ga: 0 }, { sa: 0, ga: 0 }]
  const H = new Int16Array(n), A = new Int16Array(n)
  let regH = 0, regA = 0
  const SH = new Int16Array(n), SA = new Int16Array(n)
  let hw = 0, ot = 0, regTie = 0
  const topIds = [0, 1].map((t) => { const sk = (t ? game.away : game.home).sk; return Object.keys(sk).sort((a, b) => sk[b].shotW - sk[a].shotW).slice(0, 2) })
  const keyS = []
  for (let i = 0; i < n; i++) {
    const g = simulateGame(game, rng(seed0 + i), false)
    H[i] = g.score[0]; A[i] = g.score[1]; SH[i] = g.sog[0]; SA[i] = g.sog[1]
    regH += g.reg[0]; regA += g.reg[1]
    if (g.score[0] > g.score[1]) hw++
    if (g.ot) ot++
    for (const t of [0, 1]) {
      gls[t].sa += g.goalies[t].sa; gls[t].ga += g.goalies[t].ga
      for (const [id, s] of Object.entries(g.stats[t])) {
        const o = (sums[t][id] ||= { g: 0, a: 0, sog: 0, ppg: 0, toi: 0 })
        for (const k of K) o[k] += s[k]
        if (s.g) anyG[t][id] = (anyG[t][id] || 0) + 1
        if (s.g + s.a) anyP[t][id] = (anyP[t][id] || 0) + 1
        if (s.sog >= 3) sog3[t][id] = (sog3[t][id] || 0) + 1
      }
    }
    keyS.push([...topIds[0].map((id) => g.stats[0][id]?.sog || 0), ...topIds[1].map((id) => g.stats[1][id]?.sog || 0)])
  }
  void regTie
  const mean = (a) => { let s = 0; for (const v of a) s += v; return s / a.length }
  const med = (a) => { const s = Array.from(a).sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
  const pct = (a, q) => { const s = Array.from(a).sort((x, y) => x - y); return s[Math.floor(q * (s.length - 1))] }
  const players = [0, 1].map((t) => Object.fromEntries(Object.entries(sums[t]).map(([id, o]) => [id, {
    g: o.g / n, a: o.a / n, pts: (o.g + o.a) / n, sog: o.sog / n, ppg: o.ppg / n, toi: o.toi / n,
    pGoal: (anyG[t][id] || 0) / n, pPoint: (anyP[t][id] || 0) / n, pSog3: (sog3[t][id] || 0) / n }])))
  const out = { n, homeWin: hw / n, otRate: ot / n, players, regMean: [regH / n, regA / n],
    home: { mean: mean(H), median: med(H), p10: pct(H, 0.1), p90: pct(H, 0.9), sog: mean(SH) },
    away: { mean: mean(A), median: med(A), p10: pct(A, 0.1), p90: pct(A, 0.9), sog: mean(SA) },
    goalies: [{ sa: gls[0].sa / n, ga: gls[0].ga / n }, { sa: gls[1].sa / n, ga: gls[1].ga / n }] }
  out.medTotal = med(Array.from(H, (h, i) => h + A[i]))
  if (!withTypical) return out
  const favHome = hw >= n / 2
  const ks = keyS[0].map((_, j) => mean(keyS.map((k) => k[j])))
  let best = 0, bd = Infinity
  for (let i = 0; i < n; i++) {
    if ((H[i] > A[i]) !== favHome) continue
    let d = Math.abs(H[i] - out.home.mean) + Math.abs(A[i] - out.away.mean) + Math.abs(SH[i] - out.home.sog) / 6 + Math.abs(SA[i] - out.away.sog) / 6
    for (let j = 0; j < ks.length; j++) d += Math.abs(keyS[i][j] - ks[j]) / 4
    if (d < bd) { bd = d; best = i }
  }
  out.typicalIndex = best
  out.typical = simulateGame(game, rng(seed0 + best), true)
  return out
}

// win probability from a live score: the rest of regulation's goals ~ Poisson at each team's rate; ties split by goal share
export function wpHome(scoreH, scoreA, fracLeft, lamH, lamA) {
  if (fracLeft <= 0) return scoreH > scoreA ? 1 : scoreH < scoreA ? 0 : lamH / (lamH + lamA)
  const pm = (l) => { const o = [Math.exp(-l)]; for (let k = 1; k <= 12; k++) o.push((o[k - 1] * l) / k); return o }
  const ph = pm(lamH * fracLeft), pa = pm(lamA * fracLeft)
  let win = 0, tie = 0
  for (let i = 0; i <= 12; i++) for (let j = 0; j <= 12; j++) {
    const d = scoreH + i - (scoreA + j)
    const p = ph[i] * pa[j]
    if (d > 0) win += p; else if (d === 0) tie += p
  }
  return win + tie * (lamH / (lamH + lamA))
}
