import { useEffect, useMemo, useRef, useState } from 'react'
import './SimShell.css'

// 🎬 Sim replay shell (2026-10-29, user: RotoBot-style "we simulated this game 10,000 times" replays in Six Points, CourtIQ and
// Slap Shot). Same file in all three apps; each app passes its own playing surface (field / court / rink) and box-score panels.
// Plays the most typical of the 10,000 simulated games event by event: scoreboard, win-probability line, both teams' running
// box score, the playing surface and the last play, with play / pause, speed, step, a scrubber and "next score".
//
// props:
//   teams: { away: {abbr, name, color, logo}, home: {...} }
//   frames: [{ score: [home, away], wp (home win chance 0-1), clock: 'Q2 6:28', chip: '1ST & 10 · GB 23', text, dur (ms at 1x),
//              scoring, t (0-1 share of the game, for the WP line), period }]
//   Surface: ({ idx, t, frames }) => JSX   -- t = 0..1 progress of frame idx's animation
//   panels: (doneIdx) => ({ away: [{title, rows: [[label, value]]}], home: [...] })
//   footnote: string; periods: [t positions of period breaks]
// team colors on the dark broadcast panel: lift dark ones (navy, purple) so they read
export function lite(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return hex
  const n = parseInt(m[1], 16)
  let [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255]
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
  if (l >= 110) return hex
  const k = Math.min(0.6, (110 - l) / 160)
  ;[r, g, b] = [r, g, b].map((v) => Math.round(v + (255 - v) * k))
  return `rgb(${r},${g},${b})`
}

