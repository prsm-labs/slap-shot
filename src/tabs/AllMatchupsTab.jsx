import { useScoredPool } from "../lib/data.js";
import { useSort } from "../lib/useSort.js";
import { openSkaterSlide } from "../slideouts.js";
import PickButton from "../components/PickButton.jsx";
import DueTag from "../components/DueTag.jsx";
import H2HCell, { H2HStatCell } from "../components/H2HCell.jsx";
import { SKATER_H2H_COLS, useH2HGrades, withH2H } from "../lib/h2h.js";
import PlayerAvatar from "../components/PlayerAvatar.jsx";
import GradeBadge from "../components/GradeBadge.jsx";
import OpponentGoalieCell from "../components/OpponentGoalieCell.jsx";
import ListFilters from "../components/ListFilters.jsx";
import { applyListFilters, useListFilters } from "../lib/listFilters.js";
import PositionFilter from "../components/PositionFilter.jsx";
import { filterPositions, positionLabel, usePosition } from "../lib/positionFilter.js";
import { fmtToi } from "../lib/toi.js";
import { filterPlayers, useMatchup } from "../lib/matchupFilter.js";
import MatchupFilter from "../components/MatchupFilter.jsx";
import { dvpFor, dvpText } from "../lib/dvp.js";

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
  ["estToi", "Est. TOI"],
  ["sogPg", "SOG/GP", "Shots on goal per game, last season + this season"],
  ["sog60", "SOG/60", "Shots on goal per 60 minutes of ice time"],
  ["gradeScore", "Grade"],
  ["slapScore", "Slap Score"],
  ["bookBest", "Book Odds", "Best anytime-goal price across US sportsbooks (hover for each book). Priced once per game at the last pipeline run before puck drop"],
  ["edge", "Edge", "Our goal % minus the chance the best book price implies (vig included). Positive = we rate him higher than the book. Note: our A/A+ goal % have run a few points high this season"],
  ["multiGoalPct", "2+ Goals %", "Chance of 2+ goals tonight: model goal chance (top scorers bent down — they get a second goal less often than a simple Poisson says) + opponent's expected goals allowed"],
  ["tier", "Tier"],
  ["dvpSoft", "D vs Pos", "What tonight's opponent allows to this position per game (rank of 32, 1 = most) — context only: the position split wasn't predictive beyond overall defense (▲ / ▼ on the grade)"],
  ["h2hScore", "H2H", "H2H grade vs tonight's opponent — hover a grade for the history (context, not a prediction)"],
  ...SKATER_H2H_COLS.map(([k, , label, title]) => [k, label, title]),
];

function slateHeading(meta) {
  const day = new Date(`${meta.slateDate}T12:00:00`).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  const later = meta.requestedDate && meta.slateDate !== meta.requestedDate ? " (next day)" : "";
  return `${day}${later} · ${meta.slate.length} games`;
}

const fmtAmerican = (v) => (v > 0 ? `+${v}` : `${v}`);

