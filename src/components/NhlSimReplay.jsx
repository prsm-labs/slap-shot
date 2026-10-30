import { useCallback, useMemo } from 'react'
import SimShell from './SimShell.jsx'
import { wpHome } from '../sim/nhlSim.js'

// 🏒 Game Sim replay (2026-10-29): the most typical of tonight's 10,000 simulated games (public/data/sims/<gameId>.json, built by
// scripts/build_game_sims.mjs), shot by shot on a tilted rink like RotoBot's. Home attacks right in the 1st and 3rd, left in the 2nd.
// The skater dots are stock positions around the shot (not real tracking); the shooter, shots, saves, goals, assists, penalties and
// the empty net are the sim's.

export const NHL_TEAMS = {
  ANA: ['Ducks', '#F47A38'], BOS: ['Bruins', '#FFB81C'], BUF: ['Sabres', '#2A5BC7'], CGY: ['Flames', '#C8102E'], CAR: ['Hurricanes', '#CE1126'],
  CHI: ['Blackhawks', '#CF0A2C'], COL: ['Avalanche', '#8C2B4F'], CBJ: ['Blue Jackets', '#2E5AA8'], DAL: ['Stars', '#00845C'], DET: ['Red Wings', '#CE1126'],
  EDM: ['Oilers', '#FF4C00'], FLA: ['Panthers', '#C8102E'], LAK: ['Kings', '#A2AAAD'], MIN: ['Wild', '#2E8B57'], MTL: ['Canadiens', '#AF1E2D'],
  NSH: ['Predators', '#FFB81C'], NJD: ['Devils', '#CE1126'], NYI: ['Islanders', '#F47D30'], NYR: ['Rangers', '#2F5DC2'], OTT: ['Senators', '#C52032'],
  PHI: ['Flyers', '#F74902'], PIT: ['Penguins', '#FCB514'], SJS: ['Sharks', '#00A3B4'], SEA: ['Kraken', '#68A2B9'], STL: ['Blues', '#2F6ED1'],
  TBL: ['Lightning', '#2A62C9'], TOR: ['Maple Leafs', '#2A5BC7'], UTA: ['Mammoth', '#6CACE4'], VAN: ['Canucks', '#2A6BC7'], VGK: ['Golden Knights', '#B4975A'],
  WSH: ['Capitals', '#C8102E'], WPG: ['Jets', '#3D6AC4'],
}
const logo = (t) => `https://assets.nhle.com/logos/nhl/svg/${t}_dark.svg`
const W = 200, H = 85
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
const PL = (q) => (q > 3 ? 'OT' : `P${q}`)
const clockTxt = (q, c) => `${PL(q)} ${Math.floor(c / 60)}:${String(c % 60).padStart(2, '0')}`
const homeRight = (q) => q % 2 === 1
const CHIP = { shot: 'SHOT ON GOAL', goal: 'GOAL', pen: 'PENALTY', ppend: 'FULL STRENGTH', pull: 'EMPTY NET', faceoff: 'FACEOFF', period: 'INTERMISSION',
  so: 'SHOOTOUT', final: 'FINAL' }

export function buildNhlFrames(sim) {
  const plays = sim.typical.plays
  const ot = sim.typical.ot
  const total = 3600 + (ot ? 300 : 0)
  const el = (q, c) => (q <= 3 ? (q - 1) * 1200 + (1200 - c) : 3600 + (300 - c))
  const lh = sim.model.xgHome, la = sim.model.xgAway
  return plays.map((p, i) => {
    const e = el(p.q, p.c)
    const left = Math.max(0, 1 - e / 3600)
    const wp = p.t === 'final' ? (p.s[0] > p.s[1] ? 1 : 0) : p.q > 3 ? (p.s[0] === p.s[1] ? lh / (lh + la) : p.s[0] > p.s[1] ? 1 : 0) : wpHome(p.s[0], p.s[1], left, lh, la)
    const dur = p.t === 'goal' ? 1700 : p.t === 'shot' ? 1100 : 750
    return { i, play: p, poss: p.o === 0 ? 'home' : p.o === 1 ? 'away' : null, score: p.s, wp, clock: clockTxt(p.q, p.c),
      chip: CHIP[p.t] || '', text: p.x, dur, scoring: !!p.sc, t: e / total, period: p.q }
  })
}

