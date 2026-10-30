import { useEffect, useState } from 'react'
import { useMatchup, keysOf } from '../lib/matchupFilter.js'
import { openSkaterSlide } from '../slideouts.js'
import { useScoredPool } from '../lib/data.js'
import NhlSimReplay, { NHL_TEAMS } from '../components/NhlSimReplay.jsx'
import '../components/NhlSimReplay.css'

// 🎬 Game Sim (2026-10-29, user: RotoBot-style "we simulated this game 10,000 times" replays, same as CourtIQ / Six Points). Tonight's
// games, each played 10,000 times shift by shift (scripts/build_game_sims.mjs + src/sim/nhlSim.js), tuned to Slap Shot's own game model
// and skater chances: the most typical game as a replay, then the 10,000-game averages.
const f1 = (v) => (v == null ? '—' : (Math.round(v * 10) / 10).toFixed(1))
const f2 = (v) => (v == null ? '—' : (Math.round(v * 100) / 100).toFixed(2))
const pc = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`)
const logo = (t) => `https://assets.nhle.com/logos/nhl/svg/${t}_dark.svg`

function Box({ sim, side, pool }) {
  const tri = side === 'home' ? sim.home : sim.away
  const rows = sim.players.filter((p) => p.side === side).sort((a, b) => b.toi - a.toi)
  const g = sim.goalies[side]
  const open = (id) => { const p = pool?.find((x) => x.playerId === id); if (p) openSkaterSlide(p) }
  return (
    <div className="nhs-box" style={{ '--tc': NHL_TEAMS[tri]?.[1] || 'var(--accent)' }}>
      <div className="nhs-box-h"><img src={logo(tri)} alt="" width={22} height={22} /><b>{NHL_TEAMS[tri]?.[0] || tri}</b>
        <span className="meta-line small">avg {f1(sim.summary[side].mean)} goals · {f1(sim.summary[side].sog)} shots</span></div>
      <div className="table-wrap">
        <table className="nhs-t">
          <thead><tr><th className="sticky-col">Skater</th><th>TOI</th><th>G</th><th>A</th><th>PTS</th><th>SOG</th><th>Goal %</th><th>Point %</th><th>3+ SOG</th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td className="sticky-col"><span className="link" onClick={() => open(p.id)}>{p.name}</span> <span className="meta-line small">{p.pos}</span></td>
                <td>{f1(p.toi)}</td><td>{f2(p.g)}</td><td>{f2(p.a)}</td><td>{f2(p.pts)}</td><td><b>{f1(p.sog)}</b></td>
                <td>{pc(p.pGoal)}</td><td>{pc(p.pPoint)}</td><td>{pc(p.pSog3)}</td>
              </tr>
            ))}
            <tr className="nhs-tot"><td className="sticky-col">🥅 {g.full || g.name}{g.status ? ` (${g.status})` : ''}</td><td colSpan={8}>
              {f1(g.sa)} shots against · {f1(g.ga)} goals against · {g.sa ? (1 - g.ga / g.sa).toFixed(3) : '—'} save %</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function GameSimTab() {
  const players = useScoredPool({ includeStarted: true })?.players
  const [index, setIndex] = useState(null)
  const [err, setErr] = useState(null)
  const [gid, setGid] = useState(null)
  const [sim, setSim] = useState(null)
  const sel = useMatchup()
  const picked = keysOf(sel)

  useEffect(() => {
    fetch('/data/sims/index.json', { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json() })
      .then(setIndex).catch((e) => setErr(String(e.message || e)))
  }, [])
  const games = index?.games || []
  useEffect(() => {
    if (!games.length) return
    const want = games.find((g) => picked.includes(`${g.away}@${g.home}`))
    if (want) setGid(want.gameId)
    else if (!gid || !games.some((g) => g.gameId === gid)) setGid(games[0].gameId)
  }, [games, picked.join(',')])
  useEffect(() => {
    if (!gid) return
    fetch(`/data/sims/${gid}.json`, { cache: 'no-cache' }).then((r) => r.json()).then(setSim).catch((e) => setErr(String(e.message || e)))
  }, [gid])

  const hw = sim?.model.winHome
  const fav = sim ? (hw >= 0.5 ? sim.home : sim.away) : null
  return (
    <div>
      <p className="note">Every game tonight is played 10,000 times, shift by shift: forward lines and defence pairs take turns by their usual ice
        time, minor penalties bring on the power-play units and the penalty kill, shots on goal come at each team's rate at that strength, the
        shooter is drawn from the skaters on the ice, goals depend on his finishing and the goalie, assists go to his linemates, the trailing
        team pulls its goalie late, and ties go to 3-on-3 overtime and a shootout. It's tuned so the 10,000-game averages match Slap Shot's own
        numbers -- each team's goals from the backtested game model (the win % shown is that model's), each skater's goals, assists and shots
        from his grade-model chances -- so the sim adds the game itself, not new picks. The replay is the most typical of the 10,000 games: the
        winner most of them pick, closest to the average score and the top shooters' usual shots. Simulated games, not predictions; each game
        locks at puck drop.</p>
      {err && !index && <p className="empty-state">No simulations yet ({err}).</p>}
      {index && !games.length && <p className="empty-state">No simulations for tonight yet -- they're built with the slate and lock at each puck drop.</p>}
      <div className="nhs-games">
        {games.map((g) => {
          const fv = g.homeWin >= 0.5 ? g.home : g.away
          return (
            <button key={g.gameId} className={`nhs-game${gid === g.gameId ? ' active' : ''}`} onClick={() => setGid(g.gameId)}>
              <span className="nhs-game-t"><img src={logo(g.away)} alt="" width={16} height={16} />{g.away} @ {g.home}<img src={logo(g.home)} alt="" width={16} height={16} /></span>
              <span className="meta-line small">{fv} {Math.round(100 * Math.max(g.homeWin, 1 - g.homeWin))}% · typ. {g.typical[1]}-{g.typical[0]}</span>
            </button>
          )
        })}
      </div>
      {sim && (
        <>
          <div className="slate-status nhs-sum">
            <span><b>10,000 games:</b> {sim.away} {f1(sim.summary.away.mean)} @ {sim.home} {f1(sim.summary.home.mean)} goals on average · shots
              {' '}{f1(sim.summary.away.sog)}-{f1(sim.summary.home.sog)} · {Math.round(100 * sim.summary.otRate)}% reach overtime</span>
            <span>Game model: {fav} wins {Math.round(100 * Math.max(hw, 1 - hw))}% (the sims: {Math.round(100 * Math.max(sim.summary.homeWin, 1 - sim.summary.homeWin))}%)
              · goalies {sim.goalies.away.full || sim.goalies.away.name} vs {sim.goalies.home.full || sim.goalies.home.name}</span>
            {sim.frozen && <span>🔒 Locked at puck drop -- this is the pre-game simulation.</span>}
          </div>
          <NhlSimReplay sim={sim} />
          <h3 className="nhs-h">📊 10,000-game box score (averages)</h3>
          <div className="nhs-boxes">
            <Box sim={sim} side="away" pool={players} />
            <Box sim={sim} side="home" pool={players} />
          </div>
          <p className="meta-line small">Averages over all 10,000 games; Goal % / Point % / 3+ SOG = share of the games he did it. Lines and pairs by
            estimated ice time, power-play units from RotoWire when posted. The grade-model chances on the other pages are the official numbers --
            these are tuned to match them. Updated {new Date(sim.generated_at).toLocaleString()}.</p>
        </>
      )}
    </div>
  )
}
