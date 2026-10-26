// ⚡ Momentum (2026-10-26, user: "a momentum bar" above the box score, like Six Points' mini Game Tracker) — built from the
// NHL play-by-play the box score already loads (box.plays, refreshed every 15 s while live). Hockey "momentum" = who is
// generating the shots, so it runs on unblocked shot attempts (shots on goal + misses + goals; blocked shots are left
// out because the feed's owner team isn't consistent for them).
//  - Tug bar: each team's attempts with recent ones counting most (an attempt loses half its weight every 3 minutes).
//  - Line: attempts over the last 5 minutes.
//  - Pressure chart: attempts margin per game minute (bars up = AWAY out-shooting HOME that minute, down = HOME),
//    goals as dots, period lines.
// Context only: Slap Shot's 10/20 "back to normal" test found hot stretches barely carry within a game (shooting % 3%),
// so nothing here moves a projection.

const AWAY_C = "var(--warn)", HOME_C = "var(--accent)";
const HALF_LIFE = 180, WINDOW = 300, PLEN = 1200, OTLEN = 300;
const ATTEMPTS = new Set(["shot-on-goal", "missed-shot", "goal"]);

function periodNum(label) {
  if (/^\d+$/.test(label)) return Number(label);
  if (label === "OT") return 4;
  const m = String(label).match(/^(\d+)OT$/);
  return m ? Number(m[1]) + 3 : null; // SO and anything unknown -> null (left off)
}
function elapsed(p) {
  const n = periodNum(p.period);
  if (!n || !p.time) return null;
  const [m, s] = p.time.split(":").map(Number);
  const start = n <= 3 ? (n - 1) * PLEN : 3 * PLEN + (n - 4) * OTLEN;
  return start + m * 60 + (s || 0);
}

export default function Momentum({ box }) {
  const plays = box?.plays;
  if (!plays?.length) return null;
  const away = box.away.abbrev, home = box.home.abbrev;
  const sideOf = (t) => (t === away ? "away" : t === home ? "home" : null);
  const ev = plays.map((p) => ({ ...p, t: elapsed(p), side: sideOf(p.team) })).filter((p) => p.t != null);
  if (!ev.length) return null;
  const now = Math.max(...ev.map((p) => p.t));
  const att = ev.filter((p) => ATTEMPTS.has(p.kind) && p.side);
  const w = { away: 0, home: 0 }, win = { away: 0, home: 0 };
  for (const a of att) {
    w[a.side] += Math.pow(0.5, (now - a.t) / HALF_LIFE);
    if (a.t > now - WINDOW) win[a.side] += 1;
  }
  const tot = w.away + w.home;
  const share = tot > 0.5 ? w.away / tot : 0.5;
  const lead = share >= 0.62 ? "away" : share <= 0.38 ? "home" : null;
  const name = { away, home };
  const live = box.state === "LIVE" || box.state === "CRIT";

  const mins = Math.max(60, Math.ceil(now / 60));
  const per = Array.from({ length: mins }, () => 0);
  for (const a of att) per[Math.min(mins - 1, Math.floor(Math.max(0, a.t - 0.001) / 60))] += a.side === "away" ? 1 : -1;
  const goals = att.filter((a) => a.kind === "goal");
  const top = Math.max(3, ...per.map(Math.abs));
  const bw = 100 / mins;
  const pLines = [20, 40, ...(mins > 60 ? [60] : [])];

  return (
    <div className="momentum">
      <div className="mo-head">
        <b>⚡ Momentum</b>
        <span className="mo-sub">Shot attempts, last 5 min: {away} {win.away} · {home} {win.home}</span>
      </div>
      <div className="mo-tug">
        <span className="mo-team" style={{ color: AWAY_C }}>{away}</span>
        <div className="mo-bar" role="img" aria-label={`Momentum: ${away} ${Math.round(share * 100)}%, ${home} ${Math.round((1 - share) * 100)}%`}>
          <span style={{ width: `${share * 100}%`, background: AWAY_C }} />
          <span style={{ width: `${(1 - share) * 100}%`, background: HOME_C }} />
          <i style={{ left: `${share * 100}%` }} />
        </div>
        <span className="mo-team r" style={{ color: HOME_C }}>{home}</span>
      </div>
      <div className="mo-lead">
        {lead ? <><b style={{ color: lead === "away" ? AWAY_C : HOME_C }}>{name[lead]}</b> {live ? "is pushing the play" : "finished with the push"}</> : "Even — neither team controlling the shots"}
      </div>
      <svg className="mo-flow" viewBox="0 0 100 30" preserveAspectRatio="none" role="img" aria-label="Pressure: shot-attempt margin by minute, goals as dots">
        <line x1="0" x2="100" y1="15" y2="15" stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {pLines.map((m) => <line key={m} x1={m * bw} x2={m * bw} y1="0" y2="30" stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
        {per.map((v, i) => (v ? (
          <rect key={i} x={i * bw + bw * 0.12} width={bw * 0.76} y={v > 0 ? 15 - (v / top) * 12 : 15} height={(Math.abs(v) / top) * 12} fill={v > 0 ? AWAY_C : HOME_C} />
        ) : null))}
        {live && <line x1={(now / 60) * bw} x2={(now / 60) * bw} y1="0" y2="30" stroke="var(--text)" strokeWidth="1" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className="mo-goals">
        {goals.map((g) => (
          <span key={g.id} className={`mo-goal ${g.side}`} style={{ left: `${(g.t / 60) * bw}%`, background: g.side === "away" ? AWAY_C : HOME_C }} title={`${g.team} goal · ${g.period === "OT" ? "OT" : `P${g.period}`} ${g.time}`} />
        ))}
      </div>
      <div className="mo-axis">
        {["1st", "2nd", "3rd"].map((p) => <span key={p} style={{ width: `${20 * bw}%` }}>{p}</span>)}
        {mins > 60 && <span style={{ width: `${(mins - 60) * bw}%` }}>OT</span>}
      </div>
      <div className="mo-note">Bars: shot attempts by minute ({away} above the line, {home} below); dots: goals. Context only — hot stretches barely carry within a game, so projections don't move with it.</div>
    </div>
  );
}
