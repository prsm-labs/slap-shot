import { useMemo, useState } from "react";
import "./RecordSummary.css";

// 2026-11-12 (user: simplify the track records -- a chart with a date range and one easy number before the full tables; no new page;
// anti-odds: our own chance is the measuring stick, never a sportsbook price). Shared file (same in every app). Each app hands over
// `lists`: [{ key, label, picks: [{ date, name, label, chance (0-1), hit: true | false | null (void / pending), replay }] }].
// "Above what we said" = hits minus the sum of our chances. A line that climbs = more hits than our numbers promised; flat = right on
// them; falling = fewer. It reads like a units chart without any odds.
const RANGES = [["7", "7 days"], ["30", "30 days"], ["season", "Season"], ["custom", "Custom"]];
const pct = (v) => `${Math.round(v * 100)}%`;
const sgn = (v) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}`;
const dayLabel = (d) => new Date(`${d}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric" });
const shift = (d, n) => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };

function stats(picks) {
  const g = picks.filter((p) => p.hit === true || p.hit === false);
  const hits = g.filter((p) => p.hit).length, said = g.reduce((s, p) => s + p.chance, 0);
  return { n: g.length, hits, said, above: hits - said };
}

export default function RecordSummary({ lists, liveSince, unit = "picks", children }) {
  const all = useMemo(() => lists.flatMap((l) => l.picks.map((p) => ({ ...p, list: l.key, listLabel: l.label }))), [lists]);
  const dates = useMemo(() => [...new Set(all.filter((p) => p.hit != null).map((p) => p.date))].sort(), [all]);
  const last = dates[dates.length - 1], first = dates[0];
  const [range, setRange] = useState("30");
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [list, setList] = useState("all");
  const [day, setDay] = useState(null);
  const [open, setOpen] = useState(false);
  if (!last) return <>{children}</>;
  const lo = range === "season" ? first : range === "custom" ? from || first : shift(last, -(+range - 1));
  const hi = range === "custom" ? to || last : last;
  const inRange = all.filter((p) => p.date >= lo && p.date <= hi);
  const shown = list === "all" ? inRange : inRange.filter((p) => p.list === list);
  const s = stats(shown);
  // cumulative "above what we said", one point per graded day
  const days = [...new Set(shown.filter((p) => p.hit != null).map((p) => p.date))].sort();
  let run = 0;
  const pts = days.map((d) => { const x = stats(shown.filter((p) => p.date === d)); run += x.above; return { d, y: run, n: x.n, hits: x.hits }; });
  const W = 600, H = 150, P = 10;
  const ys = [0, ...pts.map((p) => p.y)], ymax = Math.max(...ys), ymin = Math.min(...ys), span = ymax - ymin || 1;
  const X = (i) => P + (pts.length < 2 ? (W - 2 * P) / 2 : (i * (W - 2 * P)) / (pts.length - 1));
  const Y = (v) => P + ((ymax - v) * (H - 2 * P)) / span;
  const line = pts.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join(" ");
  const zero = Y(0);
  const perList = lists.map((l) => ({ ...l, ...stats(inRange.filter((p) => p.list === l.key)) })).filter((l) => l.n);
  const dayPicks = day ? shown.filter((p) => p.date === day) : [];
  const replayIn = liveSince && lo < liveSince;
  return (
    <div className="rs">
      <div className="card rs-card">
        <div className="rs-controls">
          <div className="rs-ranges">{RANGES.map(([k, l]) => <button key={k} type="button" className={`rs-pill ${range === k ? "on" : ""}`} onClick={() => { setRange(k); setDay(null); }}>{l}</button>)}</div>
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
              <line x1={P} x2={W - P} y1={zero} y2={zero} className="rs-zero" />
              <path d={line} className={run >= 0 ? "rs-line up" : "rs-line down"} />
              {pts.map((p, i) => (
                // a zero-length line with round caps + non-scaling stroke stays a round dot however wide the chart stretches
                <line key={p.d} x1={X(i)} x2={X(i)} y1={Y(p.y)} y2={Y(p.y)} className={`rs-dot ${day === p.d ? "on" : ""}`} onClick={() => setDay(day === p.d ? null : p.d)}>
                  <title>{`${dayLabel(p.d)}: ${p.hits} of ${p.n} hit · running ${sgn(p.y)}`}</title>
                </line>
              ))}
            </svg>
            <div className="rs-axis"><span>{dayLabel(days[0])}</span><span>dashed = right on our chances · tap a dot</span><span>{dayLabel(days[days.length - 1])}</span></div>
          </>
        ) : <div className="rs-empty">No graded picks in this range.</div>}
        {day && (
          <div className="rs-day">
            <div className="rs-day-h">{dayLabel(day)} · {dayPicks.filter((p) => p.hit).length} of {dayPicks.filter((p) => p.hit != null).length} hit</div>
            {list === "all" ? lists.map((l) => {
              const x = stats(dayPicks.filter((p) => p.list === l.key));
              return x.n ? (
                <button key={l.key} type="button" className="rs-list" onClick={() => setList(l.key)}>
                  <span className="rs-list-name">{l.label}</span>
                  <span className="rs-list-rec">{x.hits} of {x.n} · said {x.said.toFixed(1)}</span>
                  <span className={x.above >= 0 ? "rs-up" : "rs-down"}>{sgn(x.above)}</span>
                </button>
              ) : null;
            }) : dayPicks.map((p, i) => (
              <div key={i} className="rs-day-row">
                <span className={p.hit ? "rs-hit" : p.hit === false ? "rs-miss" : "rs-void"}>{p.hit ? "✓" : p.hit === false ? "✗" : "–"}</span>
                <span className="rs-day-who"><b>{p.name}</b> {p.label}</span>
                <span className="rs-day-ch">{pct(p.chance)}</span>
              </div>
            ))}
          </div>
        )}
        {list === "all" && perList.length > 1 && (
          <div className="rs-lists">
            {perList.map((l) => (
              <button key={l.key} type="button" className="rs-list" onClick={() => { setList(l.key); setDay(null); }}>
                <span className="rs-list-name">{l.label}</span>
                <span className="rs-list-rec">{l.hits}/{l.n} · {pct(l.hits / l.n)} vs {pct(l.said / l.n)} said</span>
                <span className={l.above >= 0 ? "rs-up" : "rs-down"}>{sgn(l.above)}</span>
              </button>
            ))}
          </div>
        )}
        <div className="rs-note">
          Measured against our own chances, not betting odds. "+3.0" = 3 more hits than our chances added up to. {replayIn ? `Before ${dayLabel(liveSince)} some lists are replayed from the frozen pre-game numbers.` : ""}
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
