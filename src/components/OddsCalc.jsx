import { useEffect, useState } from 'react'
import './OddsCalc.css'

// 2026-11-13 (user): Going Yard's 🧮 Odds Calculator in every app -- same math and modes (Manual / Suggested / Parlay + round robin),
// plus a 📘 Bankroll basics fold that teaches unit sizing with realistic amounts, and a disclaimer at the bottom. A calculator only:
// it never sizes a stake from our own chances (books' prices measured sharper, 11/09). Same file in CourtIQ, Slap Shot, Six Points,
// Final Lap and Going Yard (Going Yard imports BankrollGuide only, into its own slideout).

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY']
const SYM = { USD: '$', EUR: '€', GBP: '£', CAD: 'CA$', AUD: 'A$', JPY: '¥' }
const money = (n, ccy = 'USD') => (n == null || isNaN(n) ? '—'
  : (SYM[ccy] || '$') + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const amToDec = (a) => (a > 0 ? a / 100 + 1 : 100 / Math.abs(a) + 1)
const decToAm = (d) => (d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1)))
export function parseOdds(raw) {
  const s = String(raw || '').trim().replace('−', '-')
  if (!s) return null
  if (s.startsWith('+') || s.startsWith('-')) {
    const a = parseFloat(s)
    if (isNaN(a) || Math.abs(a) < 100) return null
    return { american: a, decimal: +amToDec(a).toFixed(4) }
  }
  if (s.includes('.')) {
    const d = parseFloat(s)
    if (isNaN(d) || d <= 1) return null
    return { american: decToAm(d), decimal: d }
  }
  const n = parseFloat(s)
  if (isNaN(n)) return null
  if (n >= 100) return { american: n, decimal: +amToDec(n).toFixed(4) }
  if (n > 1) return { american: decToAm(n), decimal: n }
  return null
}
function combos(n, k) {
  const out = []
  const build = (start, c) => {
    if (c.length === k) { out.push([...c]); return }
    for (let i = start; i < n; i++) { c.push(i); build(i + 1, c); c.pop() }
  }
  build(0, [])
  return out
}
const riskDesc = (f) => (f >= 1 ? 'Full unit (Favorite)' : f >= 0.75 ? 'Standard play' : f >= 0.5 ? 'Half unit'
  : f >= 0.25 ? 'Quarter unit' : f >= 0.125 ? 'Micro-fractional (Longshot)' : 'Minimum stake (Extreme longshot)')
// Suggested mode (single bet): about 1 unit of profit; favorites risk at most 1.5u, long shots at least 0.05u
const sugFrac = (p) => (p ? Math.max(p.american > 0 ? 100 / p.american : Math.min(1.5, Math.abs(p.american) / 100), 0.05) : 1)
// Parlay / round robin lines: same ~1 unit anchor, but a payout never larger than the whole bankroll
const sugFracDec = (dec, bank, unit) => {
  let f = Math.max(1 / Math.max(dec - 1, 0.0001), 0.05)
  if (bank > 0 && unit > 0 && f * unit * dec > bank) f = bank / dec / unit
  return Math.max(f, 0.001)
}
const fmtFrac = (n) => parseFloat(n.toFixed(3)).toString()
const SCALE = [['-150 or heavier', '1.0u – 1.5u'], ['-110 to +110', '1.0u (baseline)'], ['+115 to +175', '~0.75u'],
  ['+180 to +275', '~0.50u'], ['+300 to +490', '~0.25u'], ['+500 to +900', '~0.125u'], ['+1000 or longer', '0.05u (floor)']]

const store = {
  get(k, d) { try { const v = localStorage.getItem('oddsCalc.' + k); return v == null ? d : v } catch { return d } },
  set(k, v) { try { localStorage.setItem('oddsCalc.' + k, String(v)) } catch { /* private window */ } },
}

function Rows({ rows }) {
  return rows.map(([l, v, cls]) => (
    <div key={l} className="oc-row"><span>{l}</span><b className={cls || ''}>{v}</b></div>
  ))
}

