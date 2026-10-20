const BUILD_TIMESTAMP = "2026-07-31 00:31 ET";

export default function AboutTab() {
  return (
    <div>
      <div className="section-header">
        <div className="section-title">📌 About</div>
        <div className="section-sub">Layered probability engine for NHL goal/point prediction</div>
      </div>

      <div className="card">
        <div className="mono" style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.8 }}>
          <div><span style={{ color: "var(--text)" }}>App:</span> Slap Shot</div>
          <div><span style={{ color: "var(--text)" }}>Domain:</span> shot.prsmlabs.app</div>
          <div><span style={{ color: "var(--text)" }}>Build:</span> {BUILD_TIMESTAMP}</div>
        </div>
      </div>

      <div className="card">
        <div className="mono" style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.8 }}>
          Scoring stack (Ice Sig / Snipe Score / Breakaway Score / gGOAL / Slap Score) is ported
          from the real project_nhl.pbix DAX model, not invented from scratch — see
          nhl_project/claude/slap-shot-build.md §3 for the full lineage and flagged gaps.
          <ul style={{ marginTop: 8, marginLeft: 18 }}>
            <li>All Matchups board — full pool sorted by Slap Score</li>
            <li>Lamp Lab / Apple Lab — Monte Carlo goal / point sims</li>
            <li>Track Record — real hit-rate history, Mar 2026</li>
            <li>Stats — every skater, goalie and team game by game (this season + last), filterable and searchable; context only</li>
            <li>💎 PRISM Picks (top of Cheat Sheets) — tonight's few props with the highest tested hit rates that aren't the obvious ones:
              1+ point, 2+ or 3+ shots on goal at a 70%+ model chance, where the skater had it in 80% or fewer of his last 20 games and
              the model sees at least 5 points more tonight (one per player, 2 per game, up to 5). Backtest 2023-24 to 2025-26:
              1,262 of 1,649 hit (77%); this season from the locked snapshots: shown on the card. The big number is the track
              record at that chance, not the raw model chance.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
