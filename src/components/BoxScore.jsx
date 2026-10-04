import { useEffect, useRef, useState } from "react";
import { openSkaterSlide, openGoalieSlide } from "../slideouts.js";

// Full box score for one game, from /api/boxscore (api/boxscore.js). Refreshes every 30s while
// the game is live.
const POLL_MS = 30_000;
const LIVE = new Set(["LIVE", "CRIT"]);

const cell = { padding: "5px 8px", textAlign: "right" };
const left = { ...cell, textAlign: "left" };

function Linescore({ box }) {
  const cols = box.periods.length ? box.periods : [{ period: "1", away: 0, home: 0 }];
  return (
    <table className="data-table" style={{ width: "auto", minWidth: 320 }}>
      <thead>
        <tr>
          <th style={left}>Team</th>
          {cols.map((p) => <th key={p.period} style={cell}>{p.period}</th>)}
          <th style={cell}>T</th>
          <th style={cell}>SOG</th>
        </tr>
      </thead>
      <tbody>
        {["away", "home"].map((side) => (
          <tr key={side}>
            <td style={{ ...left, fontWeight: 700 }}>{box[side].abbrev}</td>
            {cols.map((p) => <td key={p.period} style={cell}>{p[side]}</td>)}
            <td style={{ ...cell, fontWeight: 700 }}>{box[side].score ?? "—"}</td>
            <td style={cell}>{box[side].sog ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SkaterTable({ t, poolById }) {
  const rows = [...t.skaters].sort((a, b) => b.points - a.points || b.goals - a.goals || b.sog - a.sog);
  return (
    <div className="table-wrap" style={{ marginTop: 6 }}>
      <table className="data-table">
        <thead>
          <tr>
            <th style={left}>{t.abbrev} skaters</th>
            {["G", "A", "P", "+/-", "SOG", "HIT", "BLK", "PIM", "TOI"].map((h) => <th key={h} style={cell}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.playerId}>
              <td
                className="clickable"
                style={left}
                onClick={() => openSkaterSlide(poolById?.get(p.playerId) || { playerId: p.playerId, name: p.name, team: t.abbrev })}
              >
                <span className="mono" style={{ color: "var(--muted)", fontSize: 10 }}>#{p.number} {p.position} </span>
                <span className="player-name-link">{p.name}</span>
              </td>
              <td style={cell}>{p.goals}</td>
              <td style={cell}>{p.assists}</td>
              <td style={{ ...cell, fontWeight: p.points ? 700 : 400 }}>{p.points}</td>
              <td style={cell}>{p.plusMinus > 0 ? `+${p.plusMinus}` : p.plusMinus}</td>
              <td style={cell}>{p.sog}</td>
              <td style={cell}>{p.hits}</td>
              <td style={cell}>{p.blocks}</td>
              <td style={cell}>{p.pim}</td>
              <td style={cell} className="mono">{p.toi}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GoalieTable({ t }) {
  if (!t.goalies.length) return null;
  return (
    <div className="table-wrap" style={{ marginTop: 6 }}>
      <table className="data-table">
        <thead>
          <tr>
            <th style={left}>{t.abbrev} goalies</th>
            {["SA", "SV", "GA", "SV%", "TOI"].map((h) => <th key={h} style={cell}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {t.goalies.map((g) => (
            <tr key={g.playerId}>
              <td className="clickable" style={left} onClick={() => openGoalieSlide({ playerId: g.playerId, name: g.name, team: t.abbrev })}>
                <span className="player-name-link">{g.name}</span>
              </td>
              <td style={cell}>{g.shotsAgainst}</td>
              <td style={cell}>{g.saves}</td>
              <td style={cell}>{g.goalsAgainst}</td>
              <td style={cell}>{g.savePct != null ? g.savePct.toFixed(3).replace(/^0/, "") : "—"}</td>
              <td style={cell} className="mono">{g.toi}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function BoxScore({ gameId, poolById, onClose, refreshKey = 0 }) {
  const [box, setBox] = useState(null);
  const [error, setError] = useState(null);
  const shownGame = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let timer = null;
    async function load() {
      try {
        const res = await fetch(`/api/boxscore?gameId=${gameId}`);
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || res.status);
        if (cancelled) return;
        setBox(body);
        setError(null);
        if (LIVE.has(body.state)) timer = setTimeout(load, POLL_MS);
      } catch (e) {
        if (!cancelled) setError(String(e.message || e));
      }
    }
    // A different game starts blank; the Live tab's ⟳ Refresh (refreshKey) reloads in place.
    if (shownGame.current !== gameId) {
      shownGame.current = gameId;
      setBox(null);
    }
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [gameId, refreshKey]);

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div className="section-title" style={{ fontSize: 18 }}>
          📋 Box Score{box ? ` — ${box.away.abbrev} @ ${box.home.abbrev}` : ""}
        </div>
        <button className="btn" onClick={onClose}>✕ Close</button>
      </div>
      {error && <div className="note" style={{ borderColor: "var(--red)", color: "var(--red)" }}>Box score error: {error}</div>}
      {!box && !error && <div className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>Loading box score…</div>}
      {box && (
        <>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
            <Linescore box={box} />
            {box.threeStars.length > 0 && (
              <div className="mono" style={{ fontSize: 11 }}>
                <div style={{ color: "var(--muted)", fontSize: 9, marginBottom: 4 }}>THREE STARS</div>
                {box.threeStars.map((s) => (
                  <div key={s.star}>{"★".repeat(s.star)} {s.name} ({s.team}) {s.goals}G {s.assists}A</div>
                ))}
              </div>
            )}
          </div>

          {box.scoring.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="mono" style={{ color: "var(--muted)", fontSize: 9, marginBottom: 4 }}>SCORING</div>
              {box.scoring.map((g, i) => (
                <div key={i} className="mono" style={{ fontSize: 11, padding: "3px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
                  <span style={{ color: "var(--muted)" }}>P{g.period} {g.time} </span>
                  <b>{g.team}</b> {g.scorer} ({g.goalsToDate})
                  {g.strength && g.strength !== "ev" ? <span style={{ color: "var(--accent2)" }}> {g.strength.toUpperCase()}</span> : null}
                  <span style={{ color: "var(--muted)" }}> {g.assists.length ? `from ${g.assists.join(", ")}` : "unassisted"} · {g.score}</span>
                </div>
              ))}
            </div>
          )}

          {["away", "home"].map((side) => (
            <div key={side} style={{ marginTop: 12 }}>
              <SkaterTable t={box[side]} poolById={poolById} />
              <GoalieTable t={box[side]} />
            </div>
          ))}
        </>
      )}
    </div>
  );
}