function Rink({ idx, t, frames, teams, names }) {
  const f = frames[idx]
  if (!f) return null
  const p = f.play
  const side = p.o
  const right = side == null ? true : side === 0 ? homeRight(p.q) : !homeRight(p.q)
  const fx = (x, y) => (right ? [x, y] : [W - x, H - y])
  const offC = side === 0 ? teams.home.color : teams.away.color
  const defC = side === 0 ? teams.away.color : teams.home.color
  const net = [189, 42.5]
  let off = [[150, 25], [150, 60], [170, 30], [172, 58], [128, 42]]
  let de = [[160, 32], [160, 54], [178, 38], [178, 48], [140, 42]]
  let puck = { x: 100, y: 42.5 }
  let label = null
  let lamp = false
  if (p.t === 'shot' || p.t === 'goal') {
    // a shot spot from the event index (stable per event)
    const sx = 140 + ((p.c * 7 + f.i * 13) % 42), sy = 18 + ((p.c * 11 + f.i * 5) % 50)
    const k = (f.i % 4) + 1
    const e1 = ease(Math.min(1, t / 0.4))
    off[k] = [off[k][0] + (sx - off[k][0]) * e1, off[k][1] + (sy - off[k][1]) * e1]
    if (t < 0.4) puck = { x: off[0][0] + (off[k][0] - off[0][0]) * e1, y: off[0][1] + (off[k][1] - off[0][1]) * e1 }
    else {
      const e2 = Math.min(1, (t - 0.4) / 0.25)
      const end = p.t === 'goal' ? [net[0] + 1.5, net[1] + ((f.i % 3) - 1) * 1.5] : [net[0] - 2, net[1] + ((f.i % 2) ? 3 : -3)]
      puck = { x: sx + (end[0] - sx) * e2, y: sy + (end[1] - sy) * e2 }
      if (p.t === 'goal' && t > 0.65) lamp = true
    }
    label = { x: off[k][0], y: off[k][1], id: p.p }
  } else if (p.t === 'faceoff' || p.t === 'period' || p.t === 'final' || p.t === 'so') {
    off = [[97, 42.5], [92, 30], [92, 55], [80, 30], [80, 55]]
    de = [[103, 42.5], [108, 30], [108, 55], [120, 30], [120, 55]]
    puck = { x: 100, y: 42.5 }
  } else {
    puck = { x: 120, y: 42.5 }
  }
  const goalieOff = [11, 42.5], goalieDef = [187, 42.5]
  const C = (x, y) => fx(x, y)
  const [px, py] = C(puck.x, puck.y)
  const lb = label ? C(label.x, label.y) : null
  const [nx, ny] = C(net[0], net[1])
  const showGoalieDef = !(p.en && p.t === 'goal')
  return (
    <div className="nhs-wrap">
      <svg viewBox={`-3 -3 ${W + 6} ${H + 6}`} className="nhs-rink" role="img" aria-label="Simulated shift">
        <defs>
          <linearGradient id="nhsIce" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#eef4f8" /><stop offset="1" stopColor="#d9e4ec" /></linearGradient>
        </defs>
        <rect x={-3} y={-3} width={W + 6} height={H + 6} rx={30} fill="#1c2733" />
        <rect x={0} y={0} width={W} height={H} rx={28} fill="url(#nhsIce)" stroke="#9fb0bf" strokeWidth=".6" />
        <line x1={11} x2={11} y1={2} y2={H - 2} stroke="#d3343f" strokeWidth=".5" />
        <line x1={W - 11} x2={W - 11} y1={2} y2={H - 2} stroke="#d3343f" strokeWidth=".5" />
        <rect x={74} y={0} width={1.4} height={H} fill="#2f6fd1" />
        <rect x={124.6} y={0} width={1.4} height={H} fill="#2f6fd1" />
        <rect x={99.4} y={0} width={1.2} height={H} fill="#d3343f" />
        <circle cx={100} cy={42.5} r={15} fill="none" stroke="#2f6fd1" strokeWidth=".4" />
        {[[31, 20.5], [31, 64.5], [169, 20.5], [169, 64.5]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r={15} fill="none" stroke="#d3343f" strokeWidth=".35" />)}
        <path d="M 11 38.5 A 6 6 0 0 1 11 46.5" fill="rgba(47,111,209,.25)" stroke="#d3343f" strokeWidth=".3" transform="translate(0,0)" />
        <path d={`M ${W - 11} 38.5 A 6 6 0 0 0 ${W - 11} 46.5`} fill="rgba(47,111,209,.25)" stroke="#d3343f" strokeWidth=".3" />
        <rect x={7.5} y={39.5} width={3.5} height={6} fill="none" stroke="#d3343f" strokeWidth=".5" />
        <rect x={W - 11} y={39.5} width={3.5} height={6} fill="none" stroke="#d3343f" strokeWidth=".5" />
        <text x={100} y={44.8} textAnchor="middle" fontSize="6" fontWeight="900" fill="rgba(20,40,70,.12)">{teams.home.abbr}</text>
        {lamp && <circle cx={nx} cy={ny} r={9} fill="rgba(255,60,60,.35)"><animate attributeName="r" values="5;12;5" dur=".6s" repeatCount="indefinite" /></circle>}
        {side != null && (() => { const [gx, gy] = C(...goalieOff); return <rect x={gx - 1.6} y={gy - 2.4} width={3.2} height={4.8} rx={1} fill={offC} stroke="#0b0f14" strokeWidth=".3" /> })()}
        {side != null && showGoalieDef && (() => { const [gx, gy] = C(...goalieDef); return <rect x={gx - 1.6} y={gy - 2.4} width={3.2} height={4.8} rx={1} fill={defC} stroke="#0b0f14" strokeWidth=".3" /> })()}
        {de.map(([x, y], k) => { const [cx, cy] = C(x, y); return <circle key={`d${k}`} cx={cx} cy={cy} r={2.1} fill={defC} stroke="#0b0f14" strokeWidth=".35" /> })}
        {off.map(([x, y], k) => { const [cx, cy] = C(x, y); return <circle key={`o${k}`} cx={cx} cy={cy} r={2.1} fill={offC} stroke="#fff" strokeWidth=".35" /> })}
        <circle cx={px} cy={py} r={1.05} fill="#0b0b0b" stroke="#fff" strokeWidth=".2" />
        {lamp && <text x={nx} y={ny - 10} textAnchor="middle" fontSize="7" fontWeight="900" fill="#d3343f">GOAL!</text>}
        {lb && names[label.id] && (
          <g>
            <rect x={lb[0] - 13} y={lb[1] - 10} width={26} height={6} rx={3} fill="rgba(10,14,20,.88)" stroke="rgba(255,255,255,.5)" strokeWidth=".2" />
            <text x={lb[0]} y={lb[1] - 5.8} textAnchor="middle" fontSize="3.8" fontWeight="800" fill="#fff">{names[label.id]}</text>
          </g>
        )}
      </svg>
    </div>
  )
}

