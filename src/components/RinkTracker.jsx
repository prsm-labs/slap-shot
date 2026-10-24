import { useState } from "react";

// Game Tracker — the box score's play-by-play view. Draws a rink from the NHL play-by-play
// (api/live.js trackPlays): the "puck" is the last logged play's spot with a short trail, the
// shaded half shows who's attacking (whose offensive zone that play was in), and the recent plays
// are listed underneath. Coordinates arrive flipped so the HOME team always attacks to the right.
// It moves play to play (faceoffs, shots, hits, giveaways ...), not continuously, and refreshes
// with the box score (15s).

const ICE = "#e9eff4";
const RED = "#c8102e";
const BLUE = "#2f7dae";
const SHADE = "rgba(16,26,38,.5)";
const RINK = "M-72,-42.5 H72 A28,28 0 0 1 100,-14.5 V14.5 A28,28 0 0 1 72,42.5 H-72 A28,28 0 0 1 -100,14.5 V-14.5 A28,28 0 0 1 -72,-42.5 Z";
const DOTS = [[-69, 22], [-69, -22], [69, 22], [69, -22]];
const NEUTRAL_DOTS = [[-20, 22], [-20, -22], [20, 22], [20, -22]];

function periodName(p) {
  if (!p?.period) return "";
  if (p.periodType === "OT") return "OT";
  if (p.periodType === "SO") return "SO";
  return ["1st", "2nd", "3rd"][p.period - 1] || `P${p.period}`;
}

function Rink({ track, focus, clockText }) {
  const { home, away, attacking, trail } = track;
  const spot = focus || track.last;
  const homeAttacking = attacking === home;
  // shaded band from the attacking team's own end to just past center, pointing at the net they attack
  const band = homeAttacking
    ? "-100,-42.5 5,-42.5 25,0 5,42.5 -100,42.5"
    : "100,-42.5 -5,-42.5 -25,0 -5,42.5 100,42.5";
  const labelX = homeAttacking ? -45 : 45;
  return (
    <svg viewBox="-104 -52 208 104" style={{ width: "100%", maxWidth: 620, display: "block", margin: "0 auto" }} role="img"
      aria-label={attacking ? `${attacking} attacking` : "Neutral zone"}>
      <defs>
        <clipPath id="rink-clip"><path d={RINK} /></clipPath>
      </defs>
      <path d={RINK} fill={ICE} stroke="#1f3346" strokeWidth="2.2" />
      <g clipPath="url(#rink-clip)">
        {attacking && <polygon points={band} fill={SHADE} />}
        {/* goal lines, blue lines, center line */}
        {[-89, 89].map((x) => <line key={x} x1={x} x2={x} y1={-42.5} y2={42.5} stroke={RED} strokeWidth="0.6" opacity=".7" />)}
        {[-25, 25].map((x) => <line key={x} x1={x} x2={x} y1={-42.5} y2={42.5} stroke={BLUE} strokeWidth="1.6" opacity=".85" />)}
        <line x1={0} x2={0} y1={-42.5} y2={42.5} stroke={RED} strokeWidth="1.6" opacity=".8" />
        <circle cx={0} cy={0} r={15} fill="none" stroke={BLUE} strokeWidth="0.6" opacity=".8" />
        {DOTS.map(([x, y]) => (
          <g key={`${x}${y}`}>
            <circle cx={x} cy={y} r={15} fill="none" stroke={RED} strokeWidth="0.6" opacity=".6" />
            <circle cx={x} cy={y} r={1} fill={RED} opacity=".7" />
          </g>
        ))}
        {NEUTRAL_DOTS.map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r={1} fill={RED} opacity=".6" />)}
        {/* creases + nets */}
        <path d="M-89,-6 A6,6 0 0 1 -89,6 Z" fill="#9cc3dd" stroke={RED} strokeWidth="0.5" />
        <path d="M89,-6 A6,6 0 0 0 89,6 Z" fill="#9cc3dd" stroke={RED} strokeWidth="0.5" />
        <rect x={-93} y={-3} width={4} height={6} fill="none" stroke="#555" strokeWidth="0.6" />
        <rect x={89} y={-3} width={4} height={6} fill="none" stroke="#555" strokeWidth="0.6" />
        {attacking && (
          <g style={{ pointerEvents: "none" }}>
            <text x={labelX} y={-3} textAnchor="middle" fontSize="7" fill="#fff" fontFamily="Inter,sans-serif">Attacking</text>
            <text x={labelX} y={8} textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff" fontFamily="Oswald,sans-serif">{attacking}</text>
          </g>
        )}
        {/* trail of recent plays */}
        {!focus && trail.length > 1 && (
          <polyline points={trail.map((p) => `${p.x},${-p.y}`).join(" ")} fill="none" stroke="#111" strokeWidth="0.5" strokeDasharray="1.5 1.5" opacity=".35" />
        )}
        {!focus && trail.slice(0, -1).map((p, i) => (
          <circle key={p.id} cx={p.x} cy={-p.y} r={1.4} fill="#111" opacity={0.15 + (0.35 * (i + 1)) / trail.length} />
        ))}
        {spot && (
          <g>
            <circle cx={spot.x} cy={-spot.y} r="3" fill="none" stroke={spot.type === "goal" ? RED : "#111"} strokeWidth="0.8">
              <animate attributeName="r" values="2.5;7;2.5" dur="1.8s" repeatCount="indefinite" />
              <animate attributeName="opacity" values=".9;0;.9" dur="1.8s" repeatCount="indefinite" />
            </circle>
            <circle cx={spot.x} cy={-spot.y} r="2.6" fill={spot.type === "goal" ? RED : "#000"} />
          </g>
        )}
      </g>
      {/* clock pill */}
      {clockText && (
        <g>
          <rect x={-26} y={-51} width={52} height={10} rx={5} fill="#1f3346" />
          <text x={0} y={-43.6} textAnchor="middle" fontSize="6" fill="#fff" fontFamily="'JetBrains Mono',monospace">{clockText}</text>
        </g>
      )}
      <text x={-98} y={50} fontSize="5" fill="var(--muted)" fontFamily="'JetBrains Mono',monospace">◀ {away} attacks this way</text>
      <text x={98} y={50} textAnchor="end" fontSize="5" fill="var(--muted)" fontFamily="'JetBrains Mono',monospace">{home} attacks this way ▶</text>
    </svg>
  );
}

