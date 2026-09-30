import { useEffect, useState } from "react";
import { fetchScoredPool } from "../lib/data.js";
import { useSort } from "../lib/useSort.js";
import { openSkaterSlide } from "../slideouts.js";
import PlayerAvatar from "../components/PlayerAvatar.jsx";
import GradeBadge from "../components/GradeBadge.jsx";
import OpponentGoalieCell from "../components/OpponentGoalieCell.jsx";

const TIER_CLASS = {
  "Elite Add-On": "tier-elite",
  "Core Target": "tier-core",
  "Value Upside": "tier-value",
  Ignore: "tier-ignore",
};

// Matchup-first columns — deliberately NOT a season-stat dump (that's what Splits is for).
// Every row answers "who are they facing and how does that change things," per direct user
// feedback: goalies should read like a pitcher matchup, not a footnote.
const COLUMNS = [
  ["name", "Skater"],
  ["opponentGoalie", "Opp Goalie"],
  ["effectiveGrade", "Eff. Grade"],
  ["slapScore", "Slap Score"],
  ["tier", "Tier"],
];

function startTime(utc) {
  return new Date(utc).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function slateHeading(meta) {
  const day = new Date(`${meta.slateDate}T12:00:00`).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
  const later = meta.requestedDate && meta.slateDate !== meta.requestedDate ? " (next day with games)" : "";
  return `${day}${later} · ${meta.slate.length} games`;
}

function SlateStrip({ meta }) {
  if (!meta?.slate?.length) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6, letterSpacing: 0.5 }}>
        {slateHeading(meta).toUpperCase()}
      </div>
      <div className="grid-cards">
        {meta.slate.map((g) => (
          <div className="card" key={g.gameId} style={{ padding: "10px 12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ fontFamily: "'Oswald',sans-serif", fontWeight: 700, fontSize: 16 }}>{g.away} @ {g.home}</span>
              <span className="mono" style={{ fontSize: 10, color: "var(--muted)" }}>{startTime(g.startTimeUTC)}</span>
            </div>
            <div className="mono" style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>
              {g.awayGoalie || "—"} ({g.awayGoalieStatus}) vs {g.homeGoalie || "—"} ({g.homeGoalieStatus})
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AllMatchupsTab() {
  const [players, setPlayers] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchScoredPool()
      .then(({ players, meta }) => {
        setPlayers(players);
        setMeta(meta);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const { sorted, sortKey, sortDir, toggleSort } = useSort(players || [], "slapScore", "desc");

  return (
    <div>
      <div className="section-header">
        <div className="section-title">🏒 All Matchups</div>
        <div className="section-sub">Today's slate, ranked by matchup — skater vs. the goalie they're actually facing</div>
      </div>

      <div className="note">
        ℹ️ Ranked by Slap Score, a single 0-99 score blending recent form, shot quality, and this specific goalie matchup.
        Goalies marked Projected are not yet confirmed starters.
      </div>
      <SlateStrip meta={meta} />
      {error && <div className="note" style={{ borderColor: "var(--red)", color: "var(--red)" }}>Failed to load pool: {error}</div>}
      {!players && !error && <div className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>Loading and scoring pool…</div>}

      {players && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {COLUMNS.map(([key, label]) => (
                  <th key={key} className={sortKey === key ? "sorted" : ""} onClick={() => key !== "opponentGoalie" && toggleSort(key)}>
                    {label}{sortKey === key ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr key={p.playerId}>
                  <td className="clickable" onClick={() => openSkaterSlide(p)}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <PlayerAvatar playerId={p.playerId} name={p.name} team={p.team} size={28} />
                      <div>
                        <span className="player-name-link">{p.name}</span>
                        <div className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>{p.team}</div>
                      </div>
                    </div>
                  </td>
                  <td><OpponentGoalieCell player={p} /></td>
                  <td><GradeBadge grade={p.effectiveGrade} /></td>
                  <td>{p.slapScore}</td>
                  <td><span className={`tier-pill ${TIER_CLASS[p.tier] || "tier-ignore"}`}>{p.tier}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
