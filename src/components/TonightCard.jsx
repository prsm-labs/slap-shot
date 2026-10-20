import { fmtToi } from "../lib/toi.js";

// 2026-10-20 live slideout: tonight's line at the top of the skater / goalie slideout while the game is on (15 s
// refresh, lib/tonightLine.js) and after it ends, next to what Slap Shot expected before puck drop.
function Tile({ label, value, sub, good }) {
  return (
    <div className="score-box" style={{ minWidth: 0, borderColor: good ? "var(--green)" : undefined, background: good ? "rgba(46,204,113,.10)" : undefined }}>
      <span className="num mono">{value ?? "—"}</span>
      <span className="lbl">{label}</span>
      {sub && <span className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>{sub}</span>}
    </div>
  );
}

const periodText = (t) => {
  if (t.done) return "Final";
  if (t.clock?.inIntermission) return `End of ${t.period}`;
  return `${/^\d$/.test(t.period) ? `P${t.period}` : t.period} ${t.clock?.timeRemaining || ""}`.trim();
};

export default function TonightCard({ t, p, role }) {
  if (!t || !t.started) return null;
  const s = t.skater, g = t.goalie;
  const score = `${t.away.abbrev} ${t.away.score ?? 0} – ${t.home.abbrev} ${t.home.score ?? 0}`;
  return (
    <div className="card" style={{ marginTop: 12, borderColor: t.live ? "var(--green)" : undefined }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <span className="mono" style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: t.live ? "var(--green)" : "var(--muted)" }}>
          {t.live ? "● LIVE" : "FINAL"}
        </span>
        <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 700, fontSize: 16 }}>{score}</span>
        {t.live && <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>{periodText(t)}</span>}
      </div>
      {role === "skater" && !s && <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>Not in tonight's box score (scratched or not dressed).</div>}
      {role === "goalie" && !g && <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>Hasn't played tonight.</div>}
      {role === "skater" && s && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6 }}>
            <Tile label="Goals" value={s.goals} sub={p?.gGoal != null ? `${p.gGoal}% chance` : null} good={s.goals > 0} />
            <Tile label="Assists" value={s.assists} />
            <Tile label="Points" value={s.points} sub={p?.anytimePointPct != null ? `${p.anytimePointPct}% chance` : null} good={s.points > 0} />
            <Tile label="SOG" value={s.sog} sub={p?.ShotsOnGoalPerGame != null ? `avg ${p.ShotsOnGoalPerGame}` : null} good={s.sog >= 3} />
          </div>
          <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
            TOI {s.toi || "—"}{p?.estToi ? ` (est. ${fmtToi(p.estToi)})` : ""} · +/- {s.plusMinus > 0 ? `+${s.plusMinus}` : s.plusMinus} · Hits {s.hits} · Blocks {s.blocks} · PIM {s.pim}
            {s.ppGoals ? ` · PPG ${s.ppGoals}` : ""}{s.faceoffPct ? ` · FO ${Math.round(s.faceoffPct * 100)}%` : ""}
          </div>
          {t.goals.length > 0 && (
            <div className="mono" style={{ fontSize: 11, marginTop: 6 }}>
              {t.goals.map((x, i) => <div key={i}>🚨 P{x.period} {x.time}{x.strength && x.strength !== "ev" ? ` ${x.strength.toUpperCase()}` : ""} · {x.assists.length ? `from ${x.assists.join(", ")}` : "unassisted"} · {x.score}</div>)}
            </div>
          )}
        </>
      )}
      {role === "goalie" && g && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6 }}>
          <Tile label="Saves" value={g.saves} />
          <Tile label="Shots against" value={g.shotsAgainst} />
          <Tile label="Goals against" value={g.goalsAgainst} />
          <Tile label="SV%" value={g.savePct != null ? g.savePct.toFixed(3).replace(/^0/, "") : "—"} good={g.savePct != null && g.savePct >= 0.9} sub={`TOI ${g.toi || "—"}`} />
        </div>
      )}
      <div className="mono" style={{ fontSize: 9, color: "var(--muted)", marginTop: 8 }}>
        {t.live ? "Tonight, live from the NHL feed — updates every 15 seconds." : "Tonight's final line."}{role === "skater" ? " Tonight is the outlined last bar on the chart below." : ""}
      </div>
    </div>
  );
}