export default function RinkTracker({ box }) {
  const track = box.track;
  const [focusId, setFocusId] = useState(null);
  if (!track) return <div className="mono" style={{ color: "var(--muted)", fontSize: 12, marginTop: 10 }}>Play-by-play isn't available for this game yet.</div>;
  const live = ["LIVE", "CRIT"].includes(box.state);
  const focus = focusId != null ? track.plays.find((p) => p.id === focusId && p.x != null) || null : null;
  const latest = track.latest;
  const clockText = live
    ? box.clock?.inIntermission ? `${periodName(latest)} INT` : `${periodName(latest)} | ${box.clock?.timeRemaining ?? latest?.remaining ?? ""}`
    : ["FINAL", "OFF"].includes(box.state) ? "FINAL" : "";
  const shown = focus || track.last;
  return (
    <div style={{ marginTop: 10 }}>
      <Rink track={track} focus={focus} clockText={clockText} />
      <div className="mono" style={{ fontSize: 11, textAlign: "center", marginTop: 6 }}>
        {shown ? (
          <>
            <span style={{ color: "var(--muted)" }}>{focus ? "Showing" : "Last play"} · {periodName(shown)} {shown.time} · </span>
            {shown.team && <b>{shown.team} </b>}{shown.label}
            {focus && <button className="pill-btn" style={{ marginLeft: 8 }} onClick={() => setFocusId(null)}>back to live</button>}
          </>
        ) : <span style={{ color: "var(--muted)" }}>Waiting for the first play…</span>}
        {!focus && latest && latest.x == null && latest.id !== shown?.id && (
          <div style={{ color: "var(--muted)", marginTop: 2 }}>Now: {latest.label}</div>
        )}
      </div>

      <div className="mono" style={{ color: "var(--muted)", fontSize: 9, margin: "12px 0 4px" }}>RECENT PLAYS (tap one to see where it happened)</div>
      <div style={{ maxHeight: 320, overflowY: "auto" }}>
        {track.plays.map((p) => {
          const active = focusId === p.id;
          return (
            <div
              key={p.id}
              className="mono"
              onClick={() => p.x != null && setFocusId(active ? null : p.id)}
              style={{
                fontSize: 11, padding: "4px 6px", borderBottom: "1px solid var(--line)",
                cursor: p.x != null ? "pointer" : "default",
                background: active ? "rgba(74,159,212,.15)" : p.type === "goal" ? "rgba(200,16,46,.12)" : undefined,
                fontWeight: p.type === "goal" ? 700 : 400,
              }}
            >
              <span style={{ color: "var(--muted)", display: "inline-block", minWidth: 74 }}>{periodName(p)} {p.time}</span>
              <span style={{ display: "inline-block", minWidth: 36 }}>{p.team || ""}</span>
              {p.label}
            </div>
          );
        })}
      </div>
      <div className="mono" style={{ fontSize: 9, color: "var(--muted)", marginTop: 8 }}>
        The puck is the last logged play (faceoffs, shots, hits, giveaways, takeaways, goals, penalties) from the NHL play-by-play,
        refreshed every 15s while the game is live — it jumps play to play and runs behind the broadcast. Shading = the team whose
        offensive zone that play was in.
      </div>
    </div>
  );
}
