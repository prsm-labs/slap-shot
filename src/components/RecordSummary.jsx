import { useMemo, useState } from "react";
import "./RecordSummary.css";

// 2026-11-12 (user: simplify the track records -- a chart with a date range and one easy number before the full tables; no new page;
// anti-odds: our own chance is the measuring stick, never a sportsbook price). Shared file (same in every app). Each app hands over
// `lists`: [{ key, label, picks: [{ date, name, label, chance (0-1), hit: true | false | null (void / pending), replay }] }].
// "Above what we said" = hits minus the sum of our chances. A line that climbs = more hits than our numbers promised; flat = right on
// them; falling = fewer. It reads like a units chart without any odds.
const RANGES = [["7", "7 days"], ["30", "30 days"], ["season", "Season"], ["custom", "Custom"]];
const pct = (v) => `${Math.round(v * 100)}%`;
const sgn = (v) => (Math.abs(v) < 0.05 ? "0.0" : `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}`);
const dayLabel = (d) => new Date(`${d}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric" });
const shift = (d, n) => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };

function stats(picks) {
  const g = picks.filter((p) => (p.rank || 1) === 1 && (p.hit === true || p.hit === false)); // only each list's #1 a night is graded
  const hits = g.filter((p) => p.hit).length, said = g.reduce((s, p) => s + p.chance, 0);
  return { n: g.length, hits, said, above: hits - said, v: g.reduce((s, p) => s + p.chance * (1 - p.chance), 0) };
}

// 2026-11-12 (user: one per category -- list 3 for each, grade only the #1 for the track record; show honesty + progress): picks carry `rank`
// (1-3); only rank 1 counts in every number and on the chart, #2 / #3 show in the day view for context. A list with `solo` is shown on its own row but
// left out of "All lists". `markers` = tested model upgrades drawn on the chart; `modelCheck` = every projection by month.
// `fmtDay` (date -> label) and `ranges` let a weekly app show "Week 9" and week-sized ranges (Six Points).
export default function RecordSummary({ lists, liveSince, unit = "picks", markers = [], modelCheck, fmtDay = dayLabel, ranges = RANGES, children }) {
  const all = useMemo(() => lists.flatMap((l) => l.picks.map((p) => ({ ...p, list: l.key, listLabel: l.label, solo: l.solo }))), [lists]);
  const dates = useMemo(() => [...new Set(all.filter((p) => p.hit != null).map((p) => p.date))].sort(), [all]);
  const last = dates[dates.length - 1], first = dates[0];
  const [range, setRange] = useState(ranges.some((r) => r[0] === "30") ? "30" : ranges[0][0]);
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [list, setList] = useState("all");
  const [day, setDay] = useState(null);
  const [open, setOpen] = useState(false);
  if (!last) return <>{children}</>;
  const lo = range === "season" ? first : range === "custom" ? from || first : shift(last, -(+range - 1));
  const hi = range === "custom" ? to || last : last;
  const inRange = all.filter((p) => p.date >= lo && p.date <= hi);
  const shown = list === "all" ? inRange.filter((p) => !p.solo) : inRange.filter((p) => p.list === list);
  const s = stats(shown);
  // cumulative "above what we said", one point per graded day
  const days = [...new Set(shown.filter((p) => p.hit != null && (p.rank || 1) === 1).map((p) => p.date))].sort();
  // the shaded band = normal luck: 9 times in 10 a right-on model's running total stays inside +-1.64 x sqrt(sum p(1-p))
  let run = 0, vr = 0;
  const pts = days.map((d) => { const x = stats(shown.filter((p) => p.date === d)); run += x.above; vr += x.v; return { d, y: run, b: 1.64 * Math.sqrt(vr), n: x.n, hits: x.hits }; });
  const W = 600, H = 150, P = 10;
  const ys = [0, ...pts.flatMap((p) => [p.y, p.b, -p.b])], ymax = Math.max(...ys), ymin = Math.min(...ys), span = ymax - ymin || 1;
  const X = (i) => P + (pts.length < 2 ? (W - 2 * P) / 2 : (i * (W - 2 * P)) / (pts.length - 1));
  const Y = (v) => P + ((ymax - v) * (H - 2 * P)) / span;
  const line = pts.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join(" ");
  const zero = Y(0);
  const band = pts.length > 1 ? `M${pts.map((p, i) => `${X(i).toFixed(1)},${Y(p.b).toFixed(1)}`).join(" L")} L${pts.map((p, i) => `${X(i).toFixed(1)},${Y(-p.b).toFixed(1)}`).reverse().join(" L")} Z` : "";
  const marks = markers.map((m) => ({ ...m, i: pts.findIndex((p) => p.d >= m.date) })).filter((m) => m.i > 0);
  const perList = lists.map((l) => ({ ...l, ...stats(inRange.filter((p) => p.list === l.key)) })).filter((l) => l.n);
  const dayPicks = day ? shown.filter((p) => p.date === day) : [];
  const replayIn = liveSince && lo < liveSince;
  return (
    <div className="rs">
      <div className="card rs-card">
        <div className="rs-controls">
          <div className="rs-ranges">{ranges.map(([k, l]) => <button key={k} type="button" className={`rs-pill ${range === k ? "on" : ""}`} onClick={() => { setRange(k); setDay(null); }}>{l}</button>)}</div>
          <select value={list} onChange={(e) => setList(e.target.value)} aria-label="List">
            <option value="all">All lists</option>
            {lists.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
          </select>
        </div>
        {range === "custom" && (
          <div className="rs-custom">
            <input type="date" value={from || first} min={first} max={last} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
            <span>to</span>
            <input type="date" value={to || last} min={first} max={last} onChange={(e) => setTo(e.target.value)} aria-label="To" />
          </div>
        )}
        {s.n ? (
          <>
            <div className="rs-nums">
              <div><b>{pct(s.hits / s.n)}</b><span>hit · {s.hits} of {s.n}</span></div>
              <div><b>{pct(s.said / s.n)}</b><span>we said</span></div>
              <div className={s.above >= 0 ? "rs-up" : "rs-down"}><b>{sgn(s.above)}</b><span>{unit === "picks" ? "hits vs our chances" : unit}</span></div>
            </div>
            <svg className="rs-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Hits above what we said, running total">
              {band && <path d={band} className="rs-band" />}
              <line x1={P} x2={W - P} y1={zero} y2={zero} className="rs-zero" />
              {marks.map((m, k) => <line key={m.date} x1={X(m.i)} x2={X(m.i)} y1={P - 6} y2={H - P + 6} className="rs-mark"><title>{`${fmtDay(m.date)}: ${m.label}`}</title></line>)}
              <path d={line} className={run >= 0 ? "rs-line up" : "rs-line down"} />
              {pts.map((p, i) => (
                // a zero-length line with round caps + non-scaling stroke stays a round dot however wide the chart stretches
                <line key={p.d} x1={X(i)} x2={X(i)} y1={Y(p.y)} y2={Y(p.y)} className={`rs-dot ${day === p.d ? "on" : ""}`} onClick={() => setDay(day === p.d ? null : p.d)}>
                  <title>{`${fmtDay(p.d)}: ${p.hits} of ${p.n} hit · running ${sgn(p.y)}`}</title>
                </line>
              ))}
            </svg>
            {marks.length > 0 && <div className="rs-marks">{marks.map((m) => <span key={m.date}>┆ {fmtDay(m.date)}: {m.label}</span>)}</div>}
            <div className="rs-axis"><span>{fmtDay(days[0])}</span><span className="rs-axis-mid">tap a dot for that day</span><span>{fmtDay(days[days.length - 1])}</span></div>
          </>
        ) : <div className="rs-empty">No graded picks in this range.</div>}
        {day && (
          <div className="rs-day">
            <div className="rs-day-h">{fmtDay(day)} · #1 picks: {stats(dayPicks).hits} of {stats(dayPicks).n} hit</div>
            {lists.filter((l) => (list === "all" ? !l.solo : l.key === list)).map((l) => {
              const lp = dayPicks.filter((p) => p.list === l.key && (p.rank || 1) === 1); // user 2026-11-12: show only the graded #1
              return lp.length ? (
                <div key={l.key} className="rs-dl">
                  <div className="rs-day-lh">{l.label}</div>
                  {lp.map((p, i) => (
                    <div key={i} className={`rs-day-row ${(p.rank || 1) > 1 ? "rs-extra" : ""}`}>
                      <span className={p.hit ? "rs-hit" : p.hit === false ? "rs-miss" : "rs-void"}>{p.hit ? "✓" : p.hit === false ? "✗" : "–"}</span>
                      <span className="rs-day-who"><b>{p.name}</b> {p.label}</span>
                      <span className="rs-day-ch">{pct(p.chance)}</span>
                    </div>
                  ))}
                </div>
              ) : null;
            })}
          </div>
        )}
        {list === "all" && perList.length > 1 && (
          <div className="rs-lists">
            {perList.map((l) => (
              <button key={l.key} type="button" className={`rs-list ${l.solo ? "solo" : ""}`} onClick={() => { setList(l.key); setDay(null); }}>
                <span className="rs-list-name">{l.label}</span>
                <span className="rs-list-rec">{l.hits}/{l.n} · {pct(l.hits / l.n)} vs {pct(l.said / l.n)} said</span>
                <span className={l.above >= 0 ? "rs-up" : "rs-down"}>{sgn(l.above)}</span>
              </button>
            ))}
          </div>
        )}
        {modelCheck?.length > 0 && (
          <div className="rs-model">
            <div className="rs-model-h">Model check · every projection we made, by month</div>
            {modelCheck.map((m) => (
              <div key={m.month} className="rs-model-row">
                <span className="rs-model-m">{m.label}</span>
                {m.stats.map((x) => <span key={x.label} className="rs-model-s">{x.label}: said <b>{(x.said * 100).toFixed(1)}%</b>, happened <b>{(x.hit * 100).toFixed(1)}%</b></span>)}
                <span className="rs-model-n">{m.n.toLocaleString()} games</span>
              </div>
            ))}
          </div>
        )}
        <div className="rs-note">
          Only each list's #1 pick is graded. Measured against our own chances, not betting odds. "+3.0" = 3 more hits than our chances added up to. Dashed line = right on our chances; shaded = normal luck (a model that is exactly right stays inside it 9 times in 10). {replayIn ? `Before ${fmtDay(liveSince)} some lists are replayed from the frozen pre-game numbers.` : ""}
        </div>
      </div>
      {children && (
        <>
          <button type="button" className="rs-more" onClick={() => setOpen(!open)}>{open ? "▴ Hide the full records" : "▾ Full records (every pick, every table)"}</button>
          {open && children}
        </>
      )}
    </div>
  );
}

// One "here's the pick" card (Cheat Sheets). pick: { name, label, matchup, chance, sub, lines: [{dir,text}], result, record, onOpen, action }
export function PickCard({ title = "Tonight's pick", pick }) {
  if (!pick) return null;
  const M = { up: "▲", down: "▼", warn: "⚠" };
  return (
    <div className="card pc">
      <div className="pc-top">
        <div className="pc-title">{title}</div>
        {pick.result && <span className={`pc-res ${pick.result}`}>{pick.result === "hit" ? "✓ Hit" : pick.result === "miss" ? "✗ Miss" : pick.result}</span>}
      </div>
      <div className="pc-main">
        <div className="pc-who">
          <button type="button" className="pc-name" onClick={pick.onOpen}>{pick.name}</button>
          <div className="pc-line">{pick.label} <span>· {pick.matchup}</span></div>
        </div>
        <div className="pc-big"><b>{pct(pick.chance)}</b><span>{pick.sub}</span></div>
      </div>
      {pick.lines?.length > 0 && <ul className="pc-why">{pick.lines.map((l, i) => <li key={i} className={`pc-${l.dir}`}><span>{M[l.dir] || "•"}</span>{l.text}</li>)}</ul>}
      <div className="pc-foot">{pick.record}{pick.action && <span className="pc-act">{pick.action}</span>}</div>
    </div>
  );
}
