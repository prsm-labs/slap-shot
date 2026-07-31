import { useEffect, useState } from "react";

export default function LiveThemesTab() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch("/data/live_themes.json").then((r) => r.json()).then(setData);
  }, []);

  return (
    <div>
      <div className="section-header">
        <div className="section-title">⚡ Live Themes</div>
        <div className="section-sub">Goal-scoring-play clustering — same gap-based-clustering pattern as Going Yard / Six Points</div>
      </div>

      {data && (
        <div className="note">
          ℹ️ {data._meta.note}
        </div>
      )}
      {!data && <div className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>Loading…</div>}

      {data && (
        <div className="grid-cards">
          {data.flurries.map((f, i) => (
            <div className="card" key={i}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{f.team} — {f.goals.length}-goal flurry</div>
              <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginBottom: 8 }}>
                Period {f.period} · {f.gapSeconds}s span · Game {f.gameId}
              </div>
              {f.goals.map((name, j) => (
                <div key={j} className="mono" style={{ fontSize: 12, padding: "3px 0" }}>{name}</div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