// ── 📘 Bankroll basics (also used by Going Yard's own slideout) ─────────────────────────────────────────────
const EXAMPLES = [100, 200, 300, 500]
export function BankrollGuide({ bankroll, rate = 3, ccy = 'USD' }) {
  const b = parseFloat(bankroll)
  const r = parseFloat(rate) || 3
  const yours = b > 0 ? b : null
  return (
    <details className="oc-learn">
      <summary><span>📘 Bankroll basics <small>how much a bet should be, across all your books</small></span><em className="oc-more" aria-hidden="true" /></summary>
      <div className="oc-learn-body">
        <p><b>Your bankroll</b> is money set aside only for betting -- money you could lose all of without it touching rent, bills
          or savings. If it's spread over a few sportsbooks, add it up: $100 in three books is <b>one $300 bankroll</b>.</p>
        <p><b>A unit</b> is the normal size of one bet: <b>1% to 3% of the bankroll</b>. You don't need $1,000 to start -- a small
          bankroll just means a small unit.</p>
        <table className="oc-table">
          <thead><tr><th>Bankroll</th><th>1%</th><th>2%</th><th>3%</th></tr></thead>
          <tbody>
            {EXAMPLES.map((x) => (
              <tr key={x} className={yours === x ? 'on' : ''}>
                <td>{money(x, ccy).replace('.00', '')}</td><td>{money(x * 0.01, ccy)}</td><td>{money(x * 0.02, ccy)}</td><td>{money(x * 0.03, ccy)}</td>
              </tr>
            ))}
            {yours && !EXAMPLES.includes(yours) && (
              <tr className="on"><td>{money(yours, ccy)} (yours)</td><td>{money(yours * 0.01, ccy)}</td><td>{money(yours * 0.02, ccy)}</td><td>{money(yours * 0.03, ccy)}</td></tr>
            )}
          </tbody>
        </table>
        <div className="oc-books">
          <b>Using more than one sportsbook?</b> Manage it all as one bankroll:
          <ul>
            <li><b>Add up every book.</b> $100 + $100 + $100 is a $300 bankroll. Your unit comes from the total ($9 at 3%), and it's the
              same $9 in every book.</li>
            <li><b>One limit across all of them.</b> A daily or weekly limit counts every book together. Three books with their own
              budgets quietly triples what you can lose in a night.</li>
            <li><b>Moving money between books changes nothing.</b> It's the same bankroll. A book running low isn't a reason to deposit
              more -- re-figure the unit from what's left in total.</li>
            <li><b>One log for every book.</b> Write down each bet, wherever it was placed, so you see your real total -- not three
              separate pictures that each look fine.</li>
            <li>The point of several books is shopping for the best price on the same bet, not getting more to bet with.</li>
          </ul>
        </div>
        <p className="oc-ex"><b>Example:</b> a $300 bankroll at 3% = a <b>$9 unit</b>. A normal bet is $9. A long shot or a parlay is a
          piece of a unit ($2-5), never more. {yours ? <>Yours: {money(yours, ccy)} at {r}% = <b>{money(yours * r / 100, ccy)}</b> a unit.</> : null}</p>
        <p><b>Why so small?</b> Cold streaks are normal, even for good picks. Eight losses in a row at 3% a unit costs about a quarter of
          the bankroll -- you're still playing. At 10% a unit the same streak takes most of it.</p>
        <p><b>What each bet is for.</b> Two common ways: <b>risk 1 unit</b> on every bet (simplest), or <b>bet to win 1 unit</b> -- a
          -200 favorite costs about 1.5u at most here, a +300 long shot about a third of a unit. That second way is what Suggested and
          Parlay modes do. No single bet should try to win back the whole bankroll.</p>
        <ul>
          <li>Set the unit once and keep it. Re-figure it when the bankroll moves about 25% up or down, not after every bet.</li>
          <li>Don't raise the stake to win back a loss (chasing). That's the fastest way through a bankroll.</li>
          <li>Pick a daily or weekly limit before you start, and stop when you hit it -- win or lose.</li>
          <li>Parlays pay big because they rarely hit. Keep them small and rare.</li>
          <li><b>Careful tailing "cappers"</b> (pick sellers and Discord / X groups). Following several of them at once stacks a lot of
            bets on one night and drains a bankroll fast -- and their posted records are rarely checked. If you tail, do it at your own unit
            size, count those bets inside your daily limit, and keep your own record of how their picks actually do. Your own research
            at a steady unit usually lasts longer.</li>
          <li>At -110 you have to win 52.4% just to break even. Keep a simple log; it shows your real habits.</li>
        </ul>
      </div>
    </details>
  )
}
export function CalcDisclaimer() {
  return (
    <p className="oc-disc">For entertainment and information only. Degen Labs does not take bets, and nothing here is betting advice or a
      promise of results -- our chances are estimates, and sportsbooks often price better than we do. Only bet where it's legal and you're
      of age (21+ in most US states), and only what you can afford to lose. If betting stops being fun, help is free and confidential:
      call or text <a href="tel:18004262537">1-800-GAMBLER</a>.</p>
  )
}