export default function SimShell({ teams, frames, Surface, panels, footnote, periods = [] }) {
  const [idx, setIdx] = useState(0)
  const [t, setT] = useState(1)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(2)
  const raf = useRef(0)
  const last = useRef(0)
  const hold = useRef(0)
  const n = frames.length

  useEffect(() => { setIdx(0); setT(1); setPlaying(false) }, [frames])

  const tRef = useRef(t)
  tRef.current = t
  useEffect(() => {
    if (!playing) return undefined
    last.current = performance.now()
    hold.current = 0
    const tick = (now) => {
      const dt = Math.min(100, now - last.current)
      last.current = now
      const dur = Math.max(250, (frames[idx]?.dur || 1200) / speed)
      if (tRef.current < 1) {
        tRef.current = Math.min(1, tRef.current + dt / dur)
        setT(tRef.current)
      } else {
        hold.current += dt
        if (hold.current > Math.max(120, 520 / speed)) {
          if (idx >= n - 1) { setPlaying(false); return }
          tRef.current = 0
          setT(0)
          setIdx(idx + 1)
          return // the effect restarts for the next frame
        }
      }
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [playing, idx, speed, n, frames])

  const done = t >= 1 ? idx : idx - 1
  const cur = frames[idx] || {}
  const shown = done >= 0 ? frames[done] : { score: [0, 0], wp: frames[0]?.wp ?? 0.5 }
  const [hs, as] = shown.score || [0, 0]
  const wpHome = shown.wp ?? 0.5
  const box = useMemo(() => panels(done), [panels, done])

  const go = (i) => { setPlaying(false); setIdx(Math.max(0, Math.min(n - 1, i))); setT(1) }
  const nextScore = () => {
    for (let i = idx + 1; i < n; i++) if (frames[i].scoring) { setIdx(i); setT(0); setPlaying(true); return }
    go(n - 1)
  }
  const toggle = () => {
    if (playing) { setPlaying(false); return }
    if (idx >= n - 1 && t >= 1) { setIdx(0); setT(0) } else if (t >= 1) { setIdx((i) => Math.min(n - 1, i + 1)); setT(0) }
    setPlaying(true)
  }

  // win-probability line: home chance, up = home ahead
  const W = 300, H = 46
  const pts = []
  for (let i = 0; i <= Math.max(0, done); i++) {
    const f = frames[i]
    if (f?.wp == null || f.t == null) continue
    pts.push(`${(f.t * W).toFixed(1)},${((1 - f.wp) * H).toFixed(1)}`)
  }
  const lastPt = pts.length ? pts[pts.length - 1].split(',') : null

  const Team = ({ side, score }) => {
    const tm = teams[side]
    const pos = cur.poss === side
    return (
      <div className={`ss-team ss-${side}`} style={{ '--tc': tm.color }}>
        {side === 'home' && <div className="ss-score">{score}</div>}
        <div className="ss-tname">
          {side === 'away' && tm.logo && <img src={tm.logo} alt="" width={30} height={30} />}
          <span>{pos && side === 'home' && <i className="ss-dot" />}<em className="ss-full">{tm.name}</em><em className="ss-abbr">{tm.abbr}</em>{pos && side === 'away' && <i className="ss-dot" />}</span>
          {side === 'home' && tm.logo && <img src={tm.logo} alt="" width={30} height={30} />}
        </div>
        {side === 'away' && <div className="ss-score">{score}</div>}
      </div>
    )
  }

  const Panel = ({ side }) => (
    <div className="ss-panel" style={{ '--tc': teams[side].color }}>
      <div className="ss-panel-h">{teams[side].logo && <img src={teams[side].logo} alt="" width={20} height={20} />}{teams[side].name}</div>
      {(box[side] || []).map((s) => (
        <div key={s.title} className="ss-sec">
          <div className="ss-sec-t">{s.title}</div>
          {s.rows.length ? s.rows.map(([a, b], i) => (
            <div key={i} className="ss-row"><span>{a}</span><b>{b}</b></div>
          )) : <div className="ss-row ss-none"><span>—</span></div>}
        </div>
      ))}
    </div>
  )

  return (
    <div className="ss">
      <div className="ss-top">
        <div className="ss-bug">
          <Team side="away" score={as} />
          <div className="ss-clock">{(t >= 1 ? cur.clock : shown.clock) || cur.clock || ''}</div>
          <Team side="home" score={hs} />
        </div>
        <div className="ss-wp">
          <b style={{ color: lite(teams.away.color) }}>{100 - Math.round(wpHome * 100)}%</b>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label="Win probability">
            <line x1="0" x2={W} y1={H / 2} y2={H / 2} className="ss-wp-mid" />
            {periods.map((p) => <line key={p} x1={p * W} x2={p * W} y1="0" y2={H} className="ss-wp-q" />)}
            {pts.length > 1 && <polyline points={pts.join(' ')} fill="none" stroke={lite(wpHome >= 0.5 ? teams.home.color : teams.away.color)} strokeWidth="2" vectorEffect="non-scaling-stroke" />}
            {lastPt && <circle cx={lastPt[0]} cy={lastPt[1]} r="3.2" fill={lite(wpHome >= 0.5 ? teams.home.color : teams.away.color)} />}
          </svg>
          <b style={{ color: lite(teams.home.color) }}>{Math.round(wpHome * 100)}%</b>
          <span className="ss-wp-label">WIN PROBABILITY</span>
        </div>
      </div>

      <div className="ss-mid">
        <Panel side="away" />
        <div className="ss-surface"><Surface idx={idx} t={t} frames={frames} /></div>
        <Panel side="home" />
      </div>

      <div className={`ss-play${cur.scoring && t >= 1 ? ' ss-play-score' : ''}`}>
        {cur.chip && <span className="ss-chip">{cur.chip}</span>}
        <span className="ss-text">{cur.text}</span>
      </div>

      <div className="ss-ctrl">
        <button onClick={() => go(0)} title="Start" aria-label="Back to the start">⏮</button>
        <button onClick={() => go(idx - 1)} title="Previous" aria-label="Previous play">◀</button>
        <button className="ss-play-btn" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
        <button onClick={() => go(idx + 1)} title="Next" aria-label="Next play">▶▏</button>
        <button onClick={nextScore} title="Next score">Next score</button>
        <button onClick={() => go(n - 1)} title="Final" aria-label="Jump to the final">⏭</button>
        <span className="ss-speed">
          {[1, 2, 4, 8].map((s) => <button key={s} className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)}>{s}x</button>)}
        </span>
        <input type="range" min={0} max={n - 1} value={idx} onChange={(e) => go(+e.target.value)} aria-label="Scrub through the game" />
        <span className="ss-count">{idx + 1}/{n}</span>
      </div>
      {footnote && <div className="ss-foot">{footnote}</div>}
    </div>
  )
}
