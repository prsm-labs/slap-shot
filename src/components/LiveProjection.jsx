import { useEffect, useState } from "react";
import { openSkaterSlide } from "../slideouts.js";
import { restOfGame, ratio, chanceAtLeast } from "../lib/liveModel.js";

// 2026-10-20 📈 Live projection (user): each skater's projected final line from where the game stands = what he has now +
// a normal rest of the game (his pre-game rate x time left, nudged by his shot attempts so far and the score -- leading by
// 1-2 late adds goals, trailing cuts them). Finishing luck is not carried forward: tested 2022-26, about 3% of a hot / cold
// shooting % carries into the rest of a game, and projecting from the current pace was worse than ignoring the game.
// Team line: our pre-game expected goals (projections/<date>.json) x time left with the same score-state terms.
const cell = { padding: "5px 8px", textAlign: "right" };
const left = { ...cell, textAlign: "left" };
const pctTxt = (p) => (p == null ? "—" : p >= 0.995 ? "✓" : `${Math.round(p * 100)}%`);
const lam = (pct) => (pct == null ? null : -Math.log(Math.max(1e-6, 1 - Math.min(pct / 100, 0.999))));

export function gameFraction(box) {
  const n = box.periodNumber || 1;
  if (["OFF", "FINAL"].includes(box.state)) return 1;
  if (n > 3) return 0.99;
  const left = box.clock?.inIntermission ? 0 : box.clock?.secondsRemaining ?? 1200;
  return Math.min(1, Math.max(0, ((n - 1) * 1200 + (1200 - left)) / 3600));
}

function useTeamXg(date, gameId) {
  const [g, setG] = useState(null);
  useEffect(() => {
    if (!date) return;
    fetch(`/data/projections/${date}.json`).then((r) => (r.ok ? r.json() : null))
      .then((d) => setG((d?.games || []).find((x) => String(x.gameId) === String(gameId)) || null)).catch(() => setG(null));
  }, [date, gameId]);
  return g;
}

const scoreZ = (margin) => {
  const m = Math.max(-3, Math.min(3, margin));
  return { z_m: m, z_lead12: m === 1 || m === 2 ? 1 : 0, z_trail: m < 0 ? 1 : 0 };
};

function projSkater(s, p, f, margin) {
  // the live box score has shots on goal, not attempts: volume = SOG so far vs his SOG per game
  const sogPre = p?.sogPg ?? p?.ShotsOnGoalPerGame;
  const z = { ...scoreZ(margin), z_vol: ratio(s.sog, f, sogPre, 2) };
  const gPre = lam(p?.anytimeGoalPct);
  const ptPre = lam(p?.anytimePointPct);
  const rs = restOfGame("sog", sogPre, f, z);
  const rg = restOfGame("g", gPre, f, z);
  // points follow the team's scoring: team-goal score-state terms on his pre-game point rate
  const rp = restOfGame("team_goals", ptPre, f, z);
  return {
    sog: s.sog + rs.mean, goals: s.goals + rg.mean, points: s.points + rp.mean,
    goalChance: s.goals > 0 ? 1 : chanceAtLeast(1, rg), pointChance: s.points > 0 ? 1 : chanceAtLeast(1, rp),
    sog3: chanceAtLeast(3 - s.sog, rs),
    pre: { goal: p?.anytimeGoalPct != null ? p.anytimeGoalPct / 100 : null, point: p?.anytimePointPct != null ? p.anytimePointPct / 100 : null, sog: sogPre, sog3: p?.modelProbs?.sog3 ?? null },
  };
}