// ── the calculator slideout ─────────────────────────────────────────────────────────────────────────────────
export function OddsCalcPanel({ onClose }) {
  const [mode, setMode] = useState('manual')
  const [oddsRaw, setOddsRaw] = useState('')
  const [bankroll, setBankroll] = useState(() => store.get('bankroll', ''))
  const [unitRate, setUnitRate] = useState(() => store.get('rate', '3'))
  const [unitSize, setUnitSize] = useState(() => {
    const b = parseFloat(store.get('bankroll', '')), r = parseFloat(store.get('rate', '3')) || 3
    return b > 0 ? (b * r / 100).toFixed(2) : ''
  })
  const [frac, setFrac] = useState('')
  const [showScale, setShowScale] = useState(false)
  const [ccy, setCcy] = useState(() => store.get('ccy', 'USD'))
  const [result, setResult] = useState(null)
  const [legsN, setLegsN] = useState(2)
  const [rrOn, setRrOn] = useState(false)
  const [rrK, setRrK] = useState(2)
  const [legs, setLegs] = useState(['', ''])
  const [parlay, setParlay] = useState(null)
  const [rr, setRr] = useState(null)

  useEffect(() => { store.set('bankroll', bankroll); store.set('rate', unitRate); store.set('ccy', ccy) }, [bankroll, unitRate, ccy])
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  const parsed = parseOdds(oddsRaw)
  const sym = SYM[ccy] || '$'
  const rateNum = parseFloat(unitRate) || 3
  const clear = () => { setResult(null); setRr(null); setParlay(null) }
  const onBank = (v) => { setBankroll(v); const b = parseFloat(v); setUnitSize(b > 0 ? (b * rateNum / 100).toFixed(2) : ''); clear() }
  const onUnit = (v) => { setUnitSize(v); const u = parseFloat(v); setBankroll(u > 0 ? (u / (rateNum / 100)).toFixed(2) : ''); clear() }
  const onRate = (v) => {
    setUnitRate(v)
    const r = (parseFloat(v) || 3) / 100, b = parseFloat(bankroll), u = parseFloat(unitSize)
    if (b > 0) setUnitSize((b * r).toFixed(2)); else if (u > 0) setBankroll((u / r).toFixed(2))
    clear()
  }
  const onOdds = (v) => { setOddsRaw(v); setResult(null); if (mode === 'suggested') { const p = parseOdds(v); if (p) setFrac(fmtFrac(sugFrac(p))) } }
  const onMode = (m) => { setMode(m); setResult(null); if (m === 'suggested' && parsed) setFrac(fmtFrac(sugFrac(parsed))) }

  const canCalc = !!(parsed && parsed.decimal > 1 && parseFloat(unitSize) > 0)
  const calculate = () => {
    if (!canCalc) return
    const dec = parsed.decimal, unit = parseFloat(unitSize)
    const f = mode === 'suggested' ? Math.max(parseFloat(frac) || sugFrac(parsed), 0.05) : 1 / (dec - 1)
    const stake = Math.max(f * unit, 0.1), ret = stake * dec
    setResult({ unit, f, stake, ret, prob: 100 / dec, profit: ret - stake, desc: riskDesc(f) })
  }

  const onLegsN = (v) => {
    const n = Math.max(2, Math.min(5, parseInt(v) || 2))
    setLegsN(n)
    setLegs((p) => { const x = [...p]; while (x.length < n) x.push(''); return x.slice(0, n) })
    if (n < 3) setRrOn(false)
    setRrK(2); setParlay(null); setRr(null)
  }
  const legP = legs.map(parseOdds)
  const legsOk = legP.length === legsN && legP.every((p) => p && p.decimal > 1)
  const canRR = legsOk && parseFloat(unitSize) > 0
  const calcRR = () => {
    if (!canRR) return
    const unit = parseFloat(unitSize), bank = parseFloat(bankroll) || 0
    const dec = legP.reduce((a, p) => a * p.decimal, 1)
    const f = sugFracDec(dec, bank, unit), stake = Math.max(f * unit, 0.1), pay = stake * dec
    setParlay({ dec, am: decToAm(dec), f, stake, pay, profit: pay - stake, desc: riskDesc(f) })
    if (rrOn && legsN >= 3 && rrK >= 2 && rrK <= legsN - 1) {
      const lines = combos(legsN, rrK).map((ix) => {
        const d = ix.reduce((a, i) => a * legP[i].decimal, 1)
        const lf = sugFracDec(d, bank, unit), s = Math.max(lf * unit, 0.1), py = s * d
        return { ix, d, f: lf, s, py }
      })
      const tot = lines.reduce((a, c) => a + c.s, 0), max = lines.reduce((a, c) => a + c.py, 0)
      setRr({ lines, tot, max, profit: max - tot, lo: Math.min(...lines.map((c) => c.py)), hi: Math.max(...lines.map((c) => c.py)) })
    } else setRr(null)
  }

  const bankInputs = (
    <>
      <label className="oc-field"><span className="oc-lbl">Bankroll ({sym})</span>
        <input value={bankroll} onChange={(e) => onBank(e.target.value)} placeholder="e.g. 300" type="number" min="0" inputMode="decimal" /></label>
      <div className="oc-field">
        <div className="oc-lblrow"><span className="oc-lbl">Unit size ({sym})</span>
          <span className="oc-rate">% of bankroll <input value={unitRate} onChange={(e) => onRate(e.target.value)} type="number" min="0.1" max="100" step="0.5" inputMode="decimal" aria-label="Unit as a percent of bankroll" /> %</span></div>
        <input value={unitSize} onChange={(e) => onUnit(e.target.value)} placeholder="e.g. 9" type="number" min="0" inputMode="decimal" />
        {rateNum > 5 && <div className="oc-warn">⚠ {rateNum}% a bet is high -- most bettors stay at 1-3%.</div>}
      </div>
    </>
  )

  return (
    <>
      <div className="oc-backdrop" onClick={onClose} />
      <aside className="oc-panel" role="dialog" aria-label="Odds calculator">
        <div className="oc-head"><b>🧮 Odds Calculator</b><button type="button" className="oc-x" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="oc-body">
          <div className="oc-modes">
            {[['manual', 'Manual'], ['suggested', 'Suggested'], ['parlay', 'Parlay']].map(([m, l]) => (
              <button key={m} type="button" className={mode === m ? 'on' : ''} onClick={() => onMode(m)}>{l}</button>))}
          </div>
          <p className="oc-hint">{mode === 'manual' ? 'Stake sized to win exactly 1 unit at these odds.'
            : mode === 'suggested' ? 'A stake from the odds: about 1 unit of profit, favorites capped at 1.5u, long shots at least 0.05u. You can edit the fraction.'
              : 'Two to five legs. Stake sized to about 1 unit of profit, and never a payout bigger than your whole bankroll.'}</p>

          {mode !== 'parlay' && (
            <div className="oc-field"><span className="oc-lbl">Odds</span>
              <input value={oddsRaw} onChange={(e) => onOdds(e.target.value)} placeholder="+180  ·  -150  ·  2.80" inputMode="text" />
              {parsed ? (
                <div className="oc-chips">
                  <div><small>American</small><b>{parsed.american >= 0 ? '+' : ''}{parsed.american}</b></div>
                  <div><small>Decimal</small><b>{parsed.decimal.toFixed(2)}</b></div>
                  <div><small>Implied</small><b>{(100 / parsed.decimal).toFixed(1)}%</b></div>
                </div>
              ) : oddsRaw ? <div className="oc-warn">Enter American (+180, -150) or decimal (2.80) odds</div> : null}
            </div>
          )}

          <div className="oc-field"><span className="oc-lbl">Currency</span>
            <div className="oc-ccy">{CURRENCIES.map((c) => <button key={c} type="button" className={ccy === c ? 'on' : ''} onClick={() => setCcy(c)}>{c}</button>)}</div>
          </div>

          {mode === 'suggested' ? (
            <>
              <label className="oc-field"><span className="oc-lbl">Unit size ({sym})</span>
                <input value={unitSize} onChange={(e) => { setUnitSize(e.target.value); setResult(null) }} placeholder="e.g. 9" type="number" min="0" inputMode="decimal" /></label>
              <div className="oc-field">
                <div className="oc-lblrow"><span className="oc-lbl">Suggested fraction</span>
                  <button type="button" className="oc-link" onClick={() => setShowScale((s) => !s)}>{showScale ? 'hide scale' : 'show scale'}</button></div>
                <input value={frac} onChange={(e) => { setFrac(e.target.value); setResult(null) }} placeholder="e.g. 0.5" type="number" min="0.05" max="2" step="0.05" inputMode="decimal" />
                {showScale && (
                  <table className="oc-table"><thead><tr><th>Odds range</th><th>Suggested</th></tr></thead>
                    <tbody>{SCALE.map(([a, b]) => <tr key={a}><td>{a}</td><td className="oc-num">{b}</td></tr>)}</tbody></table>
                )}
              </div>
            </>
          ) : bankInputs}

          {mode === 'parlay' && (
            <>
              <label className="oc-field"><span className="oc-lbl">Picks</span>
                <select value={legsN} onChange={(e) => onLegsN(e.target.value)}>{[2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} picks</option>)}</select></label>
              <label className={`oc-check ${legsN < 3 ? 'off' : ''}`}>
                <input type="checkbox" checked={rrOn} disabled={legsN < 3} onChange={(e) => { setRrOn(e.target.checked); setRr(null) }} />
                Round robin {legsN < 3 && <small>(3+ picks)</small>}
              </label>
              {rrOn && legsN >= 3 && (
                <label className="oc-field"><span className="oc-lbl">Legs per line</span>
                  <select value={rrK} onChange={(e) => { setRrK(parseInt(e.target.value)); setRr(null) }}>
                    {Array.from({ length: legsN - 2 }, (_, i) => i + 2).map((k) => (
                      <option key={k} value={k}>{k === 2 ? 'Doubles' : k === 3 ? 'Trebles' : `${k}-leg combos`} — {combos(legsN, k).length} lines</option>))}
                  </select></label>
              )}
              <div className="oc-field"><span className="oc-lbl">Odds — each pick</span>
                {legs.map((o, i) => {
                  const p = parseOdds(o)
                  return (
                    <div key={i} className="oc-leg"><span>{i + 1}</span>
                      <input value={o} onChange={(e) => { const v = e.target.value; setLegs((x) => { const y = [...x]; y[i] = v; return y }); setParlay(null); setRr(null) }} placeholder="+180  ·  -150  ·  2.80" />
                      <em className={p ? 'ok' : ''}>{p ? p.decimal.toFixed(2) : '—'}</em></div>
                  )
                })}
              </div>
              <button type="button" className="oc-go" disabled={!canRR} onClick={calcRR}>{rrOn && legsN >= 3 ? 'Calculate parlay + round robin' : 'Calculate parlay'}</button>
              {parlay && (
                <div className="oc-result">
                  <div className="oc-rtitle">{legsN}-leg parlay</div>
                  <Rows rows={[['Parlay odds', `${parlay.am >= 0 ? '+' : ''}${parlay.am} · ${parlay.dec.toFixed(2)}`],
                    ['Suggested unit', `${fmtFrac(parlay.f)}u of ${money(parseFloat(unitSize) || 0, ccy)}`, 'oc-a2'],
                    ['Suggested stake', money(parlay.stake, ccy), 'oc-good'], ['Total payout', money(parlay.pay, ccy)],
                    ['Profit on win', money(parlay.profit, ccy), 'oc-good']]} />
                  <div className="oc-risk">Risk level: <b>{parlay.desc}</b></div>
                  <div className="oc-note">All {legsN} picks must hit for this bet to pay. The odds multiply, so the chance of all of them hitting drops fast.</div>
                </div>
              )}
              {rr && (
                <div className="oc-result">
                  <Rows rows={[['Lines', String(rr.lines.length)], ['Total stake', money(rr.tot, ccy), 'oc-good'],
                    ['Max payout (all hit)', money(rr.max, ccy)], ['Max profit (all hit)', money(rr.profit, ccy), 'oc-good'],
                    ['Best single line', money(rr.hi, ccy), 'oc-a2'], ['Worst winning line', money(rr.lo, ccy), 'oc-a2']]} />
                  <table className="oc-table"><thead><tr><th>Line</th><th>Odds</th><th>Unit</th><th>Stake</th><th>Payout</th></tr></thead>
                    <tbody>{rr.lines.map((c, i) => (
                      <tr key={i}><td>{c.ix.map((x) => `#${x + 1}`).join(' + ')}</td><td>{c.d.toFixed(2)}</td><td>{fmtFrac(c.f)}u</td>
                        <td>{money(c.s, ccy)}</td><td className="oc-num">{money(c.py, ccy)}</td></tr>))}</tbody></table>
                  <div className="oc-note">Any {rrK} of your {legsN} picks hitting together pays that line -- you don't need all {legsN} to win something.</div>
                </div>
              )}
            </>
          )}

          {mode !== 'parlay' && (
            <>
              <button type="button" className="oc-go" disabled={!canCalc} onClick={calculate}>Calculate</button>
              {result && (
                <div className="oc-result">
                  <Rows rows={[['Implied chance', result.prob.toFixed(1) + '%'],
                    ['Suggested fraction', `${result.f.toFixed(3)}u of ${money(result.unit, ccy)}`, 'oc-a2'],
                    ['Stake', money(result.stake, ccy), 'oc-good'], ['Total return', money(result.ret, ccy)],
                    ['Profit on win', money(result.profit, ccy), 'oc-good']]} />
                  <div className="oc-risk">Risk level: <b>{result.desc}</b></div>
                  <div className="oc-note">Floor {sym}0.10. {mode === 'manual' ? 'Sized to win 1 unit.' : 'Fraction suggested from the odds.'}
                    {result.f > 1.5 && ' Heavy favorites cost a lot to win one unit -- many bettors cap the risk at 1.5u (Suggested mode does).'}</div>
                </div>
              )}
            </>
          )}

          <BankrollGuide bankroll={bankroll} rate={unitRate} ccy={ccy} />
          <CalcDisclaimer />
        </div>
      </aside>
    </>
  )
}

// header button + panel
export default function OddsCalc() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="oc-btn" onClick={() => setOpen(true)} title="Odds calculator + bankroll basics" aria-label="Open the odds calculator">🧮</button>
      {open && <OddsCalcPanel onClose={() => setOpen(false)} />}
    </>
  )
}
