import { useState } from "react";

// A goalie's recent games as bars (from /api/player): saves, shots against, goals allowed, save %.
// Same plain-div style as L7Chart; date, opponent and decision under each bar, a season divider
// when the run crosses into last season, and the average over the games shown.
const VIEWS = [
  { key: "saves", label: "🧤 Saves", get: (g) => g.saves, fmt: (v) => v, avg: (v) => v.toFixed(1) },
  { key: "sa", label: "🏒 Shots against", get: (g) => g.sa, fmt: (v) => v, avg: (v) => v.toFixed(1) },
  { key: "ga", label: "🚨 Goals allowed", get: (g) => g.ga, fmt: (v) => v, avg: (v) => v.toFixed(2) },
  { key: "sv", label: "📈 Save %", get: (g) => g.svPct, fmt: (v) => (v == null ? "—" : v.toFixed(3).replace(/^0/, "")), avg: (v) => v.toFixed(3).replace(/^0/, "") },
];
const BAR_H = 110;
const SV_FLOOR = 0.8; // save % bars start at .800 so differences are visible

const dateLabel = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const seasonLabel = (s) => `${String(s).slice(0, 4)}-${String(s).slice(6, 8)}`;

export default function GoalieGameChart({ games }) {
  const [key, setKey] = useState("saves");
  const view = VIEWS.find((v) => v.key === key);
  if (!games?.length) return <div className="mono" style={{ fontSize: 11, color: "var(--muted)", padding: "8px 0" }}>No NHL games yet.</div>;

  const vals = games.map(view.get);
  const shown = vals.filter((v) => v != null);
  let avg = shown.reduce((a, b) => a + b, 0) / Math.max(shown.length, 1);
  if (key === "sv") {
    const sa = games.reduce((a, g) => a + g.sa, 0);
    avg = sa ? games.reduce((a, g) => a + g.saves, 0) / sa : 0;
  }
  const height = (v) => {
    if (v == null) return 2;
    if (key === "sv") return Math.max(3, Math.round(BAR_H * Math.max(0, (v - SV_FLOOR) / (1 - SV_FLOOR))));
    const max = Math.max(...shown, 1);
    return Math.max(3, Math.round(BAR_H * (v / max)));
  };
  // Bars at or better than the goalie's own average in this window are bright; worse ones dim.
  const better = (v) => (v == null ? false : key === "ga" ? v <= avg : v >= avg);

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        <div className="pill-row" style={{ flexWrap: "wrap" }}>
          {VIEWS.map((v) => (
            <button key={v.key} className={`pill-btn ${key === v.key ? "active" : ""}`} onClick={() => setKey(v.key)}>{v.label}</button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>avg, last {games.length}</span>
          <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 800, fontSize: 18 }}>{view.avg(avg)}</span>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: BAR_H + 16 }}>
        {games.map((g, i) => {
          const v = vals[i];
          const newSeason = i > 0 && g.season !== games[i - 1].season;
          return (
            <div key={g.gameId} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", gap: 2, borderLeft: newSeason ? "1px dashed var(--accent2)" : "none", paddingLeft: newSeason ? 2 : 0 }}>
              <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: better(v) ? "var(--accent2)" : "var(--muted)" }}>{view.fmt(v)}</span>
              <div style={{
                width: "100%", borderRadius: "4px 4px 0 0", height: height(v),
                background: better(v) ? "linear-gradient(180deg,var(--accent2),var(--accent))" : "rgba(74,159,212,.22)",
              }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
        {games.map((g) => (
          <div key={g.gameId} className="mono" style={{ flex: 1, textAlign: "center", fontSize: 9, lineHeight: 1.3, color: "var(--muted)", minWidth: 0 }}>
            <div>{dateLabel(g.date)}</div>
            <div style={{ color: "var(--text)", whiteSpace: "nowrap" }}>{g.home ? "vs" : "@"}{g.opp}</div>
            <div>{g.started ? g.decision || "—" : "relief"}</div>
          </div>
        ))}
      </div>
      {games.some((g, i) => i > 0 && g.season !== games[i - 1].season) && (
        <div className="mono" style={{ fontSize: 9, color: "var(--muted)", marginTop: 6 }}>
          Dashed line = start of the {seasonLabel(games[games.length - 1].season)} season; games left of it are {seasonLabel(games[0].season)}.
        </div>
      )}
    </div>
  );
}