function Team({ t, margin, f, poolById }) {
  const rows = t.skaters.map((s) => ({ s, p: poolById?.get(s.playerId) })).filter((x) => x.p)
    .map((x) => ({ ...x, j: projSkater(x.s, x.p, f, margin) })).sort((a, b) => b.j.goalChance - a.j.goalChance || b.j.points - a.j.points);
  const noProj = t.skaters.length - rows.length;
  return (
    <div className="table-wrap" style={{ marginTop: 10 }}>
      <table className="data-table">
        <thead>
          <tr>
            <th style={left}>{t.abbrev}</th>
            <th style={cell} title="Shots on goal now → projected final (pre-game average)">SOG</th>
            <th style={cell} title="Chance of 3+ shots on goal: now (pre-game)">3+ SOG</th>
            <th style={cell} title="Goals now → projected final">G</th>
            <th style={cell} title="Chance he scores (or has scored): now (pre-game)">Goal %</th>
            <th style={cell} title="Points now → projected final">P</th>
            <th style={cell} title="Chance of a point: now (pre-game)">Point %</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ s, p, j }) => (
            <tr key={s.playerId}>
              <td className="clickable" style={left} onClick={() => openSkaterSlide(p)}>
                <span className="mono" style={{ color: "var(--muted)", fontSize: 10 }}>{s.position} </span><span className="player-name-link">{s.name}</span>
              </td>
              <td style={cell} className="mono">{s.sog} → <b>{j.sog.toFixed(1)}</b> <span style={{ color: "var(--muted)" }}>({j.pre.sog != null ? j.pre.sog.toFixed(1) : "—"})</span></td>
              <td style={cell} className="mono"><b>{pctTxt(j.sog3)}</b> <span style={{ color: "var(--muted)" }}>({pctTxt(j.pre.sog3)})</span></td>
              <td style={cell} className="mono">{s.goals} → <b>{j.goals.toFixed(2)}</b></td>
              <td style={{ ...cell, color: s.goals > 0 ? "var(--green)" : undefined }} className="mono"><b>{pctTxt(j.goalChance)}</b> <span style={{ color: "var(--muted)" }}>({pctTxt(j.pre.goal)})</span></td>
              <td style={cell} className="mono">{s.points} → <b>{j.points.toFixed(2)}</b></td>
              <td style={{ ...cell, color: s.points > 0 ? "var(--green)" : undefined }} className="mono"><b>{pctTxt(j.pointChance)}</b> <span style={{ color: "var(--muted)" }}>({pctTxt(j.pre.point)})</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      {noProj > 0 && <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>{noProj} skater{noProj === 1 ? "" : "s"} without a pre-game projection not shown.</div>}
    </div>
  );
}

export default function LiveProjection({ box, poolById, date }) {
  const xg = useTeamXg(date, box.gameId);
  const f = gameFraction(box);
  const done = ["OFF", "FINAL"].includes(box.state);
  const m = (box.away.score ?? 0) - (box.home.score ?? 0);
  const team = (side, pre, margin) => {
    const r = restOfGame("team_goals", pre, f, scoreZ(margin));
    return { now: box[side].score ?? 0, proj: (box[side].score ?? 0) + r.mean };
  };
  const a = xg ? team("away", xg.xgAway, m) : null;
  const h = xg ? team("home", xg.xgHome, -m) : null;
  return (
    <div>
      <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>
        {done ? "Final — projections are the final line." : `${Math.round(f * 100)}% of regulation played.`} Projected final = what each player has now + a normal rest of the game
        (his pre-game rate × time left, nudged by his shot attempts and the score). Hot or cold finishing is not carried forward. Grey = pre-game.
      </div>
      {a && h && (
        <div className="card" style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
          <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>PROJECTED FINAL (regulation)</span>
          <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 700, fontSize: 18 }}>
            {box.away.abbrev} {a.proj.toFixed(1)} – {box.home.abbrev} {h.proj.toFixed(1)}
          </span>
          <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>total {(a.proj + h.proj).toFixed(1)} · pre-game {xg.xgAway.toFixed(1)} – {xg.xgHome.toFixed(1)}</span>
        </div>
      )}
      <Team t={box.away} margin={m} f={f} poolById={poolById} />
      <Team t={box.home} margin={-m} f={f} poolById={poolById} />
      <div className="mono" style={{ fontSize: 9, color: "var(--muted)", marginTop: 8 }}>
        Backtest (2022-26, held out by season): after two periods, 2.6% of a skater's hot / cold shooting % carries into the 3rd; the live model beats the pre-game rate alone by ~1% and "current pace" by far. Leading by 1-2 after two adds ~0.15 goals in the 3rd (empty nets); trailing cuts it.
      </div>
    </div>
  );
}