export default function NhlSimReplay({ sim }) {
  const frames = useMemo(() => buildNhlFrames(sim), [sim])
  const names = useMemo(() => Object.fromEntries(sim.players.map((p) => [p.id, p.short])), [sim])
  const sideOf = useMemo(() => Object.fromEntries(sim.players.map((p) => [p.id, p.side])), [sim])
  const teams = useMemo(() => ({
    away: { abbr: sim.away, name: NHL_TEAMS[sim.away]?.[0] || sim.away, color: NHL_TEAMS[sim.away]?.[1] || '#888', logo: logo(sim.away) },
    home: { abbr: sim.home, name: NHL_TEAMS[sim.home]?.[0] || sim.home, color: NHL_TEAMS[sim.home]?.[1] || '#888', logo: logo(sim.home) },
  }), [sim])
  const Surface = useCallback((props) => <Rink {...props} teams={teams} names={names} />, [teams, names])
  const panels = useCallback((done) => {
    const acc = {}
    const team = { home: { sog: 0, pp: 0, ppg: 0 }, away: { sog: 0, pp: 0, ppg: 0 } }
    const P = (id) => (acc[id] ||= { g: 0, a: 0, sog: 0 })
    for (let i = 0; i <= done; i++) {
      const p = frames[i].play
      const s = p.o === 0 ? 'home' : 'away'
      if (p.t === 'shot' || p.t === 'goal') { P(p.p).sog++; team[s].sog++ }
      if (p.t === 'goal') { P(p.p).g++; if (p.a1) P(p.a1).a++; if (p.a2) P(p.a2).a++; if (p.pp) team[s].ppg++ }
      if (p.t === 'pen') team[p.o === 0 ? 'away' : 'home'].pp++
    }
    const out = {}
    for (const side of ['away', 'home']) {
      const rows = Object.entries(acc).filter(([id]) => sideOf[id] === side)
      const pts = rows.filter(([, s]) => s.g + s.a > 0).sort((a, b) => (b[1].g * 2 + b[1].a) - (a[1].g * 2 + a[1].a)).slice(0, 5)
      const shots = rows.sort((a, b) => b[1].sog - a[1].sog).slice(0, 3)
      const tm = team[side]
      const g = sim.goalies[side]
      out[side] = [
        { title: 'Scoring', rows: pts.map(([id, s]) => [names[id], `${s.g ? `${s.g} G` : ''}${s.g && s.a ? ' · ' : ''}${s.a ? `${s.a} A` : ''}`]) },
        { title: 'Shots', rows: shots.map(([id, s]) => [names[id], `${s.sog} SOG`]) },
        { title: 'Team', rows: [['Shots on goal', tm.sog], ['Power play', `${tm.ppg}/${tm.pp}`], ['Goalie', g?.name || '—']] },
      ]
    }
    return out
  }, [frames, names, sideOf, sim])
  const periods = useMemo(() => {
    const total = 3600 + (sim.typical.ot ? 300 : 0)
    return [1200, 2400, ...(total > 3600 ? [3600] : [])].map((s) => s / total)
  }, [sim])
  return (
    <SimShell teams={teams} frames={frames} Surface={Surface} panels={panels} periods={periods}
      footnote={`Simulated game, not a prediction · sim ${(sim.typical.index + 1).toLocaleString()} of ${sim.n.toLocaleString()}`} />
  )
}