export default function AllMatchupsTab() {
  // Live slate pool (lib/data.js): goalies, scratches and scores follow lineup news.
  const pool = useScoredPool();
  const players = pool?.players ?? null;
  const meta = pool?.meta ?? null;
  const selected = useMatchup();
  const position = usePosition();

  const listFilters = useListFilters();
  const h2hGrades = useH2HGrades();
  const shown = applyListFilters(filterPositions(filterPlayers(players, selected), position), listFilters, { slate: players, signal: "goal", h2h: h2hGrades.skaters });
  // H2H grade + goal-game rates (vs team / goalie / venue / L5 / L10) for sorting; missing = sorts last.
  const rows = withH2H(shown, h2hGrades).map((p) => {
    const dvp = dvpFor(meta, p);
    return { ...p, dvp, dvpSoft: dvp ? dvp.of + 1 - dvp.rank : null };
  });
  const { sorted, sortKey, sortDir, toggleSort } = useSort(rows, "slapScore", "desc");

  return (
    <div>
      <div className="section-header">
        <div className="section-title">🏒 All Matchups</div>
        <div className="section-sub">Today's slate, ranked by matchup — skater vs. the goalie they're actually facing</div>
      </div>

      <div className="note">
        ℹ️ Ranked by Slap Score (0-99): where each skater's chance to score ranks on tonight's slate — the calibrated grade model, adjusted for the opponent's defense. Tiers: Elite Add-On 90+, Core Target 70-89, Value Upside 50-69.
        Goalies and scratches update as lineups are confirmed (✅ = confirmed or in net); Projected / Expected are not yet confirmed.
        <span style={{ display: "block", marginTop: 4 }}>
          ▲ / ▼ on a grade = facing one of tonight's softest / stingiest third of defenses (expected goals allowed). Defense-vs-position
          splits aren't used — over 4 seasons they only echoed the team's overall defense. Hover a grade or open a player for details.
        </span>
      </div>
      {meta?.slate?.length > 0 && <MatchupFilter label={slateHeading(meta)} />}
      <PositionFilter />
      <ListFilters signalLabel="★ Goal Signals only" shown={shown?.length} total={players?.length} />
      {!players && <div className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>Loading and scoring pool…</div>}

      {players && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {COLUMNS.map(([key, label, title]) => (
                  <th key={key} title={title} className={sortKey === key ? "sorted" : ""} onClick={() => key !== "opponentGoalie" && toggleSort(key)}>
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
                        <span className="player-name-link">{p.name}</span> <PickButton player={p} /><DueTag due={p.dueHeat} />
                        <div className="mono" style={{ fontSize: 9, color: "var(--muted)" }}>{p.team} · {positionLabel(p.position)} · {fmtToi(p.estToi)} TOI</div>
                      </div>
                    </div>
                  </td>
                  <td><OpponentGoalieCell player={p} /></td>
                  <td className="mono">{fmtToi(p.estToi)}</td>
                  <td className="mono">{p.sogPg != null ? p.sogPg.toFixed(2) : "—"}</td>
                  <td className="mono">{p.sog60 != null ? p.sog60.toFixed(2) : "—"}</td>
                  <td><GradeBadge grade={p.effectiveGrade} /></td>
                  <td>{p.slapScore}</td>
                  <td className="mono" title={p.book ? Object.entries(p.book.books).map(([b, v]) => `${b} ${fmtAmerican(v)}`).join(" · ") + (p.book.open ? ` — opened ${fmtAmerican(p.book.open.best)} ${p.book.open.bestBook}` : "") : "No sportsbook price"} style={{ whiteSpace: "nowrap" }}>
                    {p.book ? <>{fmtAmerican(p.book.best)} <span style={{ color: "var(--muted)", fontSize: 10 }}>{p.book.bestBook}</span></> : "—"}
                  </td>
                  <td className="mono" title={p.book ? `Ours ${p.anytimeGoalPct}% vs book ${p.book.bestImplied}% (${fmtAmerican(p.book.best)})` : undefined}
                    style={{ color: p.edge == null ? undefined : p.edge >= 3 ? "var(--accent2)" : p.edge < 0 ? "var(--muted)" : undefined, fontWeight: p.edge >= 3 ? 700 : undefined }}>
                    {p.edge == null ? "—" : `${p.edge > 0 ? "+" : ""}${p.edge.toFixed(1)}`}
                  </td>
                  <td>{p.multiGoalPct != null ? `${p.multiGoalPct}%` : "—"}</td>
                  <td><span className={`tier-pill ${TIER_CLASS[p.tier] || "tier-ignore"}`}>{p.tier}</span></td>
                  <td className="mono" title={dvpText(p.dvp)} style={{ fontSize: 11, whiteSpace: "nowrap" }}>
                    {p.dvp ? <>#{p.dvp.rank} <span style={{ color: "var(--muted)" }}>· {p.dvp.g.toFixed(2)} G to {p.dvp.label}</span></> : "—"}
                  </td>
                  <td><H2HCell playerId={p.playerId} /></td>
                  {SKATER_H2H_COLS.map(([k, stat]) => <td key={k}><H2HStatCell playerId={p.playerId} stat={stat} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
